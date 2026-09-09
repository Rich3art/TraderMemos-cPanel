package api_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestGetFundedListingsAdminAndPublishedAccess(t *testing.T) {
	s := testServer(t)
	adminTok := registerAndLogin(t, s, "get-funded-admin@example.com")
	userTok := registerAndLogin(t, s, "get-funded-user@example.com")

	body := `{"firm_name":"Alpha Prop","heading":"Trade funded capital","description":"Evaluation accounts for disciplined traders.","content":"## Details\nUse strict risk controls.","affiliate_url":"https://example.com/alpha?ref=tm","cta_label":"Apply now","promo_code":"TM10","display_order":2,"published":false}`
	rec := do(s, http.MethodPost, "/api/v1/admin/get-funded", body, userTok)
	require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())

	rec = do(s, http.MethodPost, "/api/v1/admin/get-funded", body, adminTok)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	var created map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &created))
	require.Equal(t, "Alpha Prop", created["firm_name"])
	require.Equal(t, false, created["published"])

	rec = do(s, http.MethodGet, "/api/v1/get-funded", "", userTok)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var publicRows []map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &publicRows))
	require.Empty(t, publicRows)

	id := created["id"].(string)
	updateBody := `{"firm_name":"Alpha Prop","heading":"Trade funded capital","description":"Evaluation accounts for disciplined traders.","content":"Updated","affiliate_url":"https://example.com/alpha?ref=tm","cta_label":"Apply now","promo_code":"TM10","display_order":1,"published":true}`
	rec = do(s, http.MethodPatch, "/api/v1/admin/get-funded/"+id, updateBody, adminTok)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	rec = do(s, http.MethodGet, "/api/v1/get-funded", "", userTok)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &publicRows))
	require.Len(t, publicRows, 1)
	require.Equal(t, "Alpha Prop", publicRows[0]["firm_name"])

	rec = do(s, http.MethodGet, "/api/v1/admin/get-funded", "", adminTok)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var adminRows []map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &adminRows))
	require.Len(t, adminRows, 1)

	rec = do(s, http.MethodDelete, "/api/v1/admin/get-funded/"+id, "", adminTok)
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())
}

func TestGetFundedListingValidation(t *testing.T) {
	s := testServer(t)
	adminTok := registerAndLogin(t, s, "get-funded-validation@example.com")

	rec := do(s, http.MethodPost, "/api/v1/admin/get-funded", `{"firm_name":" ","heading":"Missing"}`, adminTok)
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())

	rec = do(s, http.MethodPost, "/api/v1/admin/get-funded", `{"firm_name":"Alpha","heading":"Invalid URL","affiliate_url":"javascript:alert(1)"}`, adminTok)
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
}
