CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  built_in INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (role_id, permission)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions(permission);

INSERT INTO roles (id, name, description, built_in)
VALUES
  ('role-member-default', 'Member', 'Default full journal access for regular users.', 1),
  ('role-readonly-default', 'Read Only', 'Read-only access to journal pages and analytics.', 1)
ON CONFLICT(id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission)
VALUES
  ('role-member-default', '*'),
  ('role-readonly-default', 'menu.home'),
  ('role-readonly-default', 'menu.trades'),
  ('role-readonly-default', 'menu.calendar'),
  ('role-readonly-default', 'menu.reports'),
  ('role-readonly-default', 'menu.events'),
  ('role-readonly-default', 'menu.news'),
  ('role-readonly-default', 'menu.resources'),
  ('role-readonly-default', 'accounts.view'),
  ('role-readonly-default', 'trades.view'),
  ('role-readonly-default', 'setups.view'),
  ('role-readonly-default', 'reports.view'),
  ('role-readonly-default', 'calendar.view'),
  ('role-readonly-default', 'events.view'),
  ('role-readonly-default', 'news.view'),
  ('role-readonly-default', 'resources.view'),
  ('role-readonly-default', 'playbook.view'),
  ('role-readonly-default', 'charts.view')
ON CONFLICT(role_id, permission) DO NOTHING;
