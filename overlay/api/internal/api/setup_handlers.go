package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"
	"uuid"

	"github.com/labstack/echo/v5"
	"github.com/tradermemos/api/internal/auth"
	"github.com/tradermemos/api/internal/store"
)

func (s *Server) setupRoutes(g *echo.Group) {
	g.POST("/setups", s.handleCreateSetup)
	g.GET("/setups", s.handleListSetups)
	g.GET("/setups/:id", s.handleGetSetup)
	g.PATCH("/setups/:id", s.handleUpdateSetup)
	g.DELETE("/setups/:id", s.handleDeleteSetup)
	g.POST("/setups/:id/attachments", s.handleUploadSetupAttachment)
	g.GET("/setups/:id/attachments", s.handleListSetupAttachments)
	g.GET("/setup-attachments/:id/file", s.handleGetSetupAttachmentFile)
	g.DELETE("/setup-attachments/:id", s.handleDeleteSetupAttachment)
}

type setupDTO struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	Thesis      string    `json:"thesis"`
	Symbol      string    `json:"symbol"`
	Direction   string    `json:"direction"`
	TargetPrice *float64  `json:"target_price"`
	StopPrice   *float64  `json:"stop_price"`
	Checklist   []string  `json:"checklist"`
	Attachments []setupAttachmentDTO `json:"attachments,omitempty"`
}

type setupAttachmentDTO struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	SetupID     string    `json:"setup_id"`
	Filename    string    `json:"filename"`
	ContentType string    `json:"content_type"`
	SizeBytes   int64     `json:"size_bytes"`
	StorageKey  string    `json:"storage_key"`
	CreatedAt   time.Time `json:"created_at"`
}

type setupBody struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Thesis      string   `json:"thesis"`
	Symbol      string   `json:"symbol"`
	Direction   string   `json:"direction"`
	TargetPrice *float64 `json:"target_price"`
	StopPrice   *float64 `json:"stop_price"`
	Checklist   []string `json:"checklist"`
}

func toSetupDTO(s store.Setup) setupDTO {
	items := parseChecklist(s.Checklist)
	return setupDTO{
		ID:          s.ID,
		UserID:      s.UserID,
		Name:        s.Name,
		Description: s.Description,
		CreatedAt:   s.CreatedAt,
		Thesis:      s.Thesis,
		Symbol:      s.Symbol,
		Direction:   s.Direction,
		TargetPrice: fptr(s.TargetPrice),
		StopPrice:   fptr(s.StopPrice),
		Checklist:   items,
	}
}

func (s *Server) toSetupDTOWithAttachments(ctx context.Context, setup store.Setup) setupDTO {
	dto := toSetupDTO(setup)
	rows, err := s.deps.Store.ListAttachmentsForSetup(ctx, store.ListAttachmentsForSetupParams{
		SetupID: setup.ID, UserID: setup.UserID,
	})
	if err == nil && rows != nil {
		dto.Attachments = toSetupAttachmentDTOs(rows)
	}
	return dto
}

func toSetupAttachmentDTO(a store.SetupAttachment) setupAttachmentDTO {
	return setupAttachmentDTO{
		ID: a.ID, UserID: a.UserID, SetupID: a.SetupID, Filename: a.Filename,
		ContentType: a.ContentType, SizeBytes: a.SizeBytes, StorageKey: a.StorageKey,
		CreatedAt: a.CreatedAt,
	}
}

func toSetupAttachmentDTOs(rows []store.SetupAttachment) []setupAttachmentDTO {
	out := make([]setupAttachmentDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, toSetupAttachmentDTO(row))
	}
	return out
}

func parseChecklist(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []string{}
	}
	var items []string
	if err := json.Unmarshal([]byte(raw), &items); err != nil {
		return []string{}
	}
	if items == nil {
		return []string{}
	}
	return items
}

func encodeChecklist(items []string) string {
	if items == nil {
		items = []string{}
	}
	b, err := json.Marshal(items)
	if err != nil {
		return "[]"
	}
	return string(b)
}

func normalizeDirection(d string) string {
	switch strings.ToLower(strings.TrimSpace(d)) {
	case "long":
		return "long"
	case "short":
		return "short"
	default:
		return ""
	}
}

func (s *Server) handleCreateSetup(c *echo.Context) error {
	var in setupBody
	if err := c.Bind(&in); err != nil || strings.TrimSpace(in.Name) == "" {
		return Fail(http.StatusBadRequest, "bad_request", "name is required", nil)
	}
	setup, err := s.deps.Store.CreateSetup(c.Request().Context(), store.CreateSetupParams{
		ID:          uuid.New().String(),
		UserID:      auth.UserID(c),
		Name:        strings.TrimSpace(in.Name),
		Description: in.Description,
		Thesis:      in.Thesis,
		Symbol:      strings.ToUpper(strings.TrimSpace(in.Symbol)),
		Direction:   normalizeDirection(in.Direction),
		TargetPrice: nullF(in.TargetPrice),
		StopPrice:   nullF(in.StopPrice),
		Checklist:   encodeChecklist(in.Checklist),
	})
	if err != nil {
		return Fail(http.StatusConflict, "conflict", "could not create setup (duplicate name?)", nil)
	}
	return c.JSON(http.StatusCreated, s.toSetupDTOWithAttachments(c.Request().Context(), setup))
}

func (s *Server) handleListSetups(c *echo.Context) error {
	rows, err := s.deps.Store.ListSetups(c.Request().Context(), auth.UserID(c))
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not list setups", nil)
	}
	out := make([]setupDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, s.toSetupDTOWithAttachments(c.Request().Context(), r))
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) handleGetSetup(c *echo.Context) error {
	setup, err := s.deps.Store.GetSetup(c.Request().Context(), store.GetSetupParams{
		ID: c.Param("id"), UserID: auth.UserID(c),
	})
	if err != nil {
		return Fail(http.StatusNotFound, "not_found", "setup not found", nil)
	}
	return c.JSON(http.StatusOK, s.toSetupDTOWithAttachments(c.Request().Context(), setup))
}

func (s *Server) handleUpdateSetup(c *echo.Context) error {
	var in setupBody
	if err := c.Bind(&in); err != nil || strings.TrimSpace(in.Name) == "" {
		return Fail(http.StatusBadRequest, "bad_request", "name is required", nil)
	}
	userID := auth.UserID(c)
	id := c.Param("id")
	if err := s.deps.Store.UpdateSetup(c.Request().Context(), store.UpdateSetupParams{
		Name:        strings.TrimSpace(in.Name),
		Description: in.Description,
		Thesis:      in.Thesis,
		Symbol:      strings.ToUpper(strings.TrimSpace(in.Symbol)),
		Direction:   normalizeDirection(in.Direction),
		TargetPrice: nullF(in.TargetPrice),
		StopPrice:   nullF(in.StopPrice),
		Checklist:   encodeChecklist(in.Checklist),
		ID:          id,
		UserID:      userID,
	}); err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not update setup", nil)
	}
	setup, err := s.deps.Store.GetSetup(c.Request().Context(), store.GetSetupParams{ID: id, UserID: userID})
	if err != nil {
		return Fail(http.StatusNotFound, "not_found", "setup not found", nil)
	}
	return c.JSON(http.StatusOK, s.toSetupDTOWithAttachments(c.Request().Context(), setup))
}

func (s *Server) handleDeleteSetup(c *echo.Context) error {
	ctx := c.Request().Context()
	uid := auth.UserID(c)
	rows, _ := s.deps.Store.ListAttachmentsForSetup(ctx, store.ListAttachmentsForSetupParams{
		SetupID: c.Param("id"), UserID: uid,
	})
	n, err := s.deps.Store.DeleteSetup(ctx, store.DeleteSetupParams{
		ID: c.Param("id"), UserID: auth.UserID(c),
	})
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not delete setup", nil)
	}
	if n == 0 {
		return Fail(http.StatusNotFound, "not_found", "setup not found", nil)
	}
	for _, att := range rows {
		_ = s.deps.Storage.Delete(att.StorageKey)
	}
	return c.NoContent(http.StatusNoContent)
}

func (s *Server) ownsSetup(c *echo.Context, userID, setupID string) error {
	_, err := s.deps.Store.GetSetup(c.Request().Context(), store.GetSetupParams{ID: setupID, UserID: userID})
	return err
}

func (s *Server) handleUploadSetupAttachment(c *echo.Context) error {
	ctx := c.Request().Context()
	uid := auth.UserID(c)
	setupID := c.Param("id")
	if err := s.ownsSetup(c, uid, setupID); err != nil {
		return Fail(http.StatusNotFound, "not_found", "setup not found", nil)
	}
	fh, err := c.FormFile("file")
	if err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "file is required", nil)
	}
	if s.deps.AttachMaxBytes > 0 && fh.Size > s.deps.AttachMaxBytes {
		return Fail(http.StatusRequestEntityTooLarge, "too_large", "attachment exceeds size limit", nil)
	}
	src, err := fh.Open()
	if err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "could not read file", nil)
	}
	defer src.Close()

	ct, body, err := sniffImageContentType(src, fh.Header.Get("Content-Type"))
	if err != nil {
		return Fail(http.StatusBadRequest, "bad_request", err.Error(), nil)
	}

	id := uuid.New().String()
	key := uid + "/setups/" + id
	if err := s.deps.Storage.Put(key, body); err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not store attachment", nil)
	}
	att, err := s.deps.Store.InsertSetupAttachment(ctx, store.InsertSetupAttachmentParams{
		ID: id, UserID: uid, SetupID: setupID, Filename: fh.Filename,
		ContentType: ct, SizeBytes: fh.Size, StorageKey: key,
	})
	if err != nil {
		_ = s.deps.Storage.Delete(key)
		return Fail(http.StatusInternalServerError, "internal", "could not record attachment", nil)
	}
	return c.JSON(http.StatusCreated, toSetupAttachmentDTO(att))
}

func (s *Server) handleListSetupAttachments(c *echo.Context) error {
	uid := auth.UserID(c)
	setupID := c.Param("id")
	if err := s.ownsSetup(c, uid, setupID); err != nil {
		return Fail(http.StatusNotFound, "not_found", "setup not found", nil)
	}
	rows, err := s.deps.Store.ListAttachmentsForSetup(c.Request().Context(), store.ListAttachmentsForSetupParams{
		SetupID: setupID, UserID: uid,
	})
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not list attachments", nil)
	}
	if rows == nil {
		rows = []store.SetupAttachment{}
	}
	return c.JSON(http.StatusOK, toSetupAttachmentDTOs(rows))
}

func (s *Server) handleGetSetupAttachmentFile(c *echo.Context) error {
	att, err := s.deps.Store.GetSetupAttachment(c.Request().Context(), store.GetSetupAttachmentParams{
		ID: c.Param("id"), UserID: auth.UserID(c),
	})
	if err != nil {
		return Fail(http.StatusNotFound, "not_found", "attachment not found", nil)
	}
	r, err := s.deps.Storage.Get(att.StorageKey)
	if err != nil {
		return Fail(http.StatusNotFound, "not_found", "file missing", nil)
	}
	defer r.Close()
	return c.Stream(http.StatusOK, att.ContentType, r)
}

func (s *Server) handleDeleteSetupAttachment(c *echo.Context) error {
	ctx := c.Request().Context()
	uid := auth.UserID(c)
	att, err := s.deps.Store.GetSetupAttachment(ctx, store.GetSetupAttachmentParams{ID: c.Param("id"), UserID: uid})
	if err != nil {
		return Fail(http.StatusNotFound, "not_found", "attachment not found", nil)
	}
	_ = s.deps.Storage.Delete(att.StorageKey)
	if _, err := s.deps.Store.DeleteSetupAttachment(ctx, store.DeleteSetupAttachmentParams{ID: att.ID, UserID: uid}); err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not delete attachment", nil)
	}
	return c.NoContent(http.StatusNoContent)
}
