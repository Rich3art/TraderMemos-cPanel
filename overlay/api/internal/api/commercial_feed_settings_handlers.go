package api

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/url"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/tradermemos/api/internal/ocr"
	"github.com/tradermemos/api/internal/store"
)

const (
	commercialFeedProviderPublic = "public"
	commercialFeedProviderPaid   = "paid"
)

type commercialFeedSettingsDTO struct {
	NewsProvider string `json:"news_provider"`
	PaidProvider string `json:"paid_provider"`
	APIBaseURL   string `json:"api_base_url"`
	LicenseNote  string `json:"license_note"`
	APIKeySet    bool   `json:"api_key_set"`
	APIKeyHint   string `json:"api_key_hint,omitempty"`
}

type commercialFeedSettingsPutDTO struct {
	NewsProvider string  `json:"news_provider"`
	PaidProvider string  `json:"paid_provider"`
	APIBaseURL   string  `json:"api_base_url"`
	APIKey       *string `json:"api_key"`
	LicenseNote  string  `json:"license_note"`
}

func (s *Server) handleGetCommercialFeedSettings(c *echo.Context) error {
	row, err := s.deps.Store.GetCommercialFeedSettings(c.Request().Context())
	if errors.Is(err, sql.ErrNoRows) {
		return c.JSON(http.StatusOK, toCommercialFeedSettingsDTO(defaultCommercialFeedSettings()))
	}
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not load commercial feed settings", nil)
	}
	return c.JSON(http.StatusOK, toCommercialFeedSettingsDTO(row))
}

func (s *Server) handlePutCommercialFeedSettings(c *echo.Context) error {
	var in commercialFeedSettingsPutDTO
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	normalized, err := normalizeCommercialFeedSettings(c.Request().Context(), s.deps.Store, in)
	if err != nil {
		return Fail(http.StatusBadRequest, "bad_request", err.Error(), nil)
	}
	row, err := s.deps.Store.UpsertCommercialFeedSettings(c.Request().Context(), normalized)
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not save commercial feed settings", nil)
	}
	return c.JSON(http.StatusOK, toCommercialFeedSettingsDTO(row))
}

func defaultCommercialFeedSettings() store.CommercialFeedSetting {
	return store.CommercialFeedSetting{
		ID:           1,
		NewsProvider: commercialFeedProviderPublic,
		PaidProvider: "",
		ApiBaseUrl:   "",
		ApiKey:       "",
		LicenseNote:  "",
	}
}

func normalizeCommercialFeedSettings(ctx context.Context, q store.Querier, in commercialFeedSettingsPutDTO) (store.UpsertCommercialFeedSettingsParams, error) {
	newsProvider := strings.TrimSpace(strings.ToLower(in.NewsProvider))
	if newsProvider == "" {
		newsProvider = commercialFeedProviderPublic
	}
	if newsProvider != commercialFeedProviderPublic && newsProvider != commercialFeedProviderPaid {
		return store.UpsertCommercialFeedSettingsParams{}, errors.New("news_provider must be public or paid")
	}

	paidProvider := strings.TrimSpace(strings.ToLower(in.PaidProvider))
	if paidProvider != "" && !allowedCommercialPaidProvider(paidProvider) {
		return store.UpsertCommercialFeedSettingsParams{}, errors.New("paid_provider is not supported")
	}
	apiBaseURL := strings.TrimSpace(in.APIBaseURL)
	if apiBaseURL != "" {
		if len(apiBaseURL) > 512 {
			return store.UpsertCommercialFeedSettingsParams{}, errors.New("api_base_url is too long")
		}
		parsed, err := url.Parse(apiBaseURL)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") {
			return store.UpsertCommercialFeedSettingsParams{}, errors.New("api_base_url must be a valid http(s) URL")
		}
	}
	licenseNote := strings.TrimSpace(in.LicenseNote)
	if len(licenseNote) > 1000 {
		return store.UpsertCommercialFeedSettingsParams{}, errors.New("license_note is too long")
	}

	apiKey := ""
	if existing, err := q.GetCommercialFeedSettings(ctx); err == nil {
		apiKey = existing.ApiKey
	} else if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return store.UpsertCommercialFeedSettingsParams{}, errors.New("could not load existing commercial feed settings")
	}
	if in.APIKey != nil {
		trimmed := strings.TrimSpace(*in.APIKey)
		if len(trimmed) > 4096 {
			return store.UpsertCommercialFeedSettingsParams{}, errors.New("api_key is too long")
		}
		apiKey = trimmed
	}

	return store.UpsertCommercialFeedSettingsParams{
		NewsProvider: newsProvider,
		PaidProvider: paidProvider,
		ApiBaseUrl:   apiBaseURL,
		ApiKey:       apiKey,
		LicenseNote:  licenseNote,
	}, nil
}

func allowedCommercialPaidProvider(value string) bool {
	switch value {
	case "newsapi", "finnhub", "mediastack", "custom":
		return true
	default:
		return false
	}
}

func toCommercialFeedSettingsDTO(row store.CommercialFeedSetting) commercialFeedSettingsDTO {
	return commercialFeedSettingsDTO{
		NewsProvider: strings.TrimSpace(row.NewsProvider),
		PaidProvider: strings.TrimSpace(row.PaidProvider),
		APIBaseURL:   strings.TrimSpace(row.ApiBaseUrl),
		LicenseNote:  strings.TrimSpace(row.LicenseNote),
		APIKeySet:    strings.TrimSpace(row.ApiKey) != "",
		APIKeyHint:   ocr.MaskAPIKeyHint(row.ApiKey),
	}
}
