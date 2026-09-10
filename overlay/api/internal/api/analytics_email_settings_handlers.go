package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/tradermemos/api/internal/auth"
	"github.com/tradermemos/api/internal/store"
)

var allowedAnalyticsEmailMetrics = map[string]bool{
	"net_pnl":       true,
	"total_trades":  true,
	"win_rate":      true,
	"profit_factor": true,
	"avg_trade":     true,
	"avg_win":       true,
	"avg_loss":      true,
	"largest_win":   true,
	"largest_loss":  true,
	"expectancy":    true,
	"total_fees":    true,
	"max_drawdown":  true,
}

var defaultAnalyticsEmailMetrics = []string{"net_pnl", "total_trades", "win_rate", "profit_factor", "avg_trade", "max_drawdown"}

type analyticsEmailSettingsDTO struct {
	Enabled   bool     `json:"enabled"`
	Email     string   `json:"email"`
	Timezone  string   `json:"timezone"`
	Daily     bool     `json:"daily"`
	Weekly    bool     `json:"weekly"`
	Monthly   bool     `json:"monthly"`
	Metrics   []string `json:"metrics"`
	UpdatedAt string   `json:"updated_at,omitempty"`
}

func (s *Server) analyticsEmailSettingsRoutes(g *echo.Group) {
	g.GET("/settings/analytics-emails", s.handleGetAnalyticsEmailSettings)
	g.PUT("/settings/analytics-emails", s.handlePutAnalyticsEmailSettings)
}

func (s *Server) handleGetAnalyticsEmailSettings(c *echo.Context) error {
	row, err := s.deps.Store.GetAnalyticsEmailSettings(c.Request().Context(), auth.UserID(c))
	if errors.Is(err, sql.ErrNoRows) {
		return c.JSON(http.StatusOK, analyticsEmailSettingsDTO{
			Timezone: "UTC",
			Metrics:  defaultAnalyticsEmailMetrics,
		})
	}
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not load analytics email settings", nil)
	}
	return c.JSON(http.StatusOK, toAnalyticsEmailSettingsDTO(row))
}

func (s *Server) handlePutAnalyticsEmailSettings(c *echo.Context) error {
	var in analyticsEmailSettingsDTO
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	params, err := normalizeAnalyticsEmailSettings(auth.UserID(c), in)
	if err != nil {
		return Fail(http.StatusBadRequest, "bad_request", err.Error(), nil)
	}
	row, err := s.deps.Store.UpsertAnalyticsEmailSettings(c.Request().Context(), params)
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not save analytics email settings", nil)
	}
	return c.JSON(http.StatusOK, toAnalyticsEmailSettingsDTO(row))
}

func normalizeAnalyticsEmailSettings(userID string, in analyticsEmailSettingsDTO) (store.UpsertAnalyticsEmailSettingsParams, error) {
	email := strings.TrimSpace(in.Email)
	tz := strings.TrimSpace(in.Timezone)
	if tz == "" {
		tz = "UTC"
	}
	if _, err := time.LoadLocation(tz); err != nil {
		return store.UpsertAnalyticsEmailSettingsParams{}, errors.New("timezone is invalid")
	}
	if in.Enabled {
		if email == "" {
			return store.UpsertAnalyticsEmailSettingsParams{}, errors.New("email is required when analytics emails are enabled")
		}
		if _, err := mail.ParseAddress(email); err != nil {
			return store.UpsertAnalyticsEmailSettingsParams{}, errors.New("email must be valid")
		}
		if !in.Daily && !in.Weekly && !in.Monthly {
			return store.UpsertAnalyticsEmailSettingsParams{}, errors.New("select at least one schedule")
		}
	}
	if len(email) > 255 || len(tz) > 80 {
		return store.UpsertAnalyticsEmailSettingsParams{}, errors.New("one or more fields is too long")
	}
	metrics := normalizeAnalyticsMetrics(in.Metrics)
	b, _ := json.Marshal(metrics)
	return store.UpsertAnalyticsEmailSettingsParams{
		UserID:      userID,
		Enabled:     boolInt(in.Enabled),
		Email:       email,
		Timezone:    tz,
		Daily:       boolInt(in.Daily),
		Weekly:      boolInt(in.Weekly),
		Monthly:     boolInt(in.Monthly),
		MetricsJson: string(b),
	}, nil
}

func normalizeAnalyticsMetrics(in []string) []string {
	if len(in) == 0 {
		return append([]string(nil), defaultAnalyticsEmailMetrics...)
	}
	out := []string{}
	seen := map[string]bool{}
	for _, raw := range in {
		key := strings.TrimSpace(raw)
		if !allowedAnalyticsEmailMetrics[key] || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, key)
	}
	if len(out) == 0 {
		return append([]string(nil), defaultAnalyticsEmailMetrics...)
	}
	return out
}

func toAnalyticsEmailSettingsDTO(row store.AnalyticsEmailSetting) analyticsEmailSettingsDTO {
	metrics := []string{}
	_ = json.Unmarshal([]byte(row.MetricsJson), &metrics)
	if len(metrics) == 0 {
		metrics = defaultAnalyticsEmailMetrics
	}
	return analyticsEmailSettingsDTO{
		Enabled:   row.Enabled == 1,
		Email:     row.Email,
		Timezone:  row.Timezone,
		Daily:     row.Daily == 1,
		Weekly:    row.Weekly == 1,
		Monthly:   row.Monthly == 1,
		Metrics:   normalizeAnalyticsMetrics(metrics),
		UpdatedAt: row.UpdatedAt.Format(time.RFC3339),
	}
}

func boolInt(v bool) int64 {
	if v {
		return 1
	}
	return 0
}
