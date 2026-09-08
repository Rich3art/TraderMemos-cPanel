package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/tradermemos/api/internal/auth"
	"github.com/tradermemos/api/internal/store"
)

const maxChartAnnotationBytes = 256 * 1024

type chartAnnotationDTO struct {
	EntityType string          `json:"entity_type"`
	EntityID   string          `json:"entity_id"`
	Symbol     string          `json:"symbol"`
	Interval   string          `json:"interval"`
	Drawings   json.RawMessage `json:"drawings"`
	UpdatedAt  time.Time       `json:"updated_at"`
}

type chartAnnotationBody struct {
	Symbol   string          `json:"symbol"`
	Interval string          `json:"interval"`
	Drawings json.RawMessage `json:"drawings"`
}

func normalizeChartAnnotationEntityType(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "setup", "trade", "playbook", "analysis":
		return strings.ToLower(strings.TrimSpace(v))
	default:
		return ""
	}
}

func normalizeChartAnnotationKey(v string) string {
	return strings.TrimSpace(v)
}

func normalizeChartAnnotationSymbol(v string) string {
	return strings.ToUpper(strings.TrimSpace(v))
}

func normalizeChartAnnotationInterval(v string) string {
	return strings.TrimSpace(v)
}

func normalizeChartAnnotationDrawings(raw json.RawMessage) (string, error) {
	if len(raw) == 0 {
		return "[]", nil
	}
	if len(raw) > maxChartAnnotationBytes {
		return "", errors.New("annotation payload is too large")
	}
	var decoded any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return "", errors.New("drawings must be valid JSON")
	}
	if _, ok := decoded.([]any); !ok {
		return "", errors.New("drawings must be a JSON array")
	}
	return string(raw), nil
}

func (s *Server) canAccessChartAnnotationEntity(c *echo.Context, userID, entityType, entityID string) bool {
	switch entityType {
	case "setup", "playbook":
		_, err := s.deps.Store.GetSetup(c.Request().Context(), store.GetSetupParams{ID: entityID, UserID: userID})
		return err == nil
	case "trade":
		_, err := s.deps.Store.GetTrade(c.Request().Context(), store.GetTradeParams{ID: entityID, UserID: userID})
		return err == nil
	case "analysis":
		return entityID != ""
	default:
		return false
	}
}

func emptyChartAnnotationDTO(entityType, entityID, symbol, interval string) chartAnnotationDTO {
	return chartAnnotationDTO{
		EntityType: entityType,
		EntityID:   entityID,
		Symbol:     symbol,
		Interval:   interval,
		Drawings:   json.RawMessage("[]"),
	}
}

func toChartAnnotationDTO(row store.ChartAnnotation) chartAnnotationDTO {
	drawings := json.RawMessage(row.Drawings)
	if !json.Valid(drawings) {
		drawings = json.RawMessage("[]")
	}
	return chartAnnotationDTO{
		EntityType: row.EntityType,
		EntityID:   row.EntityID,
		Symbol:     row.Symbol,
		Interval:   row.Interval,
		Drawings:   drawings,
		UpdatedAt:  row.UpdatedAt,
	}
}

func (s *Server) handleGetChartAnnotation(c *echo.Context) error {
	uid := auth.UserID(c)
	entityType := normalizeChartAnnotationEntityType(c.Param("entity_type"))
	entityID := normalizeChartAnnotationKey(c.Param("entity_id"))
	symbol := normalizeChartAnnotationSymbol(c.QueryParam("symbol"))
	interval := normalizeChartAnnotationInterval(c.QueryParam("interval"))
	if entityType == "" || entityID == "" || symbol == "" || interval == "" {
		return Fail(http.StatusBadRequest, "bad_request", "entity, symbol, and interval are required", nil)
	}
	if !s.canAccessChartAnnotationEntity(c, uid, entityType, entityID) {
		return Fail(http.StatusNotFound, "not_found", "chart annotations not found", nil)
	}
	row, err := s.deps.Store.GetChartAnnotation(c.Request().Context(), store.GetChartAnnotationParams{
		UserID: uid, EntityType: entityType, EntityID: entityID, Symbol: symbol, Interval: interval,
	})
	if errors.Is(err, sql.ErrNoRows) {
		return c.JSON(http.StatusOK, emptyChartAnnotationDTO(entityType, entityID, symbol, interval))
	}
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not load chart annotations", nil)
	}
	return c.JSON(http.StatusOK, toChartAnnotationDTO(row))
}

func (s *Server) handlePutChartAnnotation(c *echo.Context) error {
	uid := auth.UserID(c)
	entityType := normalizeChartAnnotationEntityType(c.Param("entity_type"))
	entityID := normalizeChartAnnotationKey(c.Param("entity_id"))
	if entityType == "" || entityID == "" {
		return Fail(http.StatusBadRequest, "bad_request", "entity is required", nil)
	}
	if !s.canAccessChartAnnotationEntity(c, uid, entityType, entityID) {
		return Fail(http.StatusNotFound, "not_found", "chart annotations not found", nil)
	}
	var in chartAnnotationBody
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	symbol := normalizeChartAnnotationSymbol(in.Symbol)
	interval := normalizeChartAnnotationInterval(in.Interval)
	if symbol == "" || interval == "" {
		return Fail(http.StatusBadRequest, "bad_request", "symbol and interval are required", nil)
	}
	drawings, err := normalizeChartAnnotationDrawings(in.Drawings)
	if err != nil {
		return Fail(http.StatusBadRequest, "bad_request", err.Error(), nil)
	}
	row, err := s.deps.Store.UpsertChartAnnotation(c.Request().Context(), store.UpsertChartAnnotationParams{
		UserID: uid, EntityType: entityType, EntityID: entityID, Symbol: symbol, Interval: interval, Drawings: drawings,
	})
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not save chart annotations", nil)
	}
	return c.JSON(http.StatusOK, toChartAnnotationDTO(row))
}
