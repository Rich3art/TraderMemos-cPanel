-- name: GetPsychologyQuestions :one
SELECT * FROM psychology_question_settings WHERE user_id = ?;

-- name: UpsertPsychologyQuestions :one
INSERT INTO psychology_question_settings (user_id, questions, updated_at)
VALUES (?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(user_id) DO UPDATE SET
    questions = excluded.questions,
    updated_at = CURRENT_TIMESTAMP
RETURNING *;
