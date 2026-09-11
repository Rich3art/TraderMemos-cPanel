DELETE FROM payment_transactions WHERE user_id IS NULL;

ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_user_id_fkey;
ALTER TABLE payment_transactions ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE payment_transactions DROP COLUMN IF EXISTS buyer_label;
