-- name: CreateFeedback :one
INSERT INTO feedback (id, user_id, body, page, status, created_at, updated_at)
VALUES (?, ?, ?, ?, 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
RETURNING id, user_id, body, page, status, created_at, updated_at;

-- name: ListFeedbackByUser :many
SELECT id, user_id, body, page, status, created_at, updated_at
FROM feedback
WHERE user_id = ?
ORDER BY created_at DESC;
