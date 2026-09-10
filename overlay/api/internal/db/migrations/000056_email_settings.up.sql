CREATE TABLE IF NOT EXISTS smtp_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0,
  host TEXT NOT NULL DEFAULT '',
  port INTEGER NOT NULL DEFAULT 587,
  encryption TEXT NOT NULL DEFAULT 'starttls',
  username TEXT NOT NULL DEFAULT '',
  password TEXT NOT NULL DEFAULT '',
  from_email TEXT NOT NULL DEFAULT '',
  from_name TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_templates (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO email_templates (key, name, subject, body) VALUES
('password_reset', 'Password reset', 'Reset your TraderMemo password', 'Hi {{user_name}},\n\nUse this link to reset your password:\n{{reset_link}}\n\nIf you did not request this, you can ignore this email.'),
('email_verification', 'Email verification', 'Verify your TraderMemo email', 'Hi {{user_name}},\n\nVerify your email address here:\n{{verification_link}}'),
('notification', 'Notification', '{{site_name}} notification', 'Hi {{user_name}},\n\n{{message}}'),
('analytics_report', 'Analytics report', '{{site_name}} analytics report', 'Hi {{user_name}},\n\nHere is your {{period}} trading analytics summary:\n\n{{analytics_summary}}'),
('subscription_payment', 'Subscription/payment', '{{site_name}} subscription update', 'Hi {{user_name}},\n\n{{subscription_message}}');
