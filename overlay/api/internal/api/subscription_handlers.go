package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"
	"uuid"

	"github.com/labstack/echo/v5"
)

var packageSlugRE = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

type subscriptionPackageDTO struct {
	ID          string    `json:"id"`
	Slug        string    `json:"slug"`
	Name        string    `json:"name"`
	RoleID      string    `json:"role_id"`
	Price       float64   `json:"price"`
	Currency    string    `json:"currency"`
	ImageURL    string    `json:"image_url"`
	Description string    `json:"description"`
	Features    []string  `json:"features"`
	AccessDays  int64     `json:"access_days"`
	Published   bool      `json:"published"`
	PublicURL   string    `json:"public_url"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type subscriptionPackageBody struct {
	Slug        string   `json:"slug"`
	Name        string   `json:"name"`
	RoleID      string   `json:"role_id"`
	Price       float64  `json:"price"`
	Currency    string   `json:"currency"`
	ImageURL    string   `json:"image_url"`
	Description string   `json:"description"`
	Features    []string `json:"features"`
	AccessDays  int64    `json:"access_days"`
	Published   bool     `json:"published"`
}

type userSubscriptionDTO struct {
	ID          string     `json:"id"`
	UserID      string     `json:"user_id"`
	PackageID   string     `json:"package_id"`
	RoleID      string     `json:"role_id"`
	Provider    string     `json:"provider"`
	ProviderRef string     `json:"provider_ref"`
	Status      string     `json:"status"`
	StartsAt    *time.Time `json:"starts_at"`
	ExpiresAt   *time.Time `json:"expires_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type subscriptionGrantBody struct {
	UserID      string `json:"user_id"`
	PackageID   string `json:"package_id"`
	Provider    string `json:"provider"`
	ProviderRef string `json:"provider_ref"`
}

func (s *Server) subscriptionRoutes(g *echo.Group) {
	admin := g.Group("/admin/subscriptions", s.requireAdmin)
	admin.GET("/packages", s.handleAdminListSubscriptionPackages)
	admin.POST("/packages", s.handleAdminCreateSubscriptionPackage)
	admin.PATCH("/packages/:id", s.handleAdminUpdateSubscriptionPackage)
	admin.DELETE("/packages/:id", s.handleAdminDeleteSubscriptionPackage)
	admin.GET("/records", s.handleAdminListUserSubscriptions)
	admin.POST("/grant", s.handleAdminGrantSubscription)
}

func (s *Server) publicSubscriptionRoutes(g *echo.Group) {
	g.GET("/packages/:slug", s.handlePublicGetSubscriptionPackage)
}

func (s *Server) handleAdminListSubscriptionPackages(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	rows, err := s.deps.DB.QueryContext(c.Request().Context(), s.contentSQL(`
		SELECT id, slug, name, role_id, price, currency, image_url, description, features_json, access_days, published, created_at, updated_at
		FROM subscription_packages
		ORDER BY created_at DESC
	`))
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not list packages", nil)
	}
	defer rows.Close()
	out := []subscriptionPackageDTO{}
	for rows.Next() {
		row, err := scanSubscriptionPackage(rows, publicPackageURL(c))
		if err != nil {
			return Fail(http.StatusInternalServerError, "internal", "could not read package", nil)
		}
		out = append(out, row)
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) handleAdminCreateSubscriptionPackage(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	var in subscriptionPackageBody
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	normalized, err := normalizeSubscriptionPackage(in)
	if err != nil {
		return Fail(http.StatusBadRequest, "bad_request", err.Error(), nil)
	}
	if err := s.ensureRoleExists(c, normalized.RoleID); err != nil {
		return err
	}
	featuresJSON, _ := json.Marshal(normalized.Features)
	id := uuid.New().String()
	row := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		INSERT INTO subscription_packages (id, slug, name, role_id, price, currency, image_url, description, features_json, access_days, published)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		RETURNING id, slug, name, role_id, price, currency, image_url, description, features_json, access_days, published, created_at, updated_at
	`), id, normalized.Slug, normalized.Name, normalized.RoleID, normalized.Price, normalized.Currency, normalized.ImageURL, normalized.Description, string(featuresJSON), normalized.AccessDays, boolInt(normalized.Published))
	dto, err := scanSubscriptionPackage(row, publicPackageURL(c))
	if err != nil {
		return Fail(http.StatusConflict, "conflict", "could not create package", nil)
	}
	return c.JSON(http.StatusCreated, dto)
}

func (s *Server) handleAdminUpdateSubscriptionPackage(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	var in subscriptionPackageBody
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	normalized, err := normalizeSubscriptionPackage(in)
	if err != nil {
		return Fail(http.StatusBadRequest, "bad_request", err.Error(), nil)
	}
	if err := s.ensureRoleExists(c, normalized.RoleID); err != nil {
		return err
	}
	featuresJSON, _ := json.Marshal(normalized.Features)
	row := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		UPDATE subscription_packages
		SET slug = ?, name = ?, role_id = ?, price = ?, currency = ?, image_url = ?, description = ?, features_json = ?, access_days = ?, published = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
		RETURNING id, slug, name, role_id, price, currency, image_url, description, features_json, access_days, published, created_at, updated_at
	`), normalized.Slug, normalized.Name, normalized.RoleID, normalized.Price, normalized.Currency, normalized.ImageURL, normalized.Description, string(featuresJSON), normalized.AccessDays, boolInt(normalized.Published), c.Param("id"))
	dto, err := scanSubscriptionPackage(row, publicPackageURL(c))
	if errors.Is(err, sql.ErrNoRows) {
		return Fail(http.StatusNotFound, "not_found", "package not found", nil)
	}
	if err != nil {
		return Fail(http.StatusConflict, "conflict", "could not update package", nil)
	}
	return c.JSON(http.StatusOK, dto)
}

func (s *Server) handleAdminDeleteSubscriptionPackage(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	res, err := s.deps.DB.ExecContext(c.Request().Context(), s.contentSQL(`DELETE FROM subscription_packages WHERE id = ?`), c.Param("id"))
	if err != nil {
		return Fail(http.StatusConflict, "conflict", "package has subscription records", nil)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return Fail(http.StatusNotFound, "not_found", "package not found", nil)
	}
	return c.NoContent(http.StatusNoContent)
}

func (s *Server) handlePublicGetSubscriptionPackage(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	row := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		SELECT id, slug, name, role_id, price, currency, image_url, description, features_json, access_days, published, created_at, updated_at
		FROM subscription_packages
		WHERE slug = ? AND published = 1
	`), c.Param("slug"))
	dto, err := scanSubscriptionPackage(row, publicPackageURL(c))
	if errors.Is(err, sql.ErrNoRows) {
		return Fail(http.StatusNotFound, "not_found", "package not found", nil)
	}
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not read package", nil)
	}
	return c.JSON(http.StatusOK, dto)
}

func (s *Server) handleAdminListUserSubscriptions(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	rows, err := s.deps.DB.QueryContext(c.Request().Context(), s.contentSQL(`
		SELECT id, user_id, package_id, role_id, provider, provider_ref, status, starts_at, expires_at, created_at, updated_at
		FROM user_subscriptions
		ORDER BY created_at DESC
		LIMIT 200
	`))
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not list subscriptions", nil)
	}
	defer rows.Close()
	out := []userSubscriptionDTO{}
	for rows.Next() {
		dto, err := scanUserSubscription(rows)
		if err != nil {
			return Fail(http.StatusInternalServerError, "internal", "could not read subscription", nil)
		}
		out = append(out, dto)
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) handleAdminGrantSubscription(c *echo.Context) error {
	var in subscriptionGrantBody
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	if strings.TrimSpace(in.Provider) == "" {
		in.Provider = "manual"
	}
	dto, err := s.activateSubscription(c, strings.TrimSpace(in.UserID), strings.TrimSpace(in.PackageID), cleanRoleText(in.Provider, 40), cleanRoleText(in.ProviderRef, 120))
	if err != nil {
		return err
	}
	return c.JSON(http.StatusCreated, dto)
}

func (s *Server) activateSubscription(c *echo.Context, userID, packageID, provider, providerRef string) (userSubscriptionDTO, error) {
	if s.deps.DB == nil {
		return userSubscriptionDTO{}, contentDBUnavailable()
	}
	if _, err := s.deps.Store.GetUserByID(c.Request().Context(), userID); err != nil {
		return userSubscriptionDTO{}, Fail(http.StatusNotFound, "not_found", "user not found", nil)
	}
	var roleID string
	var accessDays int64
	err := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		SELECT role_id, access_days FROM subscription_packages WHERE id = ?
	`), packageID).Scan(&roleID, &accessDays)
	if errors.Is(err, sql.ErrNoRows) {
		return userSubscriptionDTO{}, Fail(http.StatusNotFound, "not_found", "package not found", nil)
	}
	if err != nil {
		return userSubscriptionDTO{}, Fail(http.StatusInternalServerError, "internal", "could not read package", nil)
	}
	now := time.Now().UTC()
	expiresAt := now.AddDate(0, 0, int(accessDays))
	row := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		INSERT INTO user_subscriptions (id, user_id, package_id, role_id, provider, provider_ref, status, starts_at, expires_at)
		VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
		RETURNING id, user_id, package_id, role_id, provider, provider_ref, status, starts_at, expires_at, created_at, updated_at
	`), uuid.New().String(), userID, packageID, roleID, provider, providerRef, now, expiresAt)
	dto, err := scanUserSubscription(row)
	if err != nil {
		return userSubscriptionDTO{}, Fail(http.StatusInternalServerError, "internal", "could not create subscription", nil)
	}
	if _, err := s.deps.DB.ExecContext(c.Request().Context(), s.contentSQL(`
		INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)
		ON CONFLICT(user_id, role_id) DO NOTHING
	`), userID, roleID); err != nil {
		return userSubscriptionDTO{}, Fail(http.StatusInternalServerError, "internal", "could not grant role", nil)
	}
	return dto, nil
}

func normalizeSubscriptionPackage(in subscriptionPackageBody) (subscriptionPackageBody, error) {
	in.Name = cleanRoleText(in.Name, 100)
	in.Slug = strings.ToLower(cleanRoleText(in.Slug, 100))
	in.RoleID = cleanRoleText(in.RoleID, 120)
	in.Currency = strings.ToUpper(cleanRoleText(in.Currency, 12))
	in.ImageURL = cleanRoleText(in.ImageURL, 500)
	in.Description = cleanRoleText(in.Description, 2000)
	if in.Name == "" {
		return in, errors.New("package name is required")
	}
	if !packageSlugRE.MatchString(in.Slug) {
		return in, errors.New("slug must use lowercase letters, numbers, and hyphens")
	}
	if in.RoleID == "" {
		return in, errors.New("role is required")
	}
	if in.Price < 0 {
		return in, errors.New("price must be >= 0")
	}
	if in.Currency == "" {
		in.Currency = "USD"
	}
	if in.AccessDays <= 0 {
		return in, errors.New("access days must be greater than zero")
	}
	features := []string{}
	for _, feature := range in.Features {
		feature = cleanRoleText(feature, 160)
		if feature != "" {
			features = append(features, feature)
		}
	}
	in.Features = features
	return in, nil
}

func (s *Server) ensureRoleExists(c *echo.Context, roleID string) error {
	var n int64
	if err := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`SELECT COUNT(*) FROM roles WHERE id = ?`), roleID).Scan(&n); err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not validate role", nil)
	}
	if n == 0 {
		return Fail(http.StatusBadRequest, "bad_request", "unknown role id", nil)
	}
	return nil
}

func scanSubscriptionPackage(scanner interface{ Scan(dest ...any) error }, publicBase string) (subscriptionPackageDTO, error) {
	var dto subscriptionPackageDTO
	var featuresJSON string
	var published int64
	if err := scanner.Scan(&dto.ID, &dto.Slug, &dto.Name, &dto.RoleID, &dto.Price, &dto.Currency, &dto.ImageURL, &dto.Description, &featuresJSON, &dto.AccessDays, &published, &dto.CreatedAt, &dto.UpdatedAt); err != nil {
		return dto, err
	}
	_ = json.Unmarshal([]byte(featuresJSON), &dto.Features)
	if dto.Features == nil {
		dto.Features = []string{}
	}
	dto.Published = published == 1
	dto.PublicURL = strings.TrimRight(publicBase, "/") + "/api/v1/public/packages/" + dto.Slug
	return dto, nil
}

func scanUserSubscription(scanner interface{ Scan(dest ...any) error }) (userSubscriptionDTO, error) {
	var dto userSubscriptionDTO
	var starts sql.NullTime
	var expires sql.NullTime
	if err := scanner.Scan(&dto.ID, &dto.UserID, &dto.PackageID, &dto.RoleID, &dto.Provider, &dto.ProviderRef, &dto.Status, &starts, &expires, &dto.CreatedAt, &dto.UpdatedAt); err != nil {
		return dto, err
	}
	if starts.Valid {
		dto.StartsAt = &starts.Time
	}
	if expires.Valid {
		dto.ExpiresAt = &expires.Time
	}
	return dto, nil
}

func publicPackageURL(c *echo.Context) string {
	req := c.Request()
	scheme := req.Header.Get("X-Forwarded-Proto")
	if scheme == "" {
		scheme = "https"
	}
	host := req.Host
	if forwarded := req.Header.Get("X-Forwarded-Host"); forwarded != "" {
		host = forwarded
	}
	return fmt.Sprintf("%s://%s", scheme, host)
}
