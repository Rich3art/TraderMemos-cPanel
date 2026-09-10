package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
	"uuid"

	"github.com/labstack/echo/v5"
	"github.com/tradermemos/api/internal/auth"
	"github.com/tradermemos/api/internal/db"
)

const (
	contentTitleMax   = 180
	contentSummaryMax = 500
	contentBodyMax    = 40000
	contentURLMax     = 800
	contentLabelMax   = 120
	contentTagsMax    = 500
)

var contentSlugAllowed = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

func (s *Server) contentRoutes(g *echo.Group) {
	g.GET("/content/pages/:slug", s.handleGetContentPage)
	admin := g.Group("/admin/content", s.requireAdmin)
	admin.PATCH("/pages/:slug", s.handleUpdateContentPage)
	admin.GET("/resources", s.handleListAdminResources)
	admin.POST("/resources", s.handleCreateResource)
	admin.PATCH("/resources/:id", s.handleUpdateResource)
	admin.DELETE("/resources/:id", s.handleDeleteResource)
	g.GET("/resources", s.handleListPublishedResources)
	g.GET("/resources/:slug", s.handleGetPublishedResource)
}

type contentLinkDTO struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

type contentPageDTO struct {
	Slug      string           `json:"slug"`
	Title     string           `json:"title"`
	Summary   string           `json:"summary"`
	Body      string           `json:"body"`
	ImageURL  string           `json:"image_url"`
	Links     []contentLinkDTO `json:"links"`
	UpdatedAt time.Time        `json:"updated_at"`
}

type contentPageBody struct {
	Title    string           `json:"title"`
	Summary  string           `json:"summary"`
	Body     string           `json:"body"`
	ImageURL string           `json:"image_url"`
	Links    []contentLinkDTO `json:"links"`
}

type resourceDTO struct {
	ID           string    `json:"id"`
	Slug         string    `json:"slug"`
	Title        string    `json:"title"`
	Excerpt      string    `json:"excerpt"`
	Body         string    `json:"body"`
	ImageURL     string    `json:"image_url"`
	Tags         string    `json:"tags"`
	DisplayOrder int64     `json:"display_order"`
	Published    bool      `json:"published"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type resourceBody struct {
	Slug         string `json:"slug"`
	Title        string `json:"title"`
	Excerpt      string `json:"excerpt"`
	Body         string `json:"body"`
	ImageURL     string `json:"image_url"`
	Tags         string `json:"tags"`
	DisplayOrder int64  `json:"display_order"`
	Published    bool   `json:"published"`
}

func contentDBUnavailable() error {
	return Fail(http.StatusServiceUnavailable, "unavailable", "database not configured", nil)
}

func (s *Server) contentSQL(query string) string {
	if s.deps.Driver != db.DriverPostgres {
		return query
	}
	var b strings.Builder
	arg := 1
	for _, r := range query {
		if r == '?' {
			b.WriteByte('$')
			b.WriteString(strconv.Itoa(arg))
			arg++
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

func cleanContentText(v string, maxLen int) string {
	v = strings.TrimSpace(v)
	if len(v) <= maxLen {
		return v
	}
	return strings.TrimSpace(v[:maxLen])
}

func cleanContentURL(v string) (string, bool) {
	v = cleanContentText(v, contentURLMax)
	if v == "" {
		return "", true
	}
	u, err := url.Parse(v)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", false
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return "", false
	}
	return u.String(), true
}

func contentPublishedFlag(v bool) int64 {
	if v {
		return 1
	}
	return 0
}

func makeContentSlug(title string) string {
	var b strings.Builder
	lastDash := false
	for _, r := range strings.ToLower(title) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash && b.Len() > 0 {
			b.WriteByte('-')
			lastDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func cleanContentSlug(v, fallbackTitle string) string {
	v = strings.ToLower(cleanContentText(v, 100))
	if v == "" {
		v = makeContentSlug(fallbackTitle)
	}
	if v == "" {
		v = "resource"
	}
	if !contentSlugAllowed.MatchString(v) {
		v = makeContentSlug(v)
	}
	if v == "" {
		v = "resource"
	}
	return v
}

func cleanContentLinks(in []contentLinkDTO) ([]contentLinkDTO, error) {
	out := make([]contentLinkDTO, 0, len(in))
	for _, item := range in {
		label := cleanContentText(item.Label, contentLabelMax)
		rawURL, ok := cleanContentURL(item.URL)
		if !ok {
			return nil, Fail(http.StatusBadRequest, "bad_request", "links must use http or https URLs", nil)
		}
		if label == "" || rawURL == "" {
			continue
		}
		out = append(out, contentLinkDTO{Label: label, URL: rawURL})
		if len(out) >= 12 {
			break
		}
	}
	return out, nil
}

func cleanContentPageBody(in contentPageBody) (contentPageBody, error) {
	out := contentPageBody{
		Title:   cleanContentText(in.Title, contentTitleMax),
		Summary: cleanContentText(in.Summary, contentSummaryMax),
		Body:    cleanContentText(in.Body, contentBodyMax),
	}
	if out.Title == "" {
		return out, Fail(http.StatusBadRequest, "bad_request", "title is required", nil)
	}
	var ok bool
	if out.ImageURL, ok = cleanContentURL(in.ImageURL); !ok {
		return out, Fail(http.StatusBadRequest, "bad_request", "image URL must be http or https", nil)
	}
	links, err := cleanContentLinks(in.Links)
	if err != nil {
		return out, err
	}
	out.Links = links
	return out, nil
}

func cleanResourceBody(in resourceBody) (resourceBody, error) {
	out := resourceBody{
		Title:        cleanContentText(in.Title, contentTitleMax),
		Excerpt:      cleanContentText(in.Excerpt, contentSummaryMax),
		Body:         cleanContentText(in.Body, contentBodyMax),
		Tags:         cleanContentText(in.Tags, contentTagsMax),
		DisplayOrder: in.DisplayOrder,
		Published:    in.Published,
	}
	if out.Title == "" {
		return out, Fail(http.StatusBadRequest, "bad_request", "title is required", nil)
	}
	out.Slug = cleanContentSlug(in.Slug, out.Title)
	var ok bool
	if out.ImageURL, ok = cleanContentURL(in.ImageURL); !ok {
		return out, Fail(http.StatusBadRequest, "bad_request", "image URL must be http or https", nil)
	}
	return out, nil
}

func scanContentPage(scanner interface {
	Scan(dest ...any) error
}) (contentPageDTO, error) {
	var dto contentPageDTO
	var linksJSON string
	if err := scanner.Scan(&dto.Slug, &dto.Title, &dto.Summary, &dto.Body, &dto.ImageURL, &linksJSON, &dto.UpdatedAt); err != nil {
		return dto, err
	}
	if err := json.Unmarshal([]byte(linksJSON), &dto.Links); err != nil {
		dto.Links = []contentLinkDTO{}
	}
	return dto, nil
}

func scanResource(scanner interface {
	Scan(dest ...any) error
}) (resourceDTO, error) {
	var dto resourceDTO
	var published int64
	if err := scanner.Scan(
		&dto.ID,
		&dto.Slug,
		&dto.Title,
		&dto.Excerpt,
		&dto.Body,
		&dto.ImageURL,
		&dto.Tags,
		&dto.DisplayOrder,
		&published,
		&dto.CreatedAt,
		&dto.UpdatedAt,
	); err != nil {
		return dto, err
	}
	dto.Published = published != 0
	return dto, nil
}

func (s *Server) handleGetContentPage(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	slug := cleanContentSlug(c.Param("slug"), "")
	row := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		SELECT slug, title, summary, body, image_url, links_json, updated_at
		FROM content_pages
		WHERE slug = ?
	`), slug)
	dto, err := scanContentPage(row)
	if err == sql.ErrNoRows {
		return Fail(http.StatusNotFound, "not_found", "content page not found", nil)
	}
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not load content page", nil)
	}
	return c.JSON(http.StatusOK, dto)
}

func (s *Server) handleUpdateContentPage(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	var in contentPageBody
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	body, err := cleanContentPageBody(in)
	if err != nil {
		return err
	}
	linksJSON, _ := json.Marshal(body.Links)
	slug := cleanContentSlug(c.Param("slug"), "")
	row := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		INSERT INTO content_pages (slug, title, summary, body, image_url, links_json, updated_by, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(slug) DO UPDATE SET
			title = excluded.title,
			summary = excluded.summary,
			body = excluded.body,
			image_url = excluded.image_url,
			links_json = excluded.links_json,
			updated_by = excluded.updated_by,
			updated_at = CURRENT_TIMESTAMP
		RETURNING slug, title, summary, body, image_url, links_json, updated_at
	`), slug, body.Title, body.Summary, body.Body, body.ImageURL, string(linksJSON), auth.UserID(c))
	dto, err := scanContentPage(row)
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not update content page", nil)
	}
	return c.JSON(http.StatusOK, dto)
}

func (s *Server) listResources(c *echo.Context, includeDrafts bool) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	query := `
		SELECT id, slug, title, excerpt, body, image_url, tags, display_order, published, created_at, updated_at
		FROM resource_posts
	`
	if !includeDrafts {
		query += " WHERE published = 1"
	}
	query += " ORDER BY display_order ASC, created_at DESC"
	rows, err := s.deps.DB.QueryContext(c.Request().Context(), s.contentSQL(query))
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not list resources", nil)
	}
	defer rows.Close()
	out := []resourceDTO{}
	for rows.Next() {
		dto, err := scanResource(rows)
		if err != nil {
			return Fail(http.StatusInternalServerError, "internal", "could not read resources", nil)
		}
		out = append(out, dto)
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) handleListPublishedResources(c *echo.Context) error {
	return s.listResources(c, false)
}

func (s *Server) handleListAdminResources(c *echo.Context) error {
	return s.listResources(c, true)
}

func (s *Server) handleGetPublishedResource(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	row := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		SELECT id, slug, title, excerpt, body, image_url, tags, display_order, published, created_at, updated_at
		FROM resource_posts
		WHERE slug = ? AND published = 1
	`), cleanContentSlug(c.Param("slug"), ""))
	dto, err := scanResource(row)
	if err == sql.ErrNoRows {
		return Fail(http.StatusNotFound, "not_found", "resource not found", nil)
	}
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not load resource", nil)
	}
	return c.JSON(http.StatusOK, dto)
}

func (s *Server) handleCreateResource(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	var in resourceBody
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	body, err := cleanResourceBody(in)
	if err != nil {
		return err
	}
	row := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		INSERT INTO resource_posts (id, slug, title, excerpt, body, image_url, tags, display_order, published, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		RETURNING id, slug, title, excerpt, body, image_url, tags, display_order, published, created_at, updated_at
	`), uuid.New().String(), body.Slug, body.Title, body.Excerpt, body.Body, body.ImageURL, body.Tags, body.DisplayOrder, contentPublishedFlag(body.Published), auth.UserID(c))
	dto, err := scanResource(row)
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not create resource", nil)
	}
	return c.JSON(http.StatusCreated, dto)
}

func (s *Server) handleUpdateResource(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	var in resourceBody
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	body, err := cleanResourceBody(in)
	if err != nil {
		return err
	}
	row := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		UPDATE resource_posts SET
			slug = ?,
			title = ?,
			excerpt = ?,
			body = ?,
			image_url = ?,
			tags = ?,
			display_order = ?,
			published = ?,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
		RETURNING id, slug, title, excerpt, body, image_url, tags, display_order, published, created_at, updated_at
	`), body.Slug, body.Title, body.Excerpt, body.Body, body.ImageURL, body.Tags, body.DisplayOrder, contentPublishedFlag(body.Published), c.Param("id"))
	dto, err := scanResource(row)
	if err == sql.ErrNoRows {
		return Fail(http.StatusNotFound, "not_found", "resource not found", nil)
	}
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not update resource", nil)
	}
	return c.JSON(http.StatusOK, dto)
}

func (s *Server) handleDeleteResource(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	res, err := s.deps.DB.ExecContext(c.Request().Context(), s.contentSQL(`DELETE FROM resource_posts WHERE id = ?`), c.Param("id"))
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not delete resource", nil)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return Fail(http.StatusNotFound, "not_found", "resource not found", nil)
	}
	return c.NoContent(http.StatusNoContent)
}
