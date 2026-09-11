package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"uuid"

	"github.com/labstack/echo/v5"
	"github.com/tradermemos/api/internal/auth"
)

const stripeAPIBaseURL = "https://api.stripe.com/v1"

type stripeGatewayDTO struct {
	Enabled           bool   `json:"enabled"`
	Mode              string `json:"mode"`
	PublishableKey    string `json:"publishable_key"`
	SecretKeySet      bool   `json:"secret_key_set"`
	SecretKeyHint     string `json:"secret_key_hint,omitempty"`
	WebhookSecretSet  bool   `json:"webhook_secret_set"`
	WebhookSecretHint string `json:"webhook_secret_hint,omitempty"`
	UpdatedAt         string `json:"updated_at,omitempty"`
}

type stripeGatewayPut struct {
	Enabled            bool   `json:"enabled"`
	Mode               string `json:"mode"`
	PublishableKey     string `json:"publishable_key"`
	SecretKey          string `json:"secret_key"`
	ClearSecretKey     bool   `json:"clear_secret_key"`
	WebhookSecret      string `json:"webhook_secret"`
	ClearWebhookSecret bool   `json:"clear_webhook_secret"`
}

type stripeGatewaySettings struct {
	Enabled        bool
	Mode           string
	PublishableKey string
	SecretKey      string
	WebhookSecret  string
	UpdatedAt      time.Time
}

type stripeCheckoutBody struct {
	PackageID  string `json:"package_id"`
	SuccessURL string `json:"success_url"`
	CancelURL  string `json:"cancel_url"`
}

type stripeCheckoutResponse struct {
	SessionID      string `json:"session_id"`
	CheckoutURL    string `json:"checkout_url"`
	PublishableKey string `json:"publishable_key"`
}

func (s *Server) stripeGatewayRoutes(g *echo.Group) {
	admin := g.Group("/settings/payment-gateways/stripe", s.requireAdmin)
	admin.GET("", s.handleGetStripeGatewaySettings)
	admin.PUT("", s.handlePutStripeGatewaySettings)
}

func (s *Server) publicStripeRoutes(g *echo.Group) {
	g.POST("/webhooks/stripe", s.handleStripeWebhook)
}

func (s *Server) handleGetStripeGatewaySettings(c *echo.Context) error {
	settings, err := s.getStripeGatewaySettings(c)
	if errors.Is(err, sql.ErrNoRows) {
		return c.JSON(http.StatusOK, stripeGatewayDTO{Mode: "sandbox"})
	}
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not load Stripe settings", nil)
	}
	return c.JSON(http.StatusOK, stripeGatewayToDTO(settings))
}

func (s *Server) handlePutStripeGatewaySettings(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	var in stripeGatewayPut
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
	publishableKey := cleanRoleText(in.PublishableKey, 300)
	existing, err := s.getStripeGatewaySettings(c)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return Fail(http.StatusInternalServerError, "internal", "could not load existing Stripe settings", nil)
	}
	secretKey := existing.SecretKey
	if in.ClearSecretKey {
		secretKey = ""
	} else if strings.TrimSpace(in.SecretKey) != "" {
		secretKey = strings.TrimSpace(in.SecretKey)
	}
	webhookSecret := existing.WebhookSecret
	if in.ClearWebhookSecret {
		webhookSecret = ""
	} else if strings.TrimSpace(in.WebhookSecret) != "" {
		webhookSecret = strings.TrimSpace(in.WebhookSecret)
	}
	row := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		INSERT INTO stripe_gateway_settings (id, enabled, mode, publishable_key, secret_key, webhook_secret, updated_at)
		VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, mode = excluded.mode, publishable_key = excluded.publishable_key, secret_key = excluded.secret_key, webhook_secret = excluded.webhook_secret, updated_at = CURRENT_TIMESTAMP
		RETURNING enabled, mode, publishable_key, secret_key, webhook_secret, updated_at
	`), boolInt(in.Enabled), mode, publishableKey, secretKey, webhookSecret)
	settings, err := scanStripeGateway(row)
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not save Stripe settings", nil)
	}
	return c.JSON(http.StatusOK, stripeGatewayToDTO(settings))
}

func (s *Server) handleCreateStripeCheckoutSession(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	uid := auth.UserID(c)
	var in stripeCheckoutBody
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	pkg, err := s.getSubscriptionPackageForPayment(c, strings.TrimSpace(in.PackageID))
	if err != nil {
		return err
	}
	settings, err := s.getEnabledStripeSettings(c)
	if err != nil {
		return err
	}
	transactionID := uuid.New().String()
	successURL := cleanRoleText(in.SuccessURL, 500)
	cancelURL := cleanRoleText(in.CancelURL, 500)
	if successURL == "" {
		successURL = strings.TrimRight(publicPackageURL(c), "/") + "/?stripe_session_id={CHECKOUT_SESSION_ID}"
	}
	if cancelURL == "" {
		cancelURL = strings.TrimRight(publicPackageURL(c), "/") + "/"
	}
	values := url.Values{}
	values.Set("mode", "payment")
	values.Set("success_url", successURL)
	values.Set("cancel_url", cancelURL)
	values.Set("client_reference_id", transactionID)
	values.Set("line_items[0][price_data][currency]", strings.ToLower(pkg.Currency))
	values.Set("line_items[0][price_data][unit_amount]", strconv.FormatInt(stripeMinorUnits(pkg.Price), 10))
	values.Set("line_items[0][price_data][product_data][name]", pkg.Name)
	values.Set("line_items[0][quantity]", "1")
	values.Set("metadata[order_id]", transactionID)
	values.Set("metadata[user_id]", uid)
	values.Set("metadata[package_id]", pkg.ID)
	if user, err := s.deps.Store.GetUserByID(c.Request().Context(), uid); err == nil && strings.TrimSpace(user.Email) != "" {
		values.Set("customer_email", strings.TrimSpace(user.Email))
	}
	var session map[string]any
	if err := s.stripeForm(c, settings, http.MethodPost, "/checkout/sessions", values, &session, transactionID); err != nil {
		return Fail(http.StatusBadGateway, "stripe_unavailable", "could not create Stripe checkout session", nil)
	}
	sessionID, _ := session["id"].(string)
	checkoutURL, _ := session["url"].(string)
	if sessionID == "" || checkoutURL == "" {
		return Fail(http.StatusBadGateway, "stripe_unavailable", "Stripe checkout response was incomplete", nil)
	}
	if _, err := s.deps.DB.ExecContext(c.Request().Context(), s.contentSQL(`
		INSERT INTO payment_transactions (id, user_id, package_id, provider, provider_order_id, status, amount, currency, raw_json)
		VALUES (?, ?, ?, 'stripe', ?, 'pending', ?, ?, ?)
		ON CONFLICT(provider, provider_order_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
	`), transactionID, uid, pkg.ID, sessionID, pkg.Price, pkg.Currency, mustJSON(session)); err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not store Stripe checkout session", nil)
	}
	return c.JSON(http.StatusCreated, stripeCheckoutResponse{SessionID: sessionID, CheckoutURL: checkoutURL, PublishableKey: settings.PublishableKey})
}

func (s *Server) handleVerifyStripeCheckoutSession(c *echo.Context) error {
	sessionID := cleanRoleText(c.Param("session_id"), 160)
	if sessionID == "" {
		return Fail(http.StatusBadRequest, "bad_request", "session_id is required", nil)
	}
	settings, err := s.getEnabledStripeSettings(c)
	if err != nil {
		return err
	}
	var session map[string]any
	if err := s.stripeForm(c, settings, http.MethodGet, "/checkout/sessions/"+url.PathEscape(sessionID), nil, &session, ""); err != nil {
		return Fail(http.StatusBadGateway, "stripe_unavailable", "could not verify Stripe checkout session", nil)
	}
	dto, err := s.completeStripeTransaction(c, sessionID, auth.UserID(c), session)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, dto)
}

func (s *Server) handleStripeWebhook(c *echo.Context) error {
	settings, err := s.getEnabledStripeSettings(c)
	if err != nil {
		return c.NoContent(http.StatusServiceUnavailable)
	}
	body, err := io.ReadAll(c.Request().Body)
	if err != nil {
		return c.NoContent(http.StatusBadRequest)
	}
	if !verifyStripeWebhook(c, settings.WebhookSecret, body, 5*time.Minute) {
		return c.NoContent(http.StatusUnauthorized)
	}
	var event map[string]any
	if err := json.Unmarshal(body, &event); err != nil {
		return c.NoContent(http.StatusBadRequest)
	}
	switch typ, _ := event["type"].(string); typ {
	case "checkout.session.completed", "checkout.session.async_payment_succeeded":
		data, _ := event["data"].(map[string]any)
		object, _ := data["object"].(map[string]any)
		sessionID, _ := object["id"].(string)
		if sessionID != "" {
			_, _ = s.completeStripeTransaction(c, sessionID, "", object)
		}
	}
	return c.NoContent(http.StatusNoContent)
}

func (s *Server) completeStripeTransaction(c *echo.Context, sessionID, expectedUserID string, raw map[string]any) (userSubscriptionDTO, error) {
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
		WHERE provider = 'stripe' AND provider_order_id = ?
	`), sessionID).Scan(&tx.ID, &tx.UserID, &tx.PackageID, &tx.Status, &tx.SubscriptionID)
	if errors.Is(err, sql.ErrNoRows) {
		return userSubscriptionDTO{}, Fail(http.StatusNotFound, "not_found", "payment transaction not found", nil)
	}
	if err != nil {
		return userSubscriptionDTO{}, Fail(http.StatusInternalServerError, "internal", "could not load payment transaction", nil)
	}
	if expectedUserID != "" && tx.UserID != expectedUserID {
		return userSubscriptionDTO{}, Fail(http.StatusForbidden, "forbidden", "payment does not belong to this user", nil)
	}
	if tx.Status == "completed" && tx.SubscriptionID != "" {
		return s.getUserSubscriptionByID(c, tx.SubscriptionID)
	}
	if !stripeSessionPaid(raw) {
		return userSubscriptionDTO{}, Fail(http.StatusBadRequest, "payment_not_completed", "Stripe checkout session is not paid", nil)
	}
	providerRef := stripeProviderRef(raw)
	if providerRef == "" {
		providerRef = sessionID
	}
	dto, err := s.activateSubscription(c, tx.UserID, tx.PackageID, "stripe", providerRef)
	if err != nil {
		return userSubscriptionDTO{}, err
	}
	_, err = s.deps.DB.ExecContext(c.Request().Context(), s.contentSQL(`
		UPDATE payment_transactions
		SET status = 'completed', provider_capture_id = ?, subscription_id = ?, raw_json = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`), providerRef, dto.ID, mustJSON(raw), tx.ID)
	if err != nil {
		return userSubscriptionDTO{}, Fail(http.StatusInternalServerError, "internal", "could not update payment transaction", nil)
	}
	return dto, nil
}

func (s *Server) getEnabledStripeSettings(c *echo.Context) (stripeGatewaySettings, error) {
	settings, err := s.getStripeGatewaySettings(c)
	if errors.Is(err, sql.ErrNoRows) || !settings.Enabled || settings.PublishableKey == "" || settings.SecretKey == "" {
		return settings, Fail(http.StatusBadRequest, "stripe_not_configured", "Stripe is not configured", nil)
	}
	if err != nil {
		return settings, Fail(http.StatusInternalServerError, "internal", "could not load Stripe settings", nil)
	}
	return settings, nil
}

func (s *Server) getStripeGatewaySettings(c *echo.Context) (stripeGatewaySettings, error) {
	if s.deps.DB == nil {
		return stripeGatewaySettings{}, contentDBUnavailable()
	}
	row := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		SELECT enabled, mode, publishable_key, secret_key, webhook_secret, updated_at
		FROM stripe_gateway_settings WHERE id = 1
	`))
	return scanStripeGateway(row)
}

func scanStripeGateway(scanner interface{ Scan(dest ...any) error }) (stripeGatewaySettings, error) {
	var out stripeGatewaySettings
	var enabled int64
	if err := scanner.Scan(&enabled, &out.Mode, &out.PublishableKey, &out.SecretKey, &out.WebhookSecret, &out.UpdatedAt); err != nil {
		return out, err
	}
	out.Enabled = enabled == 1
	if out.Mode == "" {
		out.Mode = "sandbox"
	}
	return out, nil
}

func stripeGatewayToDTO(settings stripeGatewaySettings) stripeGatewayDTO {
	return stripeGatewayDTO{
		Enabled:           settings.Enabled,
		Mode:              settings.Mode,
		PublishableKey:    settings.PublishableKey,
		SecretKeySet:      settings.SecretKey != "",
		SecretKeyHint:     secretHint(settings.SecretKey),
		WebhookSecretSet:  settings.WebhookSecret != "",
		WebhookSecretHint: secretHint(settings.WebhookSecret),
		UpdatedAt:         settings.UpdatedAt.Format(time.RFC3339),
	}
}

func (s *Server) stripeForm(c *echo.Context, settings stripeGatewaySettings, method, path string, values url.Values, out any, idempotencyKey string) error {
	var reader io.Reader
	if values != nil {
		reader = strings.NewReader(values.Encode())
	}
	req, err := http.NewRequestWithContext(c.Request().Context(), method, stripeAPIBaseURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+settings.SecretKey)
	if values != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	if idempotencyKey != "" && method == http.MethodPost {
		req.Header.Set("Idempotency-Key", idempotencyKey)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return fmt.Errorf("stripe status %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func verifyStripeWebhook(c *echo.Context, secret string, body []byte, tolerance time.Duration) bool {
	signatureHeader := c.Request().Header.Get("Stripe-Signature")
	if secret == "" || signatureHeader == "" {
		return false
	}
	var timestamp string
	signatures := []string{}
	for _, part := range strings.Split(signatureHeader, ",") {
		key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}
		switch key {
		case "t":
			timestamp = value
		case "v1":
			signatures = append(signatures, value)
		}
	}
	if timestamp == "" || len(signatures) == 0 {
		return false
	}
	sec, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return false
	}
	if tolerance > 0 && time.Since(time.Unix(sec, 0)) > tolerance {
		return false
	}
	payload := timestamp + "." + string(body)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	expected := hex.EncodeToString(mac.Sum(nil))
	for _, signature := range signatures {
		if subtle.ConstantTimeCompare([]byte(strings.ToLower(signature)), []byte(expected)) == 1 {
			return true
		}
	}
	return false
}

func stripeMinorUnits(price float64) int64 {
	return int64(math.Round(price * 100))
}

func stripeSessionPaid(raw map[string]any) bool {
	paymentStatus, _ := raw["payment_status"].(string)
	return paymentStatus == "paid"
}

func stripeProviderRef(raw map[string]any) string {
	for _, key := range []string{"payment_intent", "subscription", "id"} {
		if value, ok := raw[key].(string); ok && value != "" {
			return value
		}
	}
	return ""
}
