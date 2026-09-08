package api_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestChartAnnotationsPersistForSetup(t *testing.T) {
	s := testServer(t)
	tok := registerAndLogin(t, s, "chart-setup@example.com")

	rec := do(s, http.MethodPost, "/api/v1/setups", `{"name":"XAUUSD annotation test","symbol":"XAUUSD","direction":"long"}`, tok)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	var setup struct {
		ID string `json:"id"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &setup))

	body := `{"symbol":"XAUUSD","interval":"240","drawings":[{"id":"d1","type":"trendline","from":{"time":1,"price":10},"to":{"time":2,"price":12}}]}`
	rec = do(s, http.MethodPut, "/api/v1/chart-annotations/setup/"+setup.ID, body, tok)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	rec = do(s, http.MethodGet, "/api/v1/chart-annotations/setup/"+setup.ID+"?symbol=XAUUSD&interval=240", "", tok)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var out struct {
		Drawings []map[string]any `json:"drawings"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	require.Len(t, out.Drawings, 1)
	require.Equal(t, "d1", out.Drawings[0]["id"])
}

func TestChartAnnotationsAreUserScoped(t *testing.T) {
	s := testServer(t)
	owner := registerAndLogin(t, s, "chart-owner@example.com")
	other := registerAndLogin(t, s, "chart-other@example.com")

	rec := do(s, http.MethodPost, "/api/v1/setups", `{"name":"Private","symbol":"BTCUSD","direction":"short"}`, owner)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	var setup struct {
		ID string `json:"id"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &setup))

	body := `{"symbol":"BTCUSD","interval":"D","drawings":[]}`
	rec = do(s, http.MethodPut, "/api/v1/chart-annotations/setup/"+setup.ID, body, other)
	require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
}
