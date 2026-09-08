package api

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/tradermemos/api/internal/ocr"
	"github.com/tradermemos/api/internal/store"
)

const defaultEconomicCalendarAIPrompt = `You are analyzing economic calendar events for a trading journal. Explain the likely market impact in practical trading terms, including the affected currency, market sector, expected volatility, directional risk, and what a trader should watch before and after the event. Be concise, avoid certainty, and do not provide financial advice.`

type economicCalendarAISettingsDTO struct {
	Enabled       bool   `json:"enabled"`
	BaseURL       string `json:"base_url"`
	Model         string `json:"model"`
	CustomPrompt  string `json:"custom_prompt"`
	DefaultPrompt string `json:"default_prompt"`
	APIKeySet     bool   `json:"api_key_set"`
	APIKeyHint    string `json:"api_key_hint,omitempty"`
}

type economicCalendarAISettingsPutDTO struct {
	Enabled      bool    `json:"enabled"`
	BaseURL      string  `json:"base_url"`
	Model        string  `json:"model"`
	CustomPrompt string  `json:"custom_prompt"`
	APIKey       *string `json:"api_key"`
}

type economicCalendarAITestRequestDTO struct {
	BaseURL string  `json:"base_url"`
	Model   string  `json:"model"`
	APIKey  *string `json:"api_key"`
}

type economicCalendarAIModelsRequestDTO struct {
	BaseURL string  `json:"base_url"`
	APIKey  *string `json:"api_key"`
}

func (s *Server) handleGetEconomicCalendarAISettings(c *echo.Context) error {
	cfg := s.effectiveEconomicCalendarAIConfig(c.Request().Context())
	return c.JSON(http.StatusOK, toEconomicCalendarAISettingsDTO(cfg))
}

func (s *Server) handlePutEconomicCalendarAISettings(c *echo.Context) error {
	var in economicCalendarAISettingsPutDTO
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	in.BaseURL = strings.TrimSpace(in.BaseURL)
	in.Model = strings.TrimSpace(in.Model)
	in.CustomPrompt = strings.TrimSpace(in.CustomPrompt)
	if in.BaseURL == "" {
		return Fail(http.StatusBadRequest, "bad_request", "base_url is required", nil)
	}
	if !strings.HasPrefix(in.BaseURL, "http://") && !strings.HasPrefix(in.BaseURL, "https://") {
		return Fail(http.StatusBadRequest, "bad_request", "base_url must be http(s)", nil)
	}
	if in.Model == "" {
		in.Model = "gpt-4o-mini"
	}

	existingKey := ""
	if row, err := s.deps.Store.GetEconomicCalendarAISettings(c.Request().Context()); err == nil {
		existingKey = row.ApiKey
	} else if !errors.Is(err, sql.ErrNoRows) {
		return Fail(http.StatusInternalServerError, "internal", "could not load economic calendar AI settings", nil)
	} else if strings.TrimSpace(s.deps.CoachDefaults.APIKey) != "" {
		existingKey = s.deps.CoachDefaults.APIKey
	}

	apiKey := existingKey
	if in.APIKey != nil {
		if trimmed := strings.TrimSpace(*in.APIKey); trimmed != "" {
			apiKey = trimmed
		}
	}

	enabled := int64(0)
	if in.Enabled {
		enabled = 1
	}
	_, err := s.deps.Store.UpsertEconomicCalendarAISettings(c.Request().Context(), store.UpsertEconomicCalendarAISettingsParams{
		Enabled:      enabled,
		BaseUrl:      in.BaseURL,
		ApiKey:       apiKey,
		Model:        in.Model,
		CustomPrompt: in.CustomPrompt,
	})
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not save economic calendar AI settings", nil)
	}

	cfg := s.effectiveEconomicCalendarAIConfig(c.Request().Context())
	return c.JSON(http.StatusOK, toEconomicCalendarAISettingsDTO(cfg))
}

func (s *Server) handleTestEconomicCalendarAISettings(c *echo.Context) error {
	var in economicCalendarAITestRequestDTO
	_ = c.Bind(&in)
	cfg, err := s.economicCalendarAIConfigWithOverrides(c.Request().Context(), in.BaseURL, in.Model, in.APIKey)
	if err != nil {
		return Fail(http.StatusBadRequest, "bad_request", err.Error(), nil)
	}
	if !cfg.AuthReady() {
		return c.JSON(http.StatusOK, ocrTestResultDTO{
			OK:    false,
			Error: "set base URL and API key to test connection",
		})
	}
	if err := ocr.TestVisionConnection(c.Request().Context(), cfg); err != nil {
		return c.JSON(http.StatusOK, ocrTestResultDTO{OK: false, Error: err.Error()})
	}
	return c.JSON(http.StatusOK, ocrTestResultDTO{OK: true})
}

func (s *Server) handleListEconomicCalendarAIModels(c *echo.Context) error {
	var in economicCalendarAIModelsRequestDTO
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	cfg, err := s.economicCalendarAIConfigWithOverrides(c.Request().Context(), in.BaseURL, "", in.APIKey)
	if err != nil {
		return Fail(http.StatusBadRequest, "bad_request", err.Error(), nil)
	}
	if !cfg.AuthReady() {
		return c.JSON(http.StatusOK, ocrModelsResultDTO{
			Models: []string{},
			Error:  "set base URL and API key to fetch models",
		})
	}
	models, err := ocr.ListModels(c.Request().Context(), cfg)
	if err != nil {
		return c.JSON(http.StatusOK, ocrModelsResultDTO{Models: []string{}, Error: err.Error()})
	}
	return c.JSON(http.StatusOK, ocrModelsResultDTO{Models: models})
}

func (s *Server) economicCalendarAIConfigWithOverrides(ctx context.Context, baseURL, model string, apiKey *string) (ocr.VisionConfig, error) {
	cfg := s.effectiveEconomicCalendarAIConfig(ctx)
	if trimmed := strings.TrimSpace(baseURL); trimmed != "" {
		if !strings.HasPrefix(trimmed, "http://") && !strings.HasPrefix(trimmed, "https://") {
			return ocr.VisionConfig{}, errors.New("base_url must be http(s)")
		}
		cfg.BaseURL = trimmed
	}
	if trimmed := strings.TrimSpace(model); trimmed != "" {
		cfg.Model = trimmed
	}
	if apiKey != nil {
		if trimmed := strings.TrimSpace(*apiKey); trimmed != "" {
			cfg.APIKey = trimmed
			return cfg, nil
		}
	}
	if row, err := s.deps.Store.GetEconomicCalendarAISettings(ctx); err == nil && row.ApiKey != "" {
		cfg.APIKey = row.ApiKey
	} else if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return ocr.VisionConfig{}, err
	}
	return cfg, nil
}

func (s *Server) effectiveEconomicCalendarAIConfig(ctx context.Context) ocr.VisionConfig {
	cfg := s.deps.CoachDefaults
	if cfg.Model == "" {
		cfg.Model = "gpt-4o-mini"
	}
	row, err := s.deps.Store.GetEconomicCalendarAISettings(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return cfg
	}
	if err != nil {
		return cfg
	}
	return ocr.MergeVisionConfig(cfg, ocr.VisionConfig{
		Enabled:      row.Enabled != 0,
		BaseURL:      row.BaseUrl,
		APIKey:       row.ApiKey,
		Model:        row.Model,
		CustomPrompt: row.CustomPrompt,
	})
}

func toEconomicCalendarAISettingsDTO(cfg ocr.VisionConfig) economicCalendarAISettingsDTO {
	return economicCalendarAISettingsDTO{
		Enabled:       cfg.Enabled,
		BaseURL:       strings.TrimSpace(cfg.BaseURL),
		Model:         strings.TrimSpace(cfg.Model),
		CustomPrompt:  strings.TrimSpace(cfg.CustomPrompt),
		DefaultPrompt: defaultEconomicCalendarAIPrompt,
		APIKeySet:     strings.TrimSpace(cfg.APIKey) != "",
		APIKeyHint:    ocr.MaskAPIKeyHint(cfg.APIKey),
	}
}
