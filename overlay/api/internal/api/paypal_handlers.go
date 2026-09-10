package api

import (
	"bytes"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
	"uuid"

	"github.com/labstack/echo/v5"
	"github.com/tradermemos/api/internal/auth"
)

type paypalGatewayDTO struct {
	Enabled          bool   `json:"enabled"`
	Mode             string `json:"mode"`
	ClientID         string `json:"client_id"`
	ClientSecretSet  bool   `json:"client_secret_set"`
	ClientSecretHint string `json:"client_secret_hint,omitempty"`
	WebhookIDSet     bool   `json:"webhook_id_set"`
	WebhookIDHint    string `json:"webhook_id_hint,omitempty"`
	UpdatedAt        string `json:"updated_at,omitempty"`
}

type paypalGatewayPut struct {
	Enabled           bool   `json:"enabled"`
	Mode              string `json:"mode"`
	ClientID          string `json:"client_id"`
	ClientSecret      string `json:"client_secret"`
	ClearClientSecret bool   `json:"clear_client_secret"`
	WebhookID         string `json:"webhook_id"`
	ClearWebhookID    bool   `json:"clear_webhook_id"`
}

type paypalGatewaySettings struct {
	Enabled      bool
	Mode         string
	ClientID     string
	ClientSecret string
	WebhookID    string
	UpdatedAt    time.Time
}

type paypalCreateOrderBody struct {
	PackageID string `json:"package_id"`
	ReturnURL string `json:"return_url"`
	CancelURL string `json:"cancel_url"`
}

type paypalCaptureBody struct {
	OrderID string `json:"order_id"`
}

type paypalCreateOrderResponse struct {
	OrderID string `json:"order_id"`
	Status  string `json:"status"`
	Links   []struct {
		Href string `json:"href"`
		Rel  string `json:"rel"`
	} `json:"links"`
	ApproveURL string `json:"approve_url"`
}

func (s *Server) paypalGatewayRoutes(g *echo.Group) {
	admin := g.Group("/settings/payment-gateways/paypal", s.requireAdmin)
	admin.GET("", s.handleGetPayPalGatewaySettings)
	admin.PUT("", s.handlePutPayPalGatewaySettings)
}

func (s *Server) publicPayPalRoutes(g *echo.Group) {
	g.POST("/webhooks/paypal", s.handlePayPalWebhook)
}

func (s *Server) handleGetPayPalGatewaySettings(c *echo.Context) error {
	settings, err := s.getPayPalGatewaySettings(c)
	if errors.Is(err, sql.ErrNoRows) {
		return c.JSON(http.StatusOK, paypalGatewayDTO{Mode: "sandbox"})
	}
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not load PayPal settings", nil)
	}
	return c.JSON(http.StatusOK, paypalGatewayToDTO(settings))
}

func (s *Server) handlePutPayPalGatewaySettings(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	var in paypalGatewayPut
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
	clientID := cleanRoleText(in.ClientID, 300)
	existing, err := s.getPayPalGatewaySettings(c)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return Fail(http.StatusInternalServerError, "internal", "could not load existing PayPal settings", nil)
	}
	secret := existing.ClientSecret
	if in.ClearClientSecret {
		secret = ""
	} else if strings.TrimSpace(in.ClientSecret) != "" {
		secret = strings.TrimSpace(in.ClientSecret)
	}
	webhookID := existing.WebhookID
	if in.ClearWebhookID {
		webhookID = ""
	} else if strings.TrimSpace(in.WebhookID) != "" {
		webhookID = cleanRoleText(in.WebhookID, 300)
	}
	row := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		INSERT INTO paypal_gateway_settings (id, enabled, mode, client_id, client_secret, webhook_id, updated_at)
		VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, mode = excluded.mode, client_id = excluded.client_id, client_secret = excluded.client_secret, webhook_id = excluded.webhook_id, updated_at = CURRENT_TIMESTAMP
		RETURNING enabled, mode, client_id, client_secret, webhook_id, updated_at
	`), boolInt(in.Enabled), mode, clientID, secret, webhookID)
	settings, err := scanPayPalGateway(row)
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not save PayPal settings", nil)
	}
	return c.JSON(http.StatusOK, paypalGatewayToDTO(settings))
}

func (s *Server) handleCreatePayPalOrder(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	uid := auth.UserID(c)
	var in paypalCreateOrderBody
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	pkg, err := s.getSubscriptionPackageForPayment(c, strings.TrimSpace(in.PackageID))
	if err != nil {
		return err
	}
	settings, err := s.getEnabledPayPalSettings(c)
	if err != nil {
		return err
	}
	token, err := s.paypalAccessToken(c, settings)
	if err != nil {
		return Fail(http.StatusBadGateway, "paypal_unavailable", "could not authenticate with PayPal", nil)
	}
	payload := map[string]any{
		"intent": "CAPTURE",
		"purchase_units": []map[string]any{{
			"reference_id": pkg.ID,
			"custom_id":    uid + ":" + pkg.ID,
			"description":  pkg.Name,
			"amount": map[string]string{
				"currency_code": pkg.Currency,
				"value":         fmt.Sprintf("%.2f", pkg.Price),
			},
		}},
	}
	appCtx := map[string]string{}
	if strings.TrimSpace(in.ReturnURL) != "" {
		appCtx["return_url"] = cleanRoleText(in.ReturnURL, 500)
	}
	if strings.TrimSpace(in.CancelURL) != "" {
		appCtx["cancel_url"] = cleanRoleText(in.CancelURL, 500)
	}
	if len(appCtx) > 0 {
		payload["application_context"] = appCtx
	}
	var order paypalCreateOrderResponse
	if err := s.paypalJSON(c, settings, token, http.MethodPost, "/v2/checkout/orders", payload, &order); err != nil {
		return Fail(http.StatusBadGateway, "paypal_unavailable", "could not create PayPal order", nil)
	}
	for _, link := range order.Links {
		if link.Rel == "approve" {
			order.ApproveURL = link.Href
			break
		}
	}
	if _, err := s.deps.DB.ExecContext(c.Request().Context(), s.contentSQL(`
		INSERT INTO payment_transactions (id, user_id, package_id, provider, provider_order_id, status, amount, currency, raw_json)
		VALUES (?, ?, ?, 'paypal', ?, 'pending', ?, ?, ?)
		ON CONFLICT(provider, provider_order_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
	`), uuid.New().String(), uid, pkg.ID, order.OrderID, pkg.Price, pkg.Currency, mustJSON(order)); err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not store PayPal order", nil)
	}
	return c.JSON(http.StatusCreated, order)
}

func (s *Server) handleCapturePayPalOrder(c *echo.Context) error {
	uid := auth.UserID(c)
	var in paypalCaptureBody
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	orderID := cleanRoleText(in.OrderID, 160)
	if orderID == "" {
		return Fail(http.StatusBadRequest, "bad_request", "order_id is required", nil)
	}
	settings, err := s.getEnabledPayPalSettings(c)
	if err != nil {
		return err
	}
	token, err := s.paypalAccessToken(c, settings)
	if err != nil {
		return Fail(http.StatusBadGateway, "paypal_unavailable", "could not authenticate with PayPal", nil)
	}
	var capture map[string]any
	if err := s.paypalJSON(c, settings, token, http.MethodPost, "/v2/checkout/orders/"+orderID+"/capture", nil, &capture); err != nil {
		return Fail(http.StatusBadGateway, "paypal_unavailable", "could not capture PayPal order", nil)
	}
	dto, err := s.completePayPalTransaction(c, orderID, uid, capture)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, dto)
}

func (s *Server) handlePayPalWebhook(c *echo.Context) error {
	settings, err := s.getEnabledPayPalSettings(c)
	if err != nil {
		return c.NoContent(http.StatusServiceUnavailable)
	}
	body, err := io.ReadAll(c.Request().Body)
	if err != nil {
		return c.NoContent(http.StatusBadRequest)
	}
	if settings.WebhookID == "" || !s.verifyPayPalWebhook(c, settings, body) {
		return c.NoContent(http.StatusUnauthorized)
	}
	var event map[string]any
	if err := json.Unmarshal(body, &event); err != nil {
		return c.NoContent(http.StatusBadRequest)
	}
	eventType, _ := event["event_type"].(string)
	resource, _ := event["resource"].(map[string]any)
	if eventType == "PAYMENT.CAPTURE.COMPLETED" {
		orderID := paypalOrderIDFromResource(resource)
		if orderID != "" {
			_, _ = s.completePayPalTransaction(c, orderID, "", event)
		}
	}
	return c.NoContent(http.StatusNoContent)
}

func (s *Server) getEnabledPayPalSettings(c *echo.Context) (paypalGatewaySettings, error) {
	settings, err := s.getPayPalGatewaySettings(c)
	if errors.Is(err, sql.ErrNoRows) || !settings.Enabled || settings.ClientID == "" || settings.ClientSecret == "" {
		return settings, Fail(http.StatusBadRequest, "paypal_not_configured", "PayPal is not configured", nil)
	}
	if err != nil {
		return settings, Fail(http.StatusInternalServerError, "internal", "could not load PayPal settings", nil)
	}
	return settings, nil
}

func (s *Server) getPayPalGatewaySettings(c *echo.Context) (paypalGatewaySettings, error) {
	if s.deps.DB == nil {
		return paypalGatewaySettings{}, contentDBUnavailable()
	}
	row := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		SELECT enabled, mode, client_id, client_secret, webhook_id, updated_at
		FROM paypal_gateway_settings WHERE id = 1
	`))
	return scanPayPalGateway(row)
}

func scanPayPalGateway(scanner interface{ Scan(dest ...any) error }) (paypalGatewaySettings, error) {
	var out paypalGatewaySettings
	var enabled int64
	if err := scanner.Scan(&enabled, &out.Mode, &out.ClientID, &out.ClientSecret, &out.WebhookID, &out.UpdatedAt); err != nil {
		return out, err
	}
	out.Enabled = enabled == 1
	if out.Mode == "" {
		out.Mode = "sandbox"
	}
	return out, nil
}

func paypalGatewayToDTO(settings paypalGatewaySettings) paypalGatewayDTO {
	return paypalGatewayDTO{
		Enabled:          settings.Enabled,
		Mode:             settings.Mode,
		ClientID:         settings.ClientID,
		ClientSecretSet:  settings.ClientSecret != "",
		ClientSecretHint: secretHint(settings.ClientSecret),
		WebhookIDSet:     settings.WebhookID != "",
		WebhookIDHint:    secretHint(settings.WebhookID),
		UpdatedAt:        settings.UpdatedAt.Format(time.RFC3339),
	}
}

func secretHint(value string) string {
	if value == "" {
		return ""
	}
	if len(value) <= 6 {
		return "set"
	}
	return value[:3] + "..." + value[len(value)-3:]
}

func paypalBaseURL(mode string) string {
	if mode == "live" {
		return "https://api-m.paypal.com"
	}
	return "https://api-m.sandbox.paypal.com"
}

func (s *Server) paypalAccessToken(c *echo.Context, settings paypalGatewaySettings) (string, error) {
	req, err := http.NewRequestWithContext(c.Request().Context(), http.MethodPost, paypalBaseURL(settings.Mode)+"/v1/oauth2/token", strings.NewReader("grant_type=client_credentials"))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(settings.ClientID+":"+settings.ClientSecret)))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var out struct {
		AccessToken string `json:"access_token"`
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return "", errors.New("paypal token rejected")
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if out.AccessToken == "" {
		return "", errors.New("empty paypal token")
	}
	return out.AccessToken, nil
}

func (s *Server) paypalJSON(c *echo.Context, settings paypalGatewaySettings, token, method, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		data, _ := json.Marshal(body)
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(c.Request().Context(), method, paypalBaseURL(settings.Mode)+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("PayPal-Request-Id", uuid.New().String())
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return fmt.Errorf("paypal status %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func (s *Server) verifyPayPalWebhook(c *echo.Context, settings paypalGatewaySettings, body []byte) bool {
	token, err := s.paypalAccessToken(c, settings)
	if err != nil {
		return false
	}
	var event any
	if err := json.Unmarshal(body, &event); err != nil {
		return false
	}
	payload := map[string]any{
		"auth_algo":         c.Request().Header.Get("Paypal-Auth-Algo"),
		"cert_url":          c.Request().Header.Get("Paypal-Cert-Url"),
		"transmission_id":   c.Request().Header.Get("Paypal-Transmission-Id"),
		"transmission_sig":  c.Request().Header.Get("Paypal-Transmission-Sig"),
		"transmission_time": c.Request().Header.Get("Paypal-Transmission-Time"),
		"webhook_id":        settings.WebhookID,
		"webhook_event":     event,
	}
	var out struct {
		VerificationStatus string `json:"verification_status"`
	}
	if err := s.paypalJSON(c, settings, token, http.MethodPost, "/v1/notifications/verify-webhook-signature", payload, &out); err != nil {
		return false
	}
	return out.VerificationStatus == "SUCCESS"
}

func (s *Server) completePayPalTransaction(c *echo.Context, orderID, expectedUserID string, raw any) (userSubscriptionDTO, error) {
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
		WHERE provider = 'paypal' AND provider_order_id = ?
	`), orderID).Scan(&tx.ID, &tx.UserID, &tx.PackageID, &tx.Status, &tx.SubscriptionID)
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
	if !paypalRawLooksCompleted(raw) {
		return userSubscriptionDTO{}, Fail(http.StatusBadRequest, "payment_not_completed", "PayPal payment is not completed", nil)
	}
	dto, err := s.activateSubscription(c, tx.UserID, tx.PackageID, "paypal", orderID)
	if err != nil {
		return userSubscriptionDTO{}, err
	}
	_, err = s.deps.DB.ExecContext(c.Request().Context(), s.contentSQL(`
		UPDATE payment_transactions
		SET status = 'completed', subscription_id = ?, raw_json = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`), dto.ID, mustJSON(raw), tx.ID)
	if err != nil {
		return userSubscriptionDTO{}, Fail(http.StatusInternalServerError, "internal", "could not update payment transaction", nil)
	}
	return dto, nil
}

func (s *Server) getUserSubscriptionByID(c *echo.Context, id string) (userSubscriptionDTO, error) {
	row := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		SELECT id, user_id, package_id, role_id, provider, provider_ref, status, starts_at, expires_at, created_at, updated_at
		FROM user_subscriptions WHERE id = ?
	`), id)
	dto, err := scanUserSubscription(row)
	if err != nil {
		return dto, Fail(http.StatusInternalServerError, "internal", "could not read subscription", nil)
	}
	return dto, nil
}

func paypalRawLooksCompleted(raw any) bool {
	data, _ := json.Marshal(raw)
	text := strings.ToUpper(string(data))
	return strings.Contains(text, `"STATUS":"COMPLETED"`) || strings.Contains(text, `"EVENT_TYPE":"PAYMENT.CAPTURE.COMPLETED"`)
}

func paypalOrderIDFromResource(resource map[string]any) string {
	for _, key := range []string{"supplementary_data", "related_ids"} {
		if next, ok := resource[key].(map[string]any); ok {
			resource = next
		}
	}
	for _, key := range []string{"order_id", "id"} {
		if v, ok := resource[key].(string); ok && v != "" {
			return v
		}
	}
	return ""
}

func mustJSON(v any) string {
	data, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(data)
}

func (s *Server) getSubscriptionPackageForPayment(c *echo.Context, id string) (subscriptionPackageDTO, error) {
	row := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		SELECT id, slug, name, role_id, price, currency, image_url, description, features_json, access_days, published, created_at, updated_at
		FROM subscription_packages
		WHERE id = ? AND published = 1
	`), id)
	dto, err := scanSubscriptionPackage(row, publicPackageURL(c))
	if errors.Is(err, sql.ErrNoRows) {
		return dto, Fail(http.StatusNotFound, "not_found", "published package not found", nil)
	}
	if err != nil {
		return dto, Fail(http.StatusInternalServerError, "internal", "could not read package", nil)
	}
	if dto.Price <= 0 {
		return dto, Fail(http.StatusBadRequest, "bad_request", "package price must be greater than zero for PayPal checkout", nil)
	}
	return dto, nil
}
