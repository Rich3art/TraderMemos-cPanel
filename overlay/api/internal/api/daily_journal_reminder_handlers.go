package api

import (
	"database/sql"
	"errors"
	"net/http"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/tradermemos/api/internal/auth"
	"github.com/tradermemos/api/internal/store"
)

var reminderTimeRE = regexp.MustCompile(`^\d{2}:\d{2}$`)

type dailyJournalReminderSettingsDTO struct {
	Enabled      bool   `json:"enabled"`
	ReminderTime string `json:"reminder_time"`
	Timezone     string `json:"timezone"`
	PushEnabled  bool   `json:"push_enabled"`
	EmailEnabled bool   `json:"email_enabled"`
	Email        string `json:"email"`
	UpdatedAt    string `json:"updated_at,omitempty"`
}

func (s *Server) dailyJournalReminderRoutes(g *echo.Group) {
	g.GET("/settings/daily-journal-reminder", s.handleGetDailyJournalReminderSettings)
	g.PUT("/settings/daily-journal-reminder", s.handlePutDailyJournalReminderSettings)
}

func (s *Server) handleGetDailyJournalReminderSettings(c *echo.Context) error {
	row, err := s.deps.Store.GetDailyJournalReminderSettings(c.Request().Context(), auth.UserID(c))
	if errors.Is(err, sql.ErrNoRows) {
		return c.JSON(http.StatusOK, dailyJournalReminderSettingsDTO{
			ReminderTime: "18:00",
			Timezone:     "UTC",
			PushEnabled:  true,
		})
	}
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not load daily journal reminder settings", nil)
	}
	return c.JSON(http.StatusOK, toDailyJournalReminderSettingsDTO(row))
}

func (s *Server) handlePutDailyJournalReminderSettings(c *echo.Context) error {
	var in dailyJournalReminderSettingsDTO
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	params, err := normalizeDailyJournalReminderSettings(auth.UserID(c), in)
	if err != nil {
		return Fail(http.StatusBadRequest, "bad_request", err.Error(), nil)
	}
	row, err := s.deps.Store.UpsertDailyJournalReminderSettings(c.Request().Context(), params)
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not save daily journal reminder settings", nil)
	}
	return c.JSON(http.StatusOK, toDailyJournalReminderSettingsDTO(row))
}

func normalizeDailyJournalReminderSettings(userID string, in dailyJournalReminderSettingsDTO) (store.UpsertDailyJournalReminderSettingsParams, error) {
	reminderTime := strings.TrimSpace(in.ReminderTime)
	if reminderTime == "" {
		reminderTime = "18:00"
	}
	if !reminderTimeRE.MatchString(reminderTime) {
		return store.UpsertDailyJournalReminderSettingsParams{}, errors.New("reminder_time must use HH:MM format")
	}
	if _, err := time.Parse("15:04", reminderTime); err != nil {
		return store.UpsertDailyJournalReminderSettingsParams{}, errors.New("reminder_time is invalid")
	}
	tz := strings.TrimSpace(in.Timezone)
	if tz == "" {
		tz = "UTC"
	}
	if _, err := time.LoadLocation(tz); err != nil {
		return store.UpsertDailyJournalReminderSettingsParams{}, errors.New("timezone is invalid")
	}
	email := strings.TrimSpace(in.Email)
	if in.Enabled {
		if !in.PushEnabled && !in.EmailEnabled {
			return store.UpsertDailyJournalReminderSettingsParams{}, errors.New("select at least one reminder method")
		}
		if in.EmailEnabled {
			if email == "" {
				return store.UpsertDailyJournalReminderSettingsParams{}, errors.New("email is required when email reminders are enabled")
			}
			if _, err := mail.ParseAddress(email); err != nil {
				return store.UpsertDailyJournalReminderSettingsParams{}, errors.New("email must be valid")
			}
		}
	}
	if len(tz) > 80 || len(email) > 255 {
		return store.UpsertDailyJournalReminderSettingsParams{}, errors.New("one or more fields is too long")
	}
	return store.UpsertDailyJournalReminderSettingsParams{
		UserID:       userID,
		Enabled:      boolInt(in.Enabled),
		ReminderTime: reminderTime,
		Timezone:     tz,
		PushEnabled:  boolInt(in.PushEnabled),
		EmailEnabled: boolInt(in.EmailEnabled),
		Email:        email,
	}, nil
}

func toDailyJournalReminderSettingsDTO(row store.DailyJournalReminderSetting) dailyJournalReminderSettingsDTO {
	return dailyJournalReminderSettingsDTO{
		Enabled:      row.Enabled == 1,
		ReminderTime: row.ReminderTime,
		Timezone:     row.Timezone,
		PushEnabled:  row.PushEnabled == 1,
		EmailEnabled: row.EmailEnabled == 1,
		Email:        row.Email,
		UpdatedAt:    row.UpdatedAt.Format(time.RFC3339),
	}
}
