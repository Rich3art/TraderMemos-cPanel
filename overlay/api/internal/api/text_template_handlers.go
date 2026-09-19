package api

import (
	"database/sql"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
	"uuid"

	"github.com/labstack/echo/v5"
	"github.com/tradermemos/api/internal/auth"
)

const (
	textTemplateNameMax = 120
	textTemplateBodyMax = 40000
	textTemplateScopeMax = 40
)

type textTemplateDTO struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Body      string    `json:"body"`
	Scope     string    `json:"scope"`
	Favorite  bool      `json:"favorite"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type textTemplateBody struct {
	Name     string `json:"name"`
	Body     string `json:"body"`
	Scope    string `json:"scope"`
	Favorite bool   `json:"favorite"`
}

func (s *Server) textTemplateRoutes(g *echo.Group) {
	g.GET("/text-templates", s.handleListTextTemplates)
	g.POST("/text-templates", s.handleCreateTextTemplate)
	g.PATCH("/text-templates/:id", s.handleUpdateTextTemplate)
	g.DELETE("/text-templates/:id", s.handleDeleteTextTemplate)
}

func cleanTemplateText(v string, maxLen int) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return ""
	}
	var b strings.Builder
	for _, r := range v {
		if r == '\n' || r == '\r' || r == '\t' || r >= 0x20 {
			b.WriteRune(r)
		}
	}
	out := strings.TrimSpace(b.String())
	for len(out) > maxLen && len(out) > 0 {
		_, size := utf8.DecodeLastRuneInString(out)
		out = out[:len(out)-size]
	}
	return strings.TrimSpace(out)
}

func cleanTemplateScope(v string) string {
	v = strings.ToLower(cleanTemplateText(v, textTemplateScopeMax))
	switch v {
	case "journal", "trade", "setup", "general":
		return v
	default:
		return "general"
	}
}

func cleanTemplateBody(in textTemplateBody) (textTemplateBody, error) {
	out := textTemplateBody{
		Name:     cleanTemplateText(in.Name, textTemplateNameMax),
		Body:     cleanTemplateText(in.Body, textTemplateBodyMax),
		Scope:    cleanTemplateScope(in.Scope),
		Favorite: in.Favorite,
	}
	if out.Name == "" {
		return out, Fail(http.StatusBadRequest, "bad_request", "template name is required", nil)
	}
	if out.Body == "" {
		return out, Fail(http.StatusBadRequest, "bad_request", "template body is required", nil)
	}
	return out, nil
}

func scanTextTemplate(row interface{ Scan(dest ...any) error }) (textTemplateDTO, error) {
	var dto textTemplateDTO
	err := row.Scan(&dto.ID, &dto.Name, &dto.Body, &dto.Scope, &dto.Favorite, &dto.CreatedAt, &dto.UpdatedAt)
	return dto, err
}

func (s *Server) handleListTextTemplates(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	rows, err := s.deps.DB.QueryContext(c.Request().Context(), s.contentSQL(`
SELECT id, name, body, scope, favorite, created_at, updated_at
FROM text_templates
WHERE user_id = ?
ORDER BY favorite DESC, updated_at DESC`), auth.UserID(c))
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not list templates", nil)
	}
	defer rows.Close()
	out := []textTemplateDTO{}
	for rows.Next() {
		dto, err := scanTextTemplate(rows)
		if err != nil {
			return Fail(http.StatusInternalServerError, "internal", "could not read templates", nil)
		}
		out = append(out, dto)
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) handleCreateTextTemplate(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	var in textTemplateBody
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	body, err := cleanTemplateBody(in)
	if err != nil {
		return err
	}
	id := uuid.New().String()
	dto, err := scanTextTemplate(s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
INSERT INTO text_templates (id, user_id, name, body, scope, favorite, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
RETURNING id, name, body, scope, favorite, created_at, updated_at`),
		id, auth.UserID(c), body.Name, body.Body, body.Scope, body.Favorite))
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not create template", nil)
	}
	return c.JSON(http.StatusCreated, dto)
}

func (s *Server) handleUpdateTextTemplate(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	var in textTemplateBody
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	body, err := cleanTemplateBody(in)
	if err != nil {
		return err
	}
	dto, err := scanTextTemplate(s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
UPDATE text_templates
SET name = ?, body = ?, scope = ?, favorite = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ? AND user_id = ?
RETURNING id, name, body, scope, favorite, created_at, updated_at`),
		body.Name, body.Body, body.Scope, body.Favorite, c.Param("id"), auth.UserID(c)))
	if err != nil {
		if err == sql.ErrNoRows {
			return Fail(http.StatusNotFound, "not_found", "template not found", nil)
		}
		return Fail(http.StatusInternalServerError, "internal", "could not update template", nil)
	}
	return c.JSON(http.StatusOK, dto)
}

func (s *Server) handleDeleteTextTemplate(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	res, err := s.deps.DB.ExecContext(c.Request().Context(), s.contentSQL(
		`DELETE FROM text_templates WHERE id = ? AND user_id = ?`,
	), c.Param("id"), auth.UserID(c))
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not delete template", nil)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Fail(http.StatusNotFound, "not_found", "template not found", nil)
	}
	return c.NoContent(http.StatusNoContent)
}
