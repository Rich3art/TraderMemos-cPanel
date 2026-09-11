ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS buyer_label TEXT NOT NULL DEFAULT '';

ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_user_id_fkey;
ALTER TABLE payment_transactions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
