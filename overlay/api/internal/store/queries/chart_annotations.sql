-- name: GetChartAnnotation :one
SELECT * FROM chart_annotations
WHERE user_id = ? AND entity_type = ? AND entity_id = ? AND symbol = ? AND interval = ?;

-- name: UpsertChartAnnotation :one
INSERT INTO chart_annotations (user_id, entity_type, entity_id, symbol, interval, drawings, updated_at)
VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(user_id, entity_type, entity_id, symbol, interval) DO UPDATE SET
    drawings = excluded.drawings,
    updated_at = CURRENT_TIMESTAMP
RETURNING *;

-- name: DeleteChartAnnotationsForEntity :exec
DELETE FROM chart_annotations WHERE user_id = ? AND entity_type = ? AND entity_id = ?;
