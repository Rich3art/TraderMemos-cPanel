package api

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha512"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
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

type paystackGatewayDTO struct {
	Enabled       bool   `json:"enabled"`
	PublicKey     string `json:"public_key"`
	SecretKeySet  bool   `json:"secret_key_set"`
	SecretKeyHint string `json:"secret_key_hint,omitempty"`
	UpdatedAt     string `json:"updated_at,omitempty"`
}

type paystackGatewayPut struct {
	Enabled        bool   `json:"enabled"`
	PublicKey      string `json:"public_key"`
	SecretKey      string `json:"secret_key"`
	ClearSecretKey bool   `json:"clear_secret_key"`
}

type paystackGatewaySettings struct {
	Enabled   bool
	PublicKey string
	SecretKey string
	UpdatedAt time.Time
}

type paystackInitializeBody struct {
	PackageID   string `json:"package_id"`
	Email       string `json:"email"`
	CallbackURL string `json:"callback_url"`
}

type paystackInitializeResponse struct {
	AuthorizationURL string `json:"authorization_url"`
	AccessCode       string `json:"access_code"`
	Reference        string `json:"reference"`
	PublicKey        string `json:"public_key"`
}

func (s *Server) paystackGatewayRoutes(g *echo.Group) {
	admin := g.Group("/settings/payment-gateways/paystack", s.requireAdmin)
	admin.GET("", s.handleGetPaystackGatewaySettings)
	admin.PUT("", s.handlePutPaystackGatewaySettings)
}

func (s *Server) publicPaystackRoutes(g *echo.Group) {
	g.POST("/webhooks/paystack", s.handlePaystackWebhook)
}

func (s *Server) handleGetPaystackGatewaySettings(c *echo.Context) error {
	settings, err := s.getPaystackGatewaySettings(c)
	if errors.Is(err, sql.ErrNoRows) {
		return c.JSON(http.StatusOK, paystackGatewayDTO{})
	}
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not load Paystack settings", nil)
	}
	return c.JSON(http.StatusOK, paystackGatewayToDTO(settings))
}

func (s *Server) handlePutPaystackGatewaySettings(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	var in paystackGatewayPut
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	publicKey := cleanRoleText(in.PublicKey, 300)
	existing, err := s.getPaystackGatewaySettings(c)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return Fail(http.StatusInternalServerError, "internal", "could not load existing Paystack settings", nil)
	}
	secretKey := existing.SecretKey
	if in.ClearSecretKey {
		secretKey = ""
	} else if strings.TrimSpace(in.SecretKey) != "" {
		secretKey = strings.TrimSpace(in.SecretKey)
	}
	row := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		INSERT INTO paystack_gateway_settings (id, enabled, public_key, secret_key, updated_at)
		VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, public_key = excluded.public_key, secret_key = excluded.secret_key, updated_at = CURRENT_TIMESTAMP
		RETURNING enabled, public_key, secret_key, updated_at
	`), boolInt(in.Enabled), publicKey, secretKey)
	settings, err := scanPaystackGateway(row)
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not save Paystack settings", nil)
	}
	return c.JSON(http.StatusOK, paystackGatewayToDTO(settings))
}

func (s *Server) handleInitializePaystackTransaction(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	uid := auth.UserID(c)
	var in paystackInitializeBody
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	email := strings.TrimSpace(in.Email)
	if email == "" {
		if user, err := s.deps.Store.GetUserByID(c.Request().Context(), uid); err == nil {
			email = user.Email
		}
	}
	if email == "" {
		return Fail(http.StatusBadRequest, "bad_request", "email is required for Paystack", nil)
	}
	pkg, err := s.getSubscriptionPackageForPayment(c, strings.TrimSpace(in.PackageID))
	if err != nil {
		return err
	}
	settings, err := s.getEnabledPaystackSettings(c)
	if err != nil {
		return err
	}
	reference := uuid.New().String()
	callbackURL := cleanRoleText(in.CallbackURL, 500)
	if callbackURL == "" {
		callbackURL = strings.TrimRight(publicPackageURL(c), "/") + "/"
	}
	payload := map[string]any{
		"email":        email,
		"amount":       int64(pkg.Price * 100),
		"currency":     strings.ToUpper(pkg.Currency),
		"reference":    reference,
		"callback_url": callbackURL,
		"metadata": map[string]any{
			"order_id":   reference,
			"user_id":    uid,
			"package_id": pkg.ID,
		},
	}
	var initialized struct {
		Status bool `json:"status"`
		Data   struct {
			AuthorizationURL string `json:"authorization_url"`
			AccessCode       string `json:"access_code"`
			Reference        string `json:"reference"`
		} `json:"data"`
	}
	if err := s.paystackJSON(c, settings, http.MethodPost, "/transaction/initialize", payload, &initialized); err != nil || !initialized.Status {
		return Fail(http.StatusBadGateway, "paystack_unavailable", "could not initialize Paystack transaction", nil)
	}
	if _, err := s.deps.DB.ExecContext(c.Request().Context(), s.contentSQL(`
		INSERT INTO payment_transactions (id, user_id, package_id, provider, provider_order_id, status, amount, currency, raw_json)
		VALUES (?, ?, ?, 'paystack', ?, 'pending', ?, ?, ?)
		ON CONFLICT(provider, provider_order_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
	`), reference, uid, pkg.ID, initialized.Data.Reference, pkg.Price, pkg.Currency, mustJSON(initialized)); err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not store Paystack transaction", nil)
	}
	return c.JSON(http.StatusCreated, paystackInitializeResponse{
		AuthorizationURL: initialized.Data.AuthorizationURL,
		AccessCode:       initialized.Data.AccessCode,
		Reference:        initialized.Data.Reference,
		PublicKey:        settings.PublicKey,
	})
}

func (s *Server) handleVerifyPaystackTransaction(c *echo.Context) error {
	reference := cleanRoleText(c.Param("reference"), 160)
	if reference == "" {
		return Fail(http.StatusBadRequest, "bad_request", "reference is required", nil)
	}
	settings, err := s.getEnabledPaystackSettings(c)
	if err != nil {
		return err
	}
	var verified map[string]any
	if err := s.paystackJSON(c, settings, http.MethodGet, "/transaction/verify/"+reference, nil, &verified); err != nil {
		return Fail(http.StatusBadGateway, "paystack_unavailable", "could not verify Paystack transaction", nil)
	}
	dto, err := s.completePaystackTransaction(c, reference, verified)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, dto)
}

func (s *Server) handlePaystackWebhook(c *echo.Context) error {
	settings, err := s.getEnabledPaystackSettings(c)
	if err != nil {
		return c.NoContent(http.StatusServiceUnavailable)
	}
	body, err := io.ReadAll(c.Request().Body)
	if err != nil {
		return c.NoContent(http.StatusBadRequest)
	}
	if !verifyPaystackWebhook(c, settings.SecretKey, body) {
		return c.NoContent(http.StatusUnauthorized)
	}
	var event map[string]any
	if err := json.Unmarshal(body, &event); err != nil {
		return c.NoContent(http.StatusBadRequest)
	}
	if typ, _ := event["event"].(string); typ == "charge.success" {
		data, _ := event["data"].(map[string]any)
		ref, _ := data["reference"].(string)
		if ref != "" {
			_, _ = s.completePaystackTransaction(c, ref, event)
		}
	}
	return c.NoContent(http.StatusNoContent)
}

func (s *Server) completePaystackTransaction(c *echo.Context, reference string, raw map[string]any) (userSubscriptionDTO, error) {
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
		WHERE provider = 'paystack' AND provider_order_id = ?
	`), reference).Scan(&tx.ID, &tx.UserID, &tx.PackageID, &tx.Status, &tx.SubscriptionID)
	if errors.Is(err, sql.ErrNoRows) {
		return userSubscriptionDTO{}, Fail(http.StatusNotFound, "not_found", "payment transaction not found", nil)
	}
	if err != nil {
		return userSubscriptionDTO{}, Fail(http.StatusInternalServerError, "internal", "could not load payment transaction", nil)
	}
	if tx.Status == "completed" && tx.SubscriptionID != "" {
		return s.getUserSubscriptionByID(c, tx.SubscriptionID)
	}
	if !paystackRawSucceeded(raw) {
		return userSubscriptionDTO{}, Fail(http.StatusBadRequest, "payment_not_completed", "Paystack payment is not successful", nil)
	}
	providerRef := paystackTransactionID(raw)
	dto, err := s.activateSubscription(c, tx.UserID, tx.PackageID, "paystack", providerRef)
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

func (s *Server) getEnabledPaystackSettings(c *echo.Context) (paystackGatewaySettings, error) {
	settings, err := s.getPaystackGatewaySettings(c)
	if errors.Is(err, sql.ErrNoRows) || !settings.Enabled || settings.SecretKey == "" {
		return settings, Fail(http.StatusBadRequest, "paystack_not_configured", "Paystack is not configured", nil)
	}
	if err != nil {
		return settings, Fail(http.StatusInternalServerError, "internal", "could not load Paystack settings", nil)
	}
	return settings, nil
}

func (s *Server) getPaystackGatewaySettings(c *echo.Context) (paystackGatewaySettings, error) {
	if s.deps.DB == nil {
		return paystackGatewaySettings{}, contentDBUnavailable()
	}
	row := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		SELECT enabled, public_key, secret_key, updated_at
		FROM paystack_gateway_settings WHERE id = 1
	`))
	return scanPaystackGateway(row)
}

func scanPaystackGateway(scanner interface{ Scan(dest ...any) error }) (paystackGatewaySettings, error) {
	var out paystackGatewaySettings
	var enabled int64
	if err := scanner.Scan(&enabled, &out.PublicKey, &out.SecretKey, &out.UpdatedAt); err != nil {
		return out, err
	}
	out.Enabled = enabled == 1
	return out, nil
}

func paystackGatewayToDTO(settings paystackGatewaySettings) paystackGatewayDTO {
	return paystackGatewayDTO{
		Enabled:       settings.Enabled,
		PublicKey:     settings.PublicKey,
		SecretKeySet:  settings.SecretKey != "",
		SecretKeyHint: secretHint(settings.SecretKey),
		UpdatedAt:     settings.UpdatedAt.Format(time.RFC3339),
	}
}

func (s *Server) paystackJSON(c *echo.Context, settings paystackGatewaySettings, method, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		data, _ := json.Marshal(body)
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(c.Request().Context(), method, "https://api.paystack.co"+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+settings.SecretKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return fmt.Errorf("paystack status %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func verifyPaystackWebhook(c *echo.Context, secret string, body []byte) bool {
	signature := c.Request().Header.Get("x-paystack-signature")
	if secret == "" || signature == "" {
		return false
	}
	mac := hmac.New(sha512.New, []byte(secret))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	return subtle.ConstantTimeCompare([]byte(strings.ToLower(signature)), []byte(expected)) == 1
}

func paystackRawSucceeded(raw map[string]any) bool {
	if status, _ := raw["status"].(bool); !status {
		if _, exists := raw["event"]; !exists {
			return false
		}
	}
	data, _ := raw["data"].(map[string]any)
	transactionStatus, _ := data["status"].(string)
	return transactionStatus == "success"
}

func paystackTransactionID(raw map[string]any) string {
	data, _ := raw["data"].(map[string]any)
	if id, ok := data["id"].(string); ok {
		return id
	}
	if id, ok := data["id"].(float64); ok {
		return fmt.Sprintf("%.0f", id)
	}
	if reference, ok := data["reference"].(string); ok {
		return reference
	}
	return ""
}
