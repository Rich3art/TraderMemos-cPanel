package api_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestFeedbackRoundTripAndUserIsolation(t *testing.T) {
	s := testServer(t)
	tokA := registerAndLogin(t, s, "feedback-a@example.com")
	tokB := registerAndLogin(t, s, "feedback-b@example.com")

	rec := do(s, http.MethodGet, "/api/v1/feedback", "", tokA)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var empty []map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &empty))
	require.Empty(t, empty)

	rec = do(s, http.MethodPost, "/api/v1/feedback", `{"body":" Please add a compact review. ","page":"/calendar"}`, tokA)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	var created map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &created))
	require.Equal(t, "Please add a compact review.", created["body"])
	require.Equal(t, "/calendar", created["page"])
	require.Equal(t, "open", created["status"])

	rec = do(s, http.MethodGet, "/api/v1/feedback", "", tokA)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var mine []map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &mine))
	require.Len(t, mine, 1)
	require.Equal(t, created["id"], mine[0]["id"])

	rec = do(s, http.MethodGet, "/api/v1/feedback", "", tokB)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var theirs []map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &theirs))
	require.Empty(t, theirs)
}

func TestFeedbackValidation(t *testing.T) {
	s := testServer(t)
	tok := registerAndLogin(t, s, "feedback-validation@example.com")

	rec := do(s, http.MethodPost, "/api/v1/feedback", `{"body":"   "}`, tok)
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())

	body := strings.Repeat("a", 5100)
	rec = do(s, http.MethodPost, "/api/v1/feedback", `{"body":"`+body+`"}`, tok)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	var created map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &created))
	require.Len(t, created["body"], 5000)
}
