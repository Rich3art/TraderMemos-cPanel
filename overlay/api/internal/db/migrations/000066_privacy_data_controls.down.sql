DROP INDEX IF EXISTS idx_payment_transactions_user;
DROP INDEX IF EXISTS idx_payment_transactions_package;
DROP INDEX IF EXISTS idx_payment_transactions_status;

DELETE FROM payment_transactions WHERE user_id IS NULL;

CREATE TABLE payment_transactions_privacy_rebuild (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id TEXT NOT NULL REFERENCES subscription_packages(id),
  provider TEXT NOT NULL,
  provider_order_id TEXT NOT NULL,
  provider_capture_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT '',
  subscription_id TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_order_id)
);

INSERT INTO payment_transactions_privacy_rebuild (
  id, user_id, package_id, provider, provider_order_id, provider_capture_id, status,
  amount, currency, subscription_id, raw_json, created_at, updated_at
)
SELECT
  id, user_id, package_id, provider, provider_order_id, provider_capture_id, status,
  amount, currency, subscription_id, raw_json, created_at, updated_at
FROM payment_transactions;

DROP TABLE payment_transactions;
ALTER TABLE payment_transactions_privacy_rebuild RENAME TO payment_transactions;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_user ON payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_package ON payment_transactions(package_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
