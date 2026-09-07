package api_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCreateSetupAllowsUnknownDirection(t *testing.T) {
	s := testServer(t)
	token := registerAndLogin(t, s, "setup-unknown@example.com")

	rec := do(s, http.MethodPost, "/api/v1/setups",
		`{"name":"Undecided BTC","symbol":"BTCUSD","direction":"unknown","thesis":"Waiting for range break"}`,
		token)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())

	var out map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	require.Equal(t, "unknown", out["direction"])
}

func TestCreateSetupNormalizesQuestionMarkDirection(t *testing.T) {
	s := testServer(t)
	token := registerAndLogin(t, s, "setup-question@example.com")

	rec := do(s, http.MethodPost, "/api/v1/setups",
		`{"name":"Question Mark","symbol":"XAUUSD","direction":"?","thesis":"Direction pending"}`,
		token)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())

	var out map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	require.Equal(t, "unknown", out["direction"])
}

func TestCreateSetupRejectsInvalidDirection(t *testing.T) {
	s := testServer(t)
	token := registerAndLogin(t, s, "setup-invalid@example.com")

	rec := do(s, http.MethodPost, "/api/v1/setups",
		`{"name":"Bad Direction","symbol":"AAPL","direction":"sideways"}`,
		token)
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
}
