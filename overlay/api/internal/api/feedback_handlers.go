package api

import (
	"net/http"
	"strings"
	"time"
	"uuid"

	"github.com/labstack/echo/v5"
	"github.com/tradermemos/api/internal/auth"
	"github.com/tradermemos/api/internal/store"
)

const (
	feedbackMaxBody = 5000
	feedbackMaxPage = 240
)

func (s *Server) feedbackRoutes(g *echo.Group) {
	g.GET("/feedback", s.handleListFeedback)
	g.POST("/feedback", s.handleCreateFeedback)
}

type feedbackDTO struct {
	ID        string    `json:"id"`
	Body      string    `json:"body"`
	Page      string    `json:"page"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type feedbackBody struct {
	Body string `json:"body"`
	Page string `json:"page"`
}

func toFeedbackDTO(f store.Feedback) feedbackDTO {
	return feedbackDTO{
		ID: f.ID, Body: f.Body, Page: f.Page, Status: f.Status,
		CreatedAt: f.CreatedAt, UpdatedAt: f.UpdatedAt,
	}
}

func cleanFeedbackField(v string, maxLen int) string {
	v = strings.TrimSpace(v)
	if len(v) <= maxLen {
		return v
	}
	return strings.TrimSpace(v[:maxLen])
}

func (s *Server) handleListFeedback(c *echo.Context) error {
	rows, err := s.deps.Store.ListFeedbackByUser(c.Request().Context(), auth.UserID(c))
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not list feedback", nil)
	}
	out := make([]feedbackDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, toFeedbackDTO(row))
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) handleCreateFeedback(c *echo.Context) error {
	var in feedbackBody
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	body := cleanFeedbackField(in.Body, feedbackMaxBody)
	if body == "" {
		return Fail(http.StatusBadRequest, "bad_request", "feedback is required", nil)
	}
	row, err := s.deps.Store.CreateFeedback(c.Request().Context(), store.CreateFeedbackParams{
		ID: uuid.New().String(), UserID: auth.UserID(c),
		Body: body, Page: cleanFeedbackField(in.Page, feedbackMaxPage),
	})
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not create feedback", nil)
	}
	return c.JSON(http.StatusCreated, toFeedbackDTO(row))
}
