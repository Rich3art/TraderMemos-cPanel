package api

import (
	"database/sql"
	"net/http"
	"strings"
	"time"
	"uuid"

	"github.com/labstack/echo/v5"
	"github.com/tradermemos/api/internal/auth"
)

type permissionDef struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
	Group       string `json:"group"`
}

type roleDTO struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	BuiltIn     bool      `json:"built_in"`
	Permissions []string  `json:"permissions"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type roleBody struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Permissions []string `json:"permissions"`
}

type userRolesBody struct {
	RoleIDs []string `json:"role_ids"`
}

var permissionCatalog = []permissionDef{
	{"*", "All permissions", "Full access to every current and future feature.", "System"},
	{"menu.home", "Menu: Home", "Show Home in navigation.", "Menus"},
	{"menu.trades", "Menu: Trades", "Show Trades in navigation.", "Menus"},
	{"menu.calendar", "Menu: Calendar", "Show Calendar in navigation.", "Menus"},
	{"menu.reports", "Menu: Reports", "Show Reports in navigation.", "Menus"},
	{"menu.events", "Menu: Events", "Show Events in navigation.", "Menus"},
	{"menu.news", "Menu: News", "Show News in navigation.", "Menus"},
	{"menu.get_funded", "Menu: Get Funded", "Show Get Funded in navigation.", "Menus"},
	{"menu.resources", "Menu: Resources", "Show Resources in navigation.", "Menus"},
	{"menu.notes", "Menu: Notes", "Show Notes in navigation.", "Menus"},
	{"menu.feedback", "Menu: Feedback", "Show Feedback in navigation.", "Menus"},
	{"menu.playbook", "Menu: Playbook", "Show Playbook in navigation.", "Menus"},
	{"menu.calculator", "Menu: Calculator", "Show Calculator in navigation.", "Menus"},
	{"menu.import", "Menu: Import", "Show Import in navigation.", "Menus"},
	{"menu.settings", "Menu: Settings", "Show Settings in navigation.", "Menus"},
	{"accounts.view", "Accounts: View", "View trading accounts and balances.", "Accounts"},
	{"accounts.manage", "Accounts: Manage", "Create, edit, and delete trading accounts.", "Accounts"},
	{"trades.view", "Trades: View", "View trades, executions, and trade details.", "Trades"},
	{"trades.manage", "Trades: Manage", "Create, edit, delete, import, and sync trades.", "Trades"},
	{"setups.view", "Setups: View", "View setups and setup charts.", "Setups"},
	{"setups.manage", "Setups: Manage", "Create and edit setups, screenshots, and annotations.", "Setups"},
	{"playbook.view", "Playbook: View", "View playbooks and strategy records.", "Playbook"},
	{"playbook.manage", "Playbook: Manage", "Create and edit playbooks.", "Playbook"},
	{"reports.view", "Reports: View", "View reports and analytics.", "Reports"},
	{"calendar.view", "Calendar: View", "View trading calendar.", "Calendar"},
	{"events.view", "Events: View", "View economic events.", "Calendar"},
	{"news.view", "News: View", "View news feeds.", "News"},
	{"resources.view", "Resources: View", "View published resources.", "Resources"},
	{"resources.manage", "Resources: Manage", "Edit About and manage resources.", "Resources"},
	{"get_funded.view", "Get Funded: View", "View prop firm listings.", "Get Funded"},
	{"get_funded.manage", "Get Funded: Manage", "Create and edit prop firm listings.", "Get Funded"},
	{"notes.view", "Notes: View", "View journal notes.", "Journal"},
	{"notes.manage", "Notes: Manage", "Create and edit journal notes.", "Journal"},
	{"feedback.submit", "Feedback: Submit", "Submit feedback.", "Feedback"},
	{"feedback.manage", "Feedback: Manage", "Review feedback records.", "Feedback"},
	{"charts.view", "Charts: View", "View market charts.", "Charts"},
	{"ai.use", "AI: Use", "Use AI analysis features.", "AI"},
	{"settings.manage", "Settings: Manage", "Manage non-user settings.", "Settings"},
	{"users.manage", "Users: Manage", "Manage users.", "Administration"},
	{"roles.manage", "Roles: Manage", "Create roles and assign permissions.", "Administration"},
	{"payments.manage", "Payments: Manage", "Manage subscription and payment settings.", "Administration"},
	{"subscriptions.manage", "Subscriptions: Manage", "Create subscription packages and manage access.", "Administration"},
}

func (s *Server) roleRoutes(g *echo.Group) {
	admin := g.Group("/admin", s.requireAdmin)
	admin.GET("/permissions", s.handleListPermissions)
	admin.GET("/roles", s.handleListRoles)
	admin.POST("/roles", s.handleCreateRole)
	admin.PATCH("/roles/:id", s.handleUpdateRole)
	admin.DELETE("/roles/:id", s.handleDeleteRole)
	admin.GET("/users/:id/roles", s.handleGetUserRoles)
	admin.PUT("/users/:id/roles", s.handleSetUserRoles)
}

func cleanRoleText(v string, max int) string {
	v = strings.TrimSpace(v)
	if len(v) <= max {
		return v
	}
	return strings.TrimSpace(v[:max])
}

func validPermissionSet() map[string]bool {
	out := map[string]bool{}
	for _, p := range permissionCatalog {
		out[p.ID] = true
	}
	return out
}

func cleanPermissions(in []string) []string {
	valid := validPermissionSet()
	seen := map[string]bool{}
	out := []string{}
	for _, p := range in {
		p = strings.TrimSpace(p)
		if p == "" || !valid[p] || seen[p] {
			continue
		}
		seen[p] = true
		out = append(out, p)
	}
	return out
}

func (s *Server) handleListPermissions(c *echo.Context) error {
	return c.JSON(http.StatusOK, permissionCatalog)
}

func (s *Server) rolePermissions(ctx *echo.Context, roleID string) ([]string, error) {
	rows, err := s.deps.DB.QueryContext(ctx.Request().Context(), s.contentSQL(`
		SELECT permission FROM role_permissions WHERE role_id = ? ORDER BY permission
	`), roleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func scanRole(scanner interface{ Scan(dest ...any) error }) (roleDTO, error) {
	var r roleDTO
	var builtIn int64
	if err := scanner.Scan(&r.ID, &r.Name, &r.Description, &builtIn, &r.CreatedAt, &r.UpdatedAt); err != nil {
		return r, err
	}
	r.BuiltIn = builtIn != 0
	r.Permissions = []string{}
	return r, nil
}

func (s *Server) handleListRoles(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	rows, err := s.deps.DB.QueryContext(c.Request().Context(), `
		SELECT id, name, description, built_in, created_at, updated_at
		FROM roles ORDER BY built_in DESC, name ASC
	`)
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not list roles", nil)
	}
	defer rows.Close()
	out := []roleDTO{}
	for rows.Next() {
		r, err := scanRole(rows)
		if err != nil {
			return Fail(http.StatusInternalServerError, "internal", "could not read role", nil)
		}
		r.Permissions, _ = s.rolePermissions(c, r.ID)
		out = append(out, r)
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) writeRolePermissions(c *echo.Context, roleID string, permissions []string) error {
	if _, err := s.deps.DB.ExecContext(c.Request().Context(), s.contentSQL(`DELETE FROM role_permissions WHERE role_id = ?`), roleID); err != nil {
		return err
	}
	for _, p := range permissions {
		if _, err := s.deps.DB.ExecContext(c.Request().Context(), s.contentSQL(`
			INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)
		`), roleID, p); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) handleCreateRole(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	var in roleBody
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	name := cleanRoleText(in.Name, 100)
	if name == "" {
		return Fail(http.StatusBadRequest, "bad_request", "role name is required", nil)
	}
	id := uuid.New().String()
	row := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		INSERT INTO roles (id, name, description, built_in)
		VALUES (?, ?, ?, 0)
		RETURNING id, name, description, built_in, created_at, updated_at
	`), id, name, cleanRoleText(in.Description, 500))
	r, err := scanRole(row)
	if err != nil {
		return Fail(http.StatusConflict, "conflict", "could not create role", nil)
	}
	perms := cleanPermissions(in.Permissions)
	if err := s.writeRolePermissions(c, id, perms); err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not save permissions", nil)
	}
	r.Permissions = perms
	return c.JSON(http.StatusCreated, r)
}

func (s *Server) handleUpdateRole(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	var in roleBody
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	name := cleanRoleText(in.Name, 100)
	if name == "" {
		return Fail(http.StatusBadRequest, "bad_request", "role name is required", nil)
	}
	id := c.Param("id")
	row := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		UPDATE roles SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
		RETURNING id, name, description, built_in, created_at, updated_at
	`), name, cleanRoleText(in.Description, 500), id)
	r, err := scanRole(row)
	if err == sql.ErrNoRows {
		return Fail(http.StatusNotFound, "not_found", "role not found", nil)
	}
	if err != nil {
		return Fail(http.StatusConflict, "conflict", "could not update role", nil)
	}
	perms := cleanPermissions(in.Permissions)
	if err := s.writeRolePermissions(c, id, perms); err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not save permissions", nil)
	}
	r.Permissions = perms
	return c.JSON(http.StatusOK, r)
}

func (s *Server) handleDeleteRole(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	res, err := s.deps.DB.ExecContext(c.Request().Context(), s.contentSQL(`
		DELETE FROM roles WHERE id = ? AND built_in = 0
	`), c.Param("id"))
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not delete role", nil)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return Fail(http.StatusNotFound, "not_found", "custom role not found", nil)
	}
	return c.NoContent(http.StatusNoContent)
}

func (s *Server) handleGetUserRoles(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	rows, err := s.deps.DB.QueryContext(c.Request().Context(), s.contentSQL(`
		SELECT role_id FROM user_roles WHERE user_id = ? ORDER BY role_id
	`), c.Param("id"))
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not load user roles", nil)
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return Fail(http.StatusInternalServerError, "internal", "could not read user roles", nil)
		}
		out = append(out, id)
	}
	return c.JSON(http.StatusOK, map[string]any{"role_ids": out})
}

func (s *Server) handleSetUserRoles(c *echo.Context) error {
	if s.deps.DB == nil {
		return contentDBUnavailable()
	}
	var in userRolesBody
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	userID := c.Param("id")
	if _, err := s.deps.Store.GetUserByID(c.Request().Context(), userID); err != nil {
		return Fail(http.StatusNotFound, "not_found", "user not found", nil)
	}
	if _, err := s.deps.DB.ExecContext(c.Request().Context(), s.contentSQL(`DELETE FROM user_roles WHERE user_id = ?`), userID); err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not clear user roles", nil)
	}
	seen := map[string]bool{}
	for _, roleID := range in.RoleIDs {
		roleID = strings.TrimSpace(roleID)
		if roleID == "" || seen[roleID] {
			continue
		}
		seen[roleID] = true
		if _, err := s.deps.DB.ExecContext(c.Request().Context(), s.contentSQL(`
			INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)
		`), userID, roleID); err != nil {
			return Fail(http.StatusBadRequest, "bad_request", "unknown role id", nil)
		}
	}
	return s.handleGetUserRoles(c)
}

func (s *Server) userHasAssignedRoles(c *echo.Context, userID string) (bool, error) {
	var n int64
	err := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		SELECT COUNT(*) FROM user_roles WHERE user_id = ?
	`), userID).Scan(&n)
	return n > 0, err
}

func (s *Server) userHasPermission(c *echo.Context, userID, permission string) (bool, error) {
	var n int64
	err := s.deps.DB.QueryRowContext(c.Request().Context(), s.contentSQL(`
		SELECT COUNT(*)
		FROM user_roles ur
		JOIN role_permissions rp ON rp.role_id = ur.role_id
		WHERE ur.user_id = ? AND (rp.permission = ? OR rp.permission = '*')
	`), userID, permission).Scan(&n)
	return n > 0, err
}

func requiredPermission(c *echo.Context) string {
	path := c.Path()
	method := c.Request().Method
	write := method != http.MethodGet && method != http.MethodHead && method != http.MethodOptions
	switch {
	case strings.HasPrefix(path, "/api/v1/me"), strings.HasPrefix(path, "/api/v1/preferences"), strings.HasPrefix(path, "/api/v1/access-tokens"):
		return ""
	case strings.HasPrefix(path, "/api/v1/admin/roles"), strings.HasPrefix(path, "/api/v1/admin/permissions"):
		return "roles.manage"
	case strings.HasPrefix(path, "/api/v1/admin/users"):
		return "users.manage"
	case strings.HasPrefix(path, "/api/v1/admin/subscription"):
		return "subscriptions.manage"
	case strings.HasPrefix(path, "/api/v1/accounts"):
		if write {
			return "accounts.manage"
		}
		return "accounts.view"
	case strings.HasPrefix(path, "/api/v1/trades"),
		strings.HasPrefix(path, "/api/v1/executions"),
		strings.HasPrefix(path, "/api/v1/cash"),
		strings.HasPrefix(path, "/api/v1/imports"),
		strings.HasPrefix(path, "/api/v1/exports"),
		strings.HasPrefix(path, "/api/v1/flex-sync"):
		if write {
			return "trades.manage"
		}
		return "trades.view"
	case strings.HasPrefix(path, "/api/v1/setups"):
		if write {
			return "setups.manage"
		}
		return "setups.view"
	case strings.HasPrefix(path, "/api/v1/attachments"):
		if write {
			return "trades.manage"
		}
		return "trades.view"
	case strings.HasPrefix(path, "/api/v1/analytics"), strings.HasPrefix(path, "/api/v1/wrapped"):
		return "reports.view"
	case strings.HasPrefix(path, "/api/v1/notes"):
		if write {
			return "notes.manage"
		}
		return "notes.view"
	case strings.HasPrefix(path, "/api/v1/economic-events"):
		return "events.view"
	case strings.HasPrefix(path, "/api/v1/news"):
		return "news.view"
	case strings.HasPrefix(path, "/api/v1/resources"), strings.HasPrefix(path, "/api/v1/content/pages"):
		return "resources.view"
	case strings.HasPrefix(path, "/api/v1/admin/content"):
		return "resources.manage"
	case strings.HasPrefix(path, "/api/v1/get-funded"):
		return "get_funded.view"
	case strings.HasPrefix(path, "/api/v1/admin/get-funded"):
		return "get_funded.manage"
	case strings.HasPrefix(path, "/api/v1/feedback"):
		if write {
			return "feedback.submit"
		}
		return "feedback.manage"
	case strings.HasPrefix(path, "/api/v1/market"):
		return "charts.view"
	case strings.HasPrefix(path, "/api/v1/coach"), strings.HasPrefix(path, "/api/v1/ocr"):
		return "ai.use"
	case strings.HasPrefix(path, "/api/v1/share-links"),
		strings.HasPrefix(path, "/api/v1/settings"),
		strings.HasPrefix(path, "/api/v1/tags"),
		strings.HasPrefix(path, "/api/v1/checklist"),
		strings.HasPrefix(path, "/api/v1/alerts"),
		strings.HasPrefix(path, "/api/v1/prop"):
		return "settings.manage"
	default:
		return ""
	}
}

func (s *Server) requirePermission(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c *echo.Context) error {
		if s.deps.DB == nil || s.deps.Store == nil {
			return next(c)
		}
		perm := requiredPermission(c)
		if perm == "" {
			return next(c)
		}
		userID := auth.UserID(c)
		u, err := s.deps.Store.GetUserByID(c.Request().Context(), userID)
		if err != nil {
			return Fail(http.StatusUnauthorized, "unauthorized", "no such user", nil)
		}
		if u.IsAdmin == 1 {
			return next(c)
		}
		hasRoles, err := s.userHasAssignedRoles(c, userID)
		if err != nil {
			return Fail(http.StatusInternalServerError, "internal", "could not check roles", nil)
		}
		if !hasRoles {
			return next(c)
		}
		ok, err := s.userHasPermission(c, userID, perm)
		if err != nil {
			return Fail(http.StatusInternalServerError, "internal", "could not check permissions", nil)
		}
		if !ok {
			return Fail(http.StatusForbidden, "forbidden", "your role does not allow this action", map[string]any{"permission": perm})
		}
		return next(c)
	}
}

func (s *Server) permissionsForUser(c *echo.Context, userID string, isAdmin bool) ([]string, error) {
	if isAdmin {
		return []string{"*"}, nil
	}
	if s.deps.DB == nil {
		return []string{"*"}, nil
	}
	hasRoles, err := s.userHasAssignedRoles(c, userID)
	if err != nil {
		return nil, err
	}
	if !hasRoles {
		return []string{"*"}, nil
	}
	rows, err := s.deps.DB.QueryContext(c.Request().Context(), s.contentSQL(`
		SELECT DISTINCT rp.permission
		FROM user_roles ur
		JOIN role_permissions rp ON rp.role_id = ur.role_id
		WHERE ur.user_id = ?
		ORDER BY rp.permission
	`), userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
