package api

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
	"uuid"

	"github.com/labstack/echo/v5"
	"github.com/tradermemos/api/internal/auth"
)

const whopAPIVersionDate = "2026-09-09"

type whopGatewayDTO struct {
	Enabled           bool   `json:"enabled"`
	Mode              string `json:"mode"`
	AccountID         string `json:"account_id"`
	APIKeySet         bool   `json:"api_key_set"`
	APIKeyHint        string `json:"api_key_hint,omitempty"`
	WebhookSecretSet  bool   `json:"webhook_secret_set"`
	WebhookSecretHint string `json:"webhook_secret_hint,omitempty"`
	UpdatedAt         string `json:"updated_at,omitempty"`
}

type whopGatewayPut struct {
	Enabled            bool   `json:"enabled"`
	Mode               string `json:"mode"`
	AccountID          string `json:"account_id"`
	APIKey             string `json:"api_key"`
	ClearAPIKey        bool   `json:"clear_api_key"`
	WebhookSecret      string `json:"webhook_secret"`
	ClearWebhookSecret bool   `json:"clear_webhook_secret"`
}

type whopGatewaySettings struct {
	Enabled       bool
	Mode          string
	AccountID     string
	APIKey        string
	WebhookSecret string
	UpdatedAt     time.Time
}

type whopCreateCheckoutBody struct {
	PackageID   string `json:"package_id"`
	RedirectURL string `json:"redirect_url"`
}

type whopCheckoutResponse struct {
	CheckoutID  string `json:"checkout_id"`
	PlanID      string `json:"plan_id"`
	PurchaseURL string `json:"purchase_url"`
}

func (s *Server) whopGatewayRoutes(g *echo.Group) {
	admin := g.Group("/settings/payment-gateways/whop", s.requireAdmin)
	admin.GET("", s.handleGetWhopGatewaySettings)
	admin.PUT("", s.handlePutWhopGatewaySettings)
}

func (s *Server) publicWhopRoutes(g *echo.Group) {
	g.POST("/webhooks/whop", s.handleWhopWebhook)
}

func (s *Server) handleGetWhopGatewaySettings(c *echo.Context) error {
	settings, err := s.getWhopGatewaySettings(c)
	if errors.Is(err, sql.ErrNoRows) {
		return c.JSON(http.StatusOK, whopGatewayDTO{Mode: "sandbox"})
	}
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not load Whop settings", nil)
	}
	return c.JSON(http.StatusOK, whopGatewayToDTO(settings))
}

func (s *Server) handlePutWhopGatewaySettings(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	var in whopGatewayPut
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	mode := strings.ToLower(cleanRoleText(in.Mode, 20))
	if mode == "" {
		mode = "sandbox"
	}
	if mode != "sandbox" && mode != "live" {
		return Fail(http.StatusBadRequest, "bad_request", "mode must be sandbox or live", nil)
	}
	accountID := cleanRoleText(in.AccountID, 120)
	existing, err := s.getWhopGatewaySettings(c)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return Fail(http.StatusInternalServerError, "internal", "could not load existing Whop settings", nil)
	}
	apiKey := existing.APIKey
	if in.ClearAPIKey {
		apiKey = ""
	} else if strings.TrimSpace(in.APIKey) != "" {
		apiKey = strings.TrimSpace(in.APIKey)
	}
	webhookSecret := existing.WebhookSecret
	if in.ClearWebhookSecret {
		webhookSecret = ""
	} else if strings.TrimSpace(in.WebhookSecret) != "" {
		webhookSecret = strings.TrimSpace(in.WebhookSecret)
	}
	row := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		INSERT INTO whop_gateway_settings (id, enabled, mode, account_id, api_key, webhook_secret, updated_at)
		VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, mode = excluded.mode, account_id = excluded.account_id, api_key = excluded.api_key, webhook_secret = excluded.webhook_secret, updated_at = CURRENT_TIMESTAMP
		RETURNING enabled, mode, account_id, api_key, webhook_secret, updated_at
	`), boolInt(in.Enabled), mode, accountID, apiKey, webhookSecret)
	settings, err := scanWhopGateway(row)
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not save Whop settings", nil)
	}
	return c.JSON(http.StatusOK, whopGatewayToDTO(settings))
}

func (s *Server) handleCreateWhopCheckout(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	uid := auth.UserID(c)
	var in whopCreateCheckoutBody
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	pkg, err := s.getSubscriptionPackageForPayment(c, strings.TrimSpace(in.PackageID))
	if err != nil {
		return err
	}
	settings, err := s.getEnabledWhopSettings(c)
	if err != nil {
		return err
	}
	transactionID := uuid.New().String()
	redirectURL := cleanRoleText(in.RedirectURL, 500)
	if redirectURL == "" {
		redirectURL = strings.TrimRight(publicPackageURL(c), "/") + "/"
	}
	payload := map[string]any{
		"account_id":   settings.AccountID,
		"mode":         "payment",
		"redirect_url": redirectURL,
		"metadata": map[string]any{
			"order_id":   transactionID,
			"user_id":    uid,
			"package_id": pkg.ID,
		},
		"plan": map[string]any{
			"initial_price":   pkg.Price,
			"currency":        strings.ToLower(pkg.Currency),
			"plan_type":       "one_time",
			"expiration_days": pkg.AccessDays,
			"title":           pkg.Name,
			"description":     pkg.Description,
			"visibility":      "hidden",
			"release_method":  "buy_now",
		},
	}
	var checkout map[string]any
	if err := s.whopJSON(c, settings, http.MethodPost, "/checkout_configurations", payload, &checkout, transactionID); err != nil {
		return Fail(http.StatusBadGateway, "whop_unavailable", "could not create Whop checkout", nil)
	}
	checkoutID, _ := checkout["id"].(string)
	purchaseURL, _ := checkout["purchase_url"].(string)
	planID := ""
	if plan, ok := checkout["plan"].(map[string]any); ok {
		planID, _ = plan["id"].(string)
	}
	if checkoutID == "" || purchaseURL == "" {
		return Fail(http.StatusBadGateway, "whop_unavailable", "Whop checkout response was incomplete", nil)
	}
	if _, err := s.deps.DB.ExecContext(c.Request().Context(), s.contentSQL(`
		INSERT INTO payment_transactions (id, user_id, package_id, provider, provider_order_id, status, amount, currency, raw_json)
		VALUES (?, ?, ?, 'whop', ?, 'pending', ?, ?, ?)
		ON CONFLICT(provider, provider_order_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
	`), transactionID, uid, pkg.ID, checkoutID, pkg.Price, pkg.Currency, mustJSON(checkout)); err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not store Whop checkout", nil)
	}
	return c.JSON(http.StatusCreated, whopCheckoutResponse{CheckoutID: checkoutID, PlanID: planID, PurchaseURL: purchaseURL})
}

func (s *Server) handleWhopWebhook(c *echo.Context) error {
	settings, err := s.getEnabledWhopSettings(c)
	if err != nil {
		return c.NoContent(http.StatusServiceUnavailable)
	}
	body, err := io.ReadAll(c.Request().Body)
	if err != nil {
		return c.NoContent(http.StatusBadRequest)
	}
	if !verifyWhopWebhook(c, settings.WebhookSecret, body) {
		return c.NoContent(http.StatusUnauthorized)
	}
	var event map[string]any
	if err := json.Unmarshal(body, &event); err != nil {
		return c.NoContent(http.StatusBadRequest)
	}
	if typ, _ := event["type"].(string); typ == "payment.succeeded" {
		_, _ = s.completeWhopTransaction(c, event)
	}
	return c.NoContent(http.StatusNoContent)
}

func (s *Server) completeWhopTransaction(c *echo.Context, event map[string]any) (userSubscriptionDTO, error) {
	data, _ := event["data"].(map[string]any)
	metadata, _ := data["metadata"].(map[string]any)
	orderID, _ := metadata["order_id"].(string)
	if orderID == "" {
		return userSubscriptionDTO{}, Fail(http.StatusBadRequest, "bad_request", "missing Whop order metadata", nil)
	}
	status, _ := data["status"].(string)
	if status != "" && status != "succeeded" {
		return userSubscriptionDTO{}, Fail(http.StatusBadRequest, "payment_not_completed", "Whop payment is not succeeded", nil)
	}
	var tx struct {
		ID             string
		UserID         string
		PackageID      string
		Status         string
		SubscriptionID string
	}
	err := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		SELECT id, user_id, package_id, status, subscription_id
		FROM payment_transactions
		WHERE provider = 'whop' AND id = ?
	`), orderID).Scan(&tx.ID, &tx.UserID, &tx.PackageID, &tx.Status, &tx.SubscriptionID)
	if errors.Is(err, sql.ErrNoRows) {
		return userSubscriptionDTO{}, Fail(http.StatusNotFound, "not_found", "payment transaction not found", nil)
	}
	if err != nil {
		return userSubscriptionDTO{}, Fail(http.StatusInternalServerError, "internal", "could not load payment transaction", nil)
	}
	if tx.Status == "completed" && tx.SubscriptionID != "" {
		return s.getUserSubscriptionByID(c, tx.SubscriptionID)
	}
	providerRef, _ := data["id"].(string)
	dto, err := s.activateSubscription(c, tx.UserID, tx.PackageID, "whop", providerRef)
	if err != nil {
		return userSubscriptionDTO{}, err
	}
	_, err = s.deps.DB.ExecContext(c.Request().Context(), s.contentSQL(`
		UPDATE payment_transactions
		SET status = 'completed', provider_capture_id = ?, subscription_id = ?, raw_json = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`), providerRef, dto.ID, mustJSON(event), tx.ID)
	if err != nil {
		return userSubscriptionDTO{}, Fail(http.StatusInternalServerError, "internal", "could not update payment transaction", nil)
	}
	return dto, nil
}

func (s *Server) getEnabledWhopSettings(c *echo.Context) (whopGatewaySettings, error) {
	settings, err := s.getWhopGatewaySettings(c)
	if errors.Is(err, sql.ErrNoRows) || !settings.Enabled || settings.AccountID == "" || settings.APIKey == "" {
		return settings, Fail(http.StatusBadRequest, "whop_not_configured", "Whop is not configured", nil)
	}
	if err != nil {
		return settings, Fail(http.StatusInternalServerError, "internal", "could not load Whop settings", nil)
	}
	return settings, nil
}

func (s *Server) getWhopGatewaySettings(c *echo.Context) (whopGatewaySettings, error) {
	if s.deps.DB == nil {
		return whopGatewaySettings{}, contentDBUnavailable()
	}
	row := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		SELECT enabled, mode, account_id, api_key, webhook_secret, updated_at
		FROM whop_gateway_settings WHERE id = 1
	`))
	return scanWhopGateway(row)
}

func scanWhopGateway(scanner interface{ Scan(dest ...any) error }) (whopGatewaySettings, error) {
	var out whopGatewaySettings
	var enabled int64
	if err := scanner.Scan(&enabled, &out.Mode, &out.AccountID, &out.APIKey, &out.WebhookSecret, &out.UpdatedAt); err != nil {
		return out, err
	}
	out.Enabled = enabled == 1
	if out.Mode == "" {
		out.Mode = "sandbox"
	}
	return out, nil
}

func whopGatewayToDTO(settings whopGatewaySettings) whopGatewayDTO {
	return whopGatewayDTO{
		Enabled:           settings.Enabled,
		Mode:              settings.Mode,
		AccountID:         settings.AccountID,
		APIKeySet:         settings.APIKey != "",
		APIKeyHint:        secretHint(settings.APIKey),
		WebhookSecretSet:  settings.WebhookSecret != "",
		WebhookSecretHint: secretHint(settings.WebhookSecret),
		UpdatedAt:         settings.UpdatedAt.Format(time.RFC3339),
	}
}

func whopBaseURL(mode string) string {
	if mode == "live" {
		return "https://api.whop.com/api/v1"
	}
	return "https://sandbox-api.whop.com/api/v1"
}

func (s *Server) whopJSON(c *echo.Context, settings whopGatewaySettings, method, path string, body any, out any, idempotencyKey string) error {
	var reader io.Reader
	if body != nil {
		data, _ := json.Marshal(body)
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(c.Request().Context(), method, whopBaseURL(settings.Mode)+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+settings.APIKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Api-Version-Date", whopAPIVersionDate)
	if idempotencyKey != "" {
		req.Header.Set("Idempotency-Key", idempotencyKey)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return fmt.Errorf("whop status %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func verifyWhopWebhook(c *echo.Context, secret string, body []byte) bool {
	if secret == "" {
		return false
	}
	id := c.Request().Header.Get("webhook-id")
	timestamp := c.Request().Header.Get("webhook-timestamp")
	signatureHeader := c.Request().Header.Get("webhook-signature")
	if id == "" || timestamp == "" || signatureHeader == "" {
		return false
	}
	ts, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return false
	}
	if delta := time.Since(time.Unix(ts, 0)); delta > 5*time.Minute || delta < -5*time.Minute {
		return false
	}
	expectedPayload := []byte(id + "." + timestamp + "." + string(body))
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(expectedPayload)
	expected := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	for _, part := range strings.Split(signatureHeader, " ") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "v1,") {
			actual := strings.TrimPrefix(part, "v1,")
			if subtle.ConstantTimeCompare([]byte(actual), []byte(expected)) == 1 {
				return true
			}
		}
	}
	return false
}
