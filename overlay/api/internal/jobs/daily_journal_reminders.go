package jobs

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"
	"uuid"

	"github.com/tradermemos/api/internal/mailer"
	"github.com/tradermemos/api/internal/store"
)

func NewDailyJournalReminders(q store.Querier, every time.Duration, log *slog.Logger) Job {
	run := func(ctx context.Context) error {
		settings, err := q.ListEnabledDailyJournalReminders(ctx)
		if err != nil {
			return err
		}
		if len(settings) == 0 {
			return nil
		}
		smtpCfg, smtpErr := q.GetSmtpSettings(ctx)
		if errors.Is(smtpErr, sql.ErrNoRows) {
			smtpErr = nil
			smtpCfg = store.SmtpSetting{}
		}
		templates, tplErr := q.ListEmailTemplates(ctx)
		if tplErr != nil {
			templates = nil
		}
		tpl := dailyJournalReminderTemplate(templates)
		for _, setting := range settings {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if err := processDailyJournalReminder(ctx, q, smtpCfg, smtpErr, tpl, setting); err != nil {
				log.Warn("daily journal reminder failed", "user", setting.UserID, "err", err)
			}
		}
		return nil
	}
	return Job{Name: "daily_journal_reminders", Every: every, Timeout: 5 * time.Minute, Run: run}
}

func processDailyJournalReminder(ctx context.Context, q store.Querier, smtpCfg store.SmtpSetting, smtpErr error, tpl store.EmailTemplate, setting store.DailyJournalReminderSetting) error {
	loc, err := time.LoadLocation(setting.Timezone)
	if err != nil {
		loc = time.UTC
	}
	now := time.Now().In(loc)
	due, dayKey := dailyJournalReminderDue(setting, now, loc)
	if !due {
		return nil
	}
	exists, err := q.JournalDailyLogExists(ctx, store.JournalDailyLogExistsParams{UserID: setting.UserID, DayKey: dayKey})
	if err != nil {
		return err
	}
	if exists > 0 {
		return q.UpdateDailyJournalReminderLastSent(ctx, store.UpdateDailyJournalReminderLastSentParams{UserID: setting.UserID, DayKey: dayKey})
	}
	user, err := q.GetUserByID(ctx, setting.UserID)
	if err != nil {
		return err
	}
	title := "Daily journal reminder"
	body := fmt.Sprintf("Complete your daily trading log for %s.", dayKey)
	if setting.PushEnabled == 1 {
		if _, err := q.InsertAlertEvent(ctx, store.InsertAlertEventParams{
			ID:        uuid.New().String(),
			UserID:    setting.UserID,
			Rule:      "daily_journal_reminder",
			DedupeKey: dayKey,
			Title:     title,
			Body:      body,
		}); err != nil {
			return err
		}
	}
	if setting.EmailEnabled == 1 && strings.TrimSpace(setting.Email) != "" {
		if smtpErr != nil {
			return smtpErr
		}
		if smtpCfg.Enabled != 1 {
			return errors.New("SMTP email is disabled")
		}
		vars := map[string]string{
			"user_name":     userNameFromEmail(user.Email),
			"email":         user.Email,
			"site_name":     "TraderMemo",
			"reminder_date": dayKey,
			"message":       body,
		}
		subject := mailer.RenderTemplate(tpl.Subject, vars)
		renderedBody := mailer.RenderTemplate(tpl.Body, vars)
		if err := mailer.SendSMTPMail(smtpCfg, []string{setting.Email}, subject, renderedBody); err != nil {
			return err
		}
	}
	return q.UpdateDailyJournalReminderLastSent(ctx, store.UpdateDailyJournalReminderLastSentParams{UserID: setting.UserID, DayKey: dayKey})
}

func dailyJournalReminderDue(setting store.DailyJournalReminderSetting, now time.Time, loc *time.Location) (bool, string) {
	dayKey := now.Format("2006-01-02")
	if setting.LastSentFor == dayKey {
		return false, dayKey
	}
	parts := strings.Split(setting.ReminderTime, ":")
	if len(parts) != 2 {
		return false, dayKey
	}
	reminderClock, err := time.Parse("15:04", setting.ReminderTime)
	if err != nil {
		return false, dayKey
	}
	dueAt := time.Date(now.Year(), now.Month(), now.Day(), reminderClock.Hour(), reminderClock.Minute(), 0, 0, loc)
	return !now.Before(dueAt), dayKey
}

func dailyJournalReminderTemplate(rows []store.EmailTemplate) store.EmailTemplate {
	for _, row := range rows {
		if row.Key == "daily_journal_reminder" {
			return row
		}
	}
	return store.EmailTemplate{
		Key:     "daily_journal_reminder",
		Subject: "{{site_name}} daily journal reminder",
		Body:    "Hi {{user_name}},\n\n{{message}}\n\nReminder date: {{reminder_date}}",
	}
}
