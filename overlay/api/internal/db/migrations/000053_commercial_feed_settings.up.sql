CREATE TABLE IF NOT EXISTS commercial_feed_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  news_provider TEXT NOT NULL DEFAULT 'public',
  paid_provider TEXT NOT NULL DEFAULT '',
  api_base_url TEXT NOT NULL DEFAULT '',
  api_key TEXT NOT NULL DEFAULT '',
  license_note TEXT NOT NULL DEFAULT '',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

