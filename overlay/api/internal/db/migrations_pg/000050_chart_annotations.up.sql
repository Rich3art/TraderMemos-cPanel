CREATE TABLE IF NOT EXISTS chart_annotations (
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id   TEXT NOT NULL,
    symbol      TEXT NOT NULL DEFAULT '',
    interval    TEXT NOT NULL DEFAULT '',
    drawings    TEXT NOT NULL DEFAULT '[]',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, entity_type, entity_id, symbol, interval)
);

CREATE INDEX IF NOT EXISTS idx_chart_annotations_entity
ON chart_annotations(user_id, entity_type, entity_id);
