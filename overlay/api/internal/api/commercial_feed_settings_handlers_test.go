package api_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCommercialFeedSettings_roundTripAndMask(t *testing.T) {
	s := testServer(t)
	tok := registerAndLogin(t, s, "feeds@example.com")

	rec := do(s, http.MethodGet, "/api/v1/settings/commercial-feed", "", tok)
	require.Equal(t, http.StatusOK, rec.Code)
	var got map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.Equal(t, "public", got["news_provider"])
	require.Equal(t, false, got["api_key_set"])

	body := `{"news_provider":"paid","paid_provider":"newsapi","api_base_url":"https://newsapi.org/v2","api_key":"commercial-secret-1234","license_note":"Paid commercial plan pending."}`
	rec = do(s, http.MethodPut, "/api/v1/settings/commercial-feed", body, tok)
	require.Equal(t, http.StatusOK, rec.Code)
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.Equal(t, "paid", got["news_provider"])
	require.Equal(t, "newsapi", got["paid_provider"])
	require.Equal(t, "https://newsapi.org/v2", got["api_base_url"])
	require.Equal(t, true, got["api_key_set"])
	require.Equal(t, "…1234", got["api_key_hint"])
	require.NotContains(t, rec.Body.String(), "commercial-secret")

	rec = do(s, http.MethodPut, "/api/v1/settings/commercial-feed", `{"news_provider":"public","paid_provider":"newsapi","api_base_url":"https://newsapi.org/v2","license_note":"Keep key."}`, tok)
	require.Equal(t, http.StatusOK, rec.Code)
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.Equal(t, "public", got["news_provider"])
	require.Equal(t, true, got["api_key_set"])
	require.Equal(t, "…1234", got["api_key_hint"])

	rec = do(s, http.MethodPut, "/api/v1/settings/commercial-feed", `{"news_provider":"public","paid_provider":"","api_base_url":"","api_key":"","license_note":""}`, tok)
	require.Equal(t, http.StatusOK, rec.Code)
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.Equal(t, false, got["api_key_set"])
}

func TestCommercialFeedSettings_validation(t *testing.T) {
	s := testServer(t)
	tok := registerAndLogin(t, s, "feeds-validation@example.com")

	rec := do(s, http.MethodPut, "/api/v1/settings/commercial-feed", `{"news_provider":"unknown"}`, tok)
	require.Equal(t, http.StatusBadRequest, rec.Code)

	rec = do(s, http.MethodPut, "/api/v1/settings/commercial-feed", `{"news_provider":"paid","paid_provider":"bad"}`, tok)
	require.Equal(t, http.StatusBadRequest, rec.Code)

	rec = do(s, http.MethodPut, "/api/v1/settings/commercial-feed", `{"news_provider":"paid","paid_provider":"custom","api_base_url":"javascript:alert(1)"}`, tok)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}
