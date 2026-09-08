-- name: GetChartAnnotation :one
SELECT * FROM chart_annotations
WHERE user_id = $1 AND entity_type = $2 AND entity_id = $3 AND symbol = $4 AND interval = $5;

-- name: UpsertChartAnnotation :one
INSERT INTO chart_annotations (user_id, entity_type, entity_id, symbol, interval, drawings, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
ON CONFLICT(user_id, entity_type, entity_id, symbol, interval) DO UPDATE SET
    drawings = excluded.drawings,
    updated_at = CURRENT_TIMESTAMP
RETURNING *;

-- name: DeleteChartAnnotationsForEntity :exec
DELETE FROM chart_annotations WHERE user_id = $1 AND entity_type = $2 AND entity_id = $3;
