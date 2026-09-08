package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/tradermemos/api/internal/ocr"
)

func TestEconomicCalendarAISettings_roundTripAndMask(t *testing.T) {
	s := testServerWithOCR(t, ocr.VisionConfig{
		Enabled: false,
		BaseURL: "https://api.openai.com/v1",
		Model:   "gpt-4o-mini",
	})
	tok := registerAndLogin(t, s, "econ-ai-settings@example.com")

	rec := do(s, http.MethodGet, "/api/v1/settings/economic-calendar-ai", "", tok)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var got map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.Equal(t, false, got["enabled"])
	require.Equal(t, false, got["api_key_set"])
	require.Contains(t, got["default_prompt"], "economic calendar events")

	body := `{"enabled":true,"base_url":"https://calendar-ai.example/v1","model":"gpt-calendar","api_key":"sk-calendar-key-9999","custom_prompt":"Focus on currency impact."}`
	rec = do(s, http.MethodPut, "/api/v1/settings/economic-calendar-ai", body, tok)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.Equal(t, true, got["enabled"])
	require.Equal(t, "https://calendar-ai.example/v1", got["base_url"])
	require.Equal(t, "gpt-calendar", got["model"])
	require.Equal(t, "Focus on currency impact.", got["custom_prompt"])
	require.Equal(t, true, got["api_key_set"])
	require.Equal(t, "…9999", got["api_key_hint"])
	require.NotContains(t, rec.Body.String(), "sk-calendar-key-9999")

	rec = do(s, http.MethodPut, "/api/v1/settings/economic-calendar-ai", `{"enabled":true,"base_url":"https://calendar-ai.example/v1","model":"gpt-next","custom_prompt":"Updated."}`, tok)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.Equal(t, true, got["api_key_set"])
	require.Equal(t, "…9999", got["api_key_hint"])
	require.Equal(t, "gpt-next", got["model"])
}

func TestEconomicCalendarAISettings_testConnection(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/models" {
			t.Fatalf("path: %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []any{map[string]any{"id": "gpt-calendar"}},
		})
	}))
	defer srv.Close()

	s := testServerWithOCR(t, ocr.VisionConfig{})
	tok := registerAndLogin(t, s, "econ-ai-test@example.com")

	body := `{"base_url":"` + srv.URL + `","model":"gpt-calendar","api_key":"k"}`
	rec := do(s, http.MethodPost, "/api/v1/settings/economic-calendar-ai/test", body, tok)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var got map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.Equal(t, true, got["ok"])
}
