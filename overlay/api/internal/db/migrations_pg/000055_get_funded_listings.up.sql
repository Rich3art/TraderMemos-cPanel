CREATE TABLE IF NOT EXISTS get_funded_listings (
  id TEXT PRIMARY KEY,
  firm_name TEXT NOT NULL,
  heading TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  affiliate_url TEXT NOT NULL DEFAULT '',
  cta_label TEXT NOT NULL DEFAULT 'Learn more',
  promo_code TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_get_funded_listings_published_order
  ON get_funded_listings (published, display_order, created_at DESC);
