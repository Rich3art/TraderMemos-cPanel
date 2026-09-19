CREATE TABLE IF NOT EXISTS text_templates (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    body        TEXT NOT NULL,
    scope       TEXT NOT NULL DEFAULT 'general',
    favorite    INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_text_templates_user_updated ON text_templates(user_id, updated_at DESC);
