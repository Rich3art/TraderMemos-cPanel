package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/tradermemos/api/internal/auth"
)

// The signed-in account. Until now nothing exposed it, so neither client could
// say who was logged in — the phone stored only a server URL and two opaque
// tokens.
func (s *Server) meRoutes(g *echo.Group) {
	g.GET("/me", s.handleMe)
	g.PUT("/me/password", s.handleChangePassword)
	g.POST("/me/totp/start", s.handleTotpStart)
	g.POST("/me/totp/confirm", s.handleTotpConfirm)
	g.POST("/me/totp/disable", s.handleTotpDisable)
	g.GET("/me/privacy/export", s.handlePrivacyExport)
	g.DELETE("/me/privacy", s.handlePrivacyDelete)
}

type meDTO struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	IsAdmin   bool      `json:"is_admin"`
	CreatedAt time.Time `json:"created_at"`
	// Reported so a client can show "2FA: off" without guessing. The column has
	// existed since the first users migration and is still never written.
	TotpEnabled bool     `json:"totp_enabled"`
	Permissions []string `json:"permissions"`
}

func (s *Server) handleMe(c *echo.Context) error {
	if s.deps.Auth == nil {
		return Fail(http.StatusServiceUnavailable, "unavailable", "auth not configured", nil)
	}
	u, err := s.deps.Auth.Me(c.Request().Context(), auth.UserID(c))
	if err != nil {
		return Fail(http.StatusUnauthorized, "unauthorized", "no such user", nil)
	}
	isAdmin := u.IsAdmin == 1
	perms, err := s.permissionsForUser(c, u.ID, isAdmin)
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not load permissions", nil)
	}
	return c.JSON(http.StatusOK, meDTO{
		ID:          u.ID,
		Email:       u.Email,
		IsAdmin:     isAdmin,
		CreatedAt:   u.CreatedAt,
		TotpEnabled: u.TotpSecret.Valid && u.TotpSecret.String != "",
		Permissions: perms,
	})
}

type changePasswordReq struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

func (s *Server) handleChangePassword(c *echo.Context) error {
	if s.deps.Auth == nil {
		return Fail(http.StatusServiceUnavailable, "unavailable", "auth not configured", nil)
	}
	var in changePasswordReq
	if err := c.Bind(&in); err != nil || in.CurrentPassword == "" || in.NewPassword == "" {
		return Fail(http.StatusBadRequest, "bad_request",
			"current_password and new_password required", nil)
	}
	toks, err := s.deps.Auth.ChangePassword(
		c.Request().Context(), auth.UserID(c), in.CurrentPassword, in.NewPassword)
	if errors.Is(err, auth.ErrPasswordTooShort) {
		return Fail(http.StatusBadRequest, "bad_request",
			"password must be at least "+strconv.Itoa(auth.MinPasswordLen)+" characters", nil)
	}
	if errors.Is(err, auth.ErrInvalidCredentials) {
		return Fail(http.StatusForbidden, "forbidden", "current password is incorrect", nil)
	}
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not change password", nil)
	}
	// Fresh pair for this caller: the new hash invalidates every token minted
	// against the old one, including the ones this request arrived with.
	return c.JSON(http.StatusOK, toks)
}

// Enrolment is two calls: start mints a candidate secret, confirm proves the
// user can read a code from it before anything is stored. Nothing is written
// in between — see auth.StartTotp for why it is stateless.
func (s *Server) handleTotpStart(c *echo.Context) error {
	if s.deps.Auth == nil {
		return Fail(http.StatusServiceUnavailable, "unavailable", "auth not configured", nil)
	}
	secret, url, err := s.deps.Auth.StartTotp(c.Request().Context(), auth.UserID(c))
	if errors.Is(err, auth.ErrTotpAlreadyOn) {
		return Fail(http.StatusConflict, "conflict", "an authenticator is already set up", nil)
	}
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not start setup", nil)
	}
	// The secret is returned for manual entry when a QR code cannot be scanned
	// — the phone showing this screen is often the phone holding the app.
	return c.JSON(http.StatusOK, map[string]any{"secret": secret, "otpauth_url": url})
}

type totpConfirmReq struct {
	Secret string `json:"secret"`
	Code   string `json:"code"`
}

func (s *Server) handleTotpConfirm(c *echo.Context) error {
	if s.deps.Auth == nil {
		return Fail(http.StatusServiceUnavailable, "unavailable", "auth not configured", nil)
	}
	var in totpConfirmReq
	if err := c.Bind(&in); err != nil || in.Secret == "" || in.Code == "" {
		return Fail(http.StatusBadRequest, "bad_request", "secret and code required", nil)
	}
	err := s.deps.Auth.ConfirmTotp(c.Request().Context(), auth.UserID(c), in.Secret, in.Code)
	if errors.Is(err, auth.ErrTotpAlreadyOn) {
		return Fail(http.StatusConflict, "conflict", "an authenticator is already set up", nil)
	}
	if errors.Is(err, auth.ErrTotpInvalid) {
		return Fail(http.StatusBadRequest, "totp_invalid", "that code is not valid", nil)
	}
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not enable", nil)
	}
	return c.NoContent(http.StatusNoContent)
}

type totpDisableReq struct {
	Password string `json:"password"`
	Code     string `json:"code"`
}

// POST rather than DELETE: turning a factor off carries a body (password and
// code), and DELETE with a body is poorly supported across proxies and clients.
func (s *Server) handleTotpDisable(c *echo.Context) error {
	if s.deps.Auth == nil {
		return Fail(http.StatusServiceUnavailable, "unavailable", "auth not configured", nil)
	}
	var in totpDisableReq
	if err := c.Bind(&in); err != nil || in.Password == "" || in.Code == "" {
		return Fail(http.StatusBadRequest, "bad_request", "password and code required", nil)
	}
	err := s.deps.Auth.DisableTotp(c.Request().Context(), auth.UserID(c), in.Password, in.Code)
	if errors.Is(err, auth.ErrTotpNotEnrolled) {
		return Fail(http.StatusConflict, "conflict", "no authenticator is set up", nil)
	}
	if errors.Is(err, auth.ErrTotpInvalid) {
		return Fail(http.StatusBadRequest, "totp_invalid", "that code is not valid", nil)
	}
	if errors.Is(err, auth.ErrInvalidCredentials) {
		return Fail(http.StatusForbidden, "forbidden", "password is incorrect", nil)
	}
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not disable", nil)
	}
	return c.NoContent(http.StatusNoContent)
}

type privacyExportDTO struct {
	ExportedAt time.Time                   `json:"exported_at"`
	User       map[string]any              `json:"user"`
	Data       map[string][]map[string]any `json:"data"`
}

type privacyDeleteReq struct {
	Confirmation string `json:"confirmation"`
}

var privacyExportTables = []string{
	"accounts",
	"import_batches",
	"executions",
	"trades",
	"cash_transactions",
	"tags",
	"setups",
	"trade_journal",
	"trade_attachments",
	"journal_notes",
	"media_files",
	"annual_goals",
	"prop_settings",
	"flex_sync_settings",
	"post_exit_excursion",
	"user_preferences",
	"alert_settings",
	"alert_channels",
	"alert_events",
	"coach_reviews",
	"setup_attachments",
	"psychology_questions",
	"risk_rules",
	"chart_annotations",
	"feedback",
	"analytics_email_settings",
	"daily_journal_reminders",
	"user_subscriptions",
}

func (s *Server) handlePrivacyExport(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	uid := auth.UserID(c)
	user, err := s.exportCurrentUser(c, uid)
	if err != nil {
		return err
	}
	data := map[string][]map[string]any{}
	for _, table := range privacyExportTables {
		rows, err := s.exportTableByUser(c, table, uid)
		if err != nil {
			return err
		}
		data[table] = rows
	}
	if rows, err := s.exportAccessTokenMetadata(c, uid); err != nil {
		return err
	} else {
		data["access_tokens"] = rows
	}
	if rows, err := s.exportPaymentTransactions(c, uid); err != nil {
		return err
	} else {
		data["payment_transactions"] = rows
	}
	c.Response().Header().Set(echo.HeaderContentDisposition, `attachment; filename="tradermemos-my-data.json"`)
	return c.JSON(http.StatusOK, privacyExportDTO{
		ExportedAt: time.Now().UTC(),
		User:       user,
		Data:       data,
	})
}

func (s *Server) handlePrivacyDelete(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	var in privacyDeleteReq
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	if strings.TrimSpace(in.Confirmation) != "DELETE" {
		return Fail(http.StatusBadRequest, "bad_request", `type "DELETE" to confirm account deletion`, nil)
	}
	uid := auth.UserID(c)
	if err := s.ensureUserCanSelfDelete(c, uid); err != nil {
		return err
	}
	keys, err := s.collectUserStorageKeys(c, uid)
	if err != nil {
		return err
	}
	tx, err := s.deps.DB.BeginTx(c.Request().Context(), nil)
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not start deletion", nil)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(c.Request().Context(), s.contentSQL(`
		UPDATE payment_transactions
		SET user_id = NULL, buyer_label = 'Deleted User', raw_json = '{}', updated_at = CURRENT_TIMESTAMP
		WHERE user_id = ?
	`), uid); err != nil && !isMissingPrivacyTable(err) {
		return Fail(http.StatusInternalServerError, "internal", "could not anonymize payment records", nil)
	}
	if _, err := tx.ExecContext(c.Request().Context(), s.contentSQL(`DELETE FROM users WHERE id = ?`), uid); err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not delete account", nil)
	}
	if err := tx.Commit(); err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not finish account deletion", nil)
	}
	if s.deps.Storage != nil {
		for _, key := range keys {
			_ = s.deps.Storage.Delete(key)
		}
	}
	return c.NoContent(http.StatusNoContent)
}

func (s *Server) exportCurrentUser(c *echo.Context, userID string) (map[string]any, error) {
	row := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		SELECT id, email, created_at, is_admin, CASE WHEN totp_secret IS NULL OR totp_secret = '' THEN 0 ELSE 1 END
		FROM users WHERE id = ?
	`), userID)
	var id, email string
	var createdAt time.Time
	var isAdmin int
	var totpEnabled int
	if err := row.Scan(&id, &email, &createdAt, &isAdmin, &totpEnabled); err != nil {
		return nil, Fail(http.StatusInternalServerError, "internal", "could not export user profile", nil)
	}
	return map[string]any{
		"id": id, "email": email, "created_at": createdAt,
		"is_admin": isAdmin == 1, "totp_enabled": totpEnabled == 1,
	}, nil
}

func (s *Server) exportTableByUser(c *echo.Context, table, userID string) ([]map[string]any, error) {
	return s.exportRows(c, `SELECT * FROM `+table+` WHERE user_id = ?`, userID)
}

func (s *Server) exportAccessTokenMetadata(c *echo.Context, userID string) ([]map[string]any, error) {
	return s.exportRows(c, `
		SELECT id, name, created_at, expires_at, last_used_at, revoked_at
		FROM access_tokens WHERE user_id = ?
	`, userID)
}

func (s *Server) exportPaymentTransactions(c *echo.Context, userID string) ([]map[string]any, error) {
	return s.exportRows(c, `
		SELECT id, package_id, provider, provider_order_id, provider_capture_id, status,
		       amount, currency, subscription_id, buyer_label, created_at, updated_at
		FROM payment_transactions WHERE user_id = ?
	`, userID)
}

func (s *Server) exportRows(c *echo.Context, query string, args ...any) ([]map[string]any, error) {
	rows, err := s.deps.DB.QueryContext(c.Request().Context(), s.contentSQL(query), args...)
	if err != nil {
		if isMissingPrivacyTable(err) {
			return []map[string]any{}, nil
		}
		return nil, Fail(http.StatusInternalServerError, "internal", "could not export data", nil)
	}
	defer rows.Close()
	cols, err := rows.Columns()
	if err != nil {
		return nil, Fail(http.StatusInternalServerError, "internal", "could not read export columns", nil)
	}
	out := []map[string]any{}
	for rows.Next() {
		values := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range values {
			ptrs[i] = &values[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, Fail(http.StatusInternalServerError, "internal", "could not read export row", nil)
		}
		row := map[string]any{}
		for i, col := range cols {
			row[col] = normalizePrivacyValue(values[i])
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, Fail(http.StatusInternalServerError, "internal", "could not finish export", nil)
	}
	return out, nil
}

func normalizePrivacyValue(v any) any {
	switch x := v.(type) {
	case []byte:
		var decoded any
		if json.Valid(x) && json.Unmarshal(x, &decoded) == nil {
			return decoded
		}
		return string(x)
	default:
		return x
	}
}

func (s *Server) ensureUserCanSelfDelete(c *echo.Context, userID string) error {
	var isAdmin int
	if err := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		SELECT is_admin FROM users WHERE id = ?
	`), userID).Scan(&isAdmin); err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not verify account", nil)
	}
	if isAdmin != 1 {
		return nil
	}
	var admins int
	if err := s.deps.DB.QueryRowContext(c.Request().Context(), `SELECT COUNT(*) FROM users WHERE is_admin = 1`).Scan(&admins); err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not verify administrator count", nil)
	}
	if admins <= 1 {
		return Fail(http.StatusConflict, "last_admin", "create another administrator before deleting this account", nil)
	}
	return nil
}

func (s *Server) collectUserStorageKeys(c *echo.Context, userID string) ([]string, error) {
	tables := []string{"trade_attachments", "setup_attachments", "media_files"}
	seen := map[string]bool{}
	keys := []string{}
	for _, table := range tables {
		rows, err := s.exportRows(c, `SELECT storage_key FROM `+table+` WHERE user_id = ?`, userID)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			key, _ := row["storage_key"].(string)
			if key == "" || seen[key] {
				continue
			}
			seen[key] = true
			keys = append(keys, key)
		}
	}
	return keys, nil
}

func isMissingPrivacyTable(err error) bool {
	if err == nil || errors.Is(err, sql.ErrNoRows) {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "no such table") ||
		strings.Contains(msg, "does not exist") ||
		strings.Contains(msg, "no such column")
}
