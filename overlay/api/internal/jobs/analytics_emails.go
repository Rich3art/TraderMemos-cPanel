package jobs

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/tradermemos/api/internal/analytics"
	"github.com/tradermemos/api/internal/mailer"
	"github.com/tradermemos/api/internal/money"
	"github.com/tradermemos/api/internal/store"
)

type analyticsEmailPeriod struct {
	frequency string
	key       string
	label     string
	from      time.Time
	to        time.Time
}

func NewAnalyticsEmails(q store.Querier, every time.Duration, log *slog.Logger) Job {
	run := func(ctx context.Context) error {
		smtpCfg, err := q.GetSmtpSettings(ctx)
		if errors.Is(err, sql.ErrNoRows) || smtpCfg.Enabled != 1 {
			return nil
		}
		if err != nil {
			return err
		}
		settings, err := q.ListEnabledAnalyticsEmailSettings(ctx)
		if err != nil {
			return err
		}
		templates, err := q.ListEmailTemplates(ctx)
		if err != nil {
			return err
		}
		tpl := analyticsEmailTemplate(templates)
		for _, setting := range settings {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if err := sendAnalyticsReportsForUser(ctx, q, smtpCfg, tpl, setting); err != nil {
				log.Warn("analytics email failed", "user", setting.UserID, "err", err)
			}
		}
		return nil
	}
	return Job{Name: "analytics_emails", Every: every, Timeout: 10 * time.Minute, Run: run}
}

func sendAnalyticsReportsForUser(ctx context.Context, q store.Querier, smtpCfg store.SmtpSetting, tpl store.EmailTemplate, setting store.AnalyticsEmailSetting) error {
	loc, err := time.LoadLocation(setting.Timezone)
	if err != nil {
		loc = time.UTC
	}
	now := time.Now().In(loc)
	periods := dueAnalyticsEmailPeriods(setting, now, loc)
	if len(periods) == 0 {
		return nil
	}
	user, err := q.GetUserByID(ctx, setting.UserID)
	if err != nil {
		return err
	}
	metrics := []string{}
	_ = json.Unmarshal([]byte(setting.MetricsJson), &metrics)
	if len(metrics) == 0 {
		metrics = []string{"net_pnl", "total_trades", "win_rate", "profit_factor", "avg_trade", "max_drawdown"}
	}
	for _, period := range periods {
		summary, maxDD, err := analyticsEmailSummary(ctx, q, setting.UserID, period.from, period.to)
		if err != nil {
			return err
		}
		vars := map[string]string{
			"user_name":         userNameFromEmail(user.Email),
			"email":             user.Email,
			"site_name":         "TraderMemo",
			"period":            period.label,
			"analytics_summary": renderAnalyticsSummary(summary, maxDD, metrics),
		}
		subject := mailer.RenderTemplate(tpl.Subject, vars)
		body := mailer.RenderTemplate(tpl.Body, vars)
		if err := mailer.SendSMTPMail(smtpCfg, []string{setting.Email}, subject, body); err != nil {
			return err
		}
		if err := q.UpdateAnalyticsEmailLastSent(ctx, store.UpdateAnalyticsEmailLastSentParams{
			UserID: setting.UserID, Frequency: period.frequency, PeriodKey: period.key,
		}); err != nil {
			return err
		}
	}
	return nil
}

func dueAnalyticsEmailPeriods(setting store.AnalyticsEmailSetting, now time.Time, loc *time.Location) []analyticsEmailPeriod {
	var out []analyticsEmailPeriod
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	if setting.Daily == 1 {
		day := today.AddDate(0, 0, -1)
		key := day.Format("2006-01-02")
		if key != setting.LastDailySentFor {
			out = append(out, analyticsEmailPeriod{frequency: "daily", key: key, label: "daily report for " + key, from: day, to: today})
		}
	}
	weekday := int(today.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	thisMonday := today.AddDate(0, 0, -(weekday - 1))
	if setting.Weekly == 1 {
		start := thisMonday.AddDate(0, 0, -7)
		key := start.Format("2006-01-02")
		if key != setting.LastWeeklySentFor {
			out = append(out, analyticsEmailPeriod{frequency: "weekly", key: key, label: "weekly report for week of " + key, from: start, to: thisMonday})
		}
	}
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc)
	if setting.Monthly == 1 {
		start := monthStart.AddDate(0, -1, 0)
		key := start.Format("2006-01")
		if key != setting.LastMonthlySentFor {
			out = append(out, analyticsEmailPeriod{frequency: "monthly", key: key, label: "monthly report for " + key, from: start, to: monthStart})
		}
	}
	return out
}

func analyticsEmailSummary(ctx context.Context, q store.Querier, userID string, from, to time.Time) (analytics.Summary, float64, error) {
	rows, err := q.ListClosedTrades(ctx, store.ListClosedTradesParams{UserID: userID, From: from, To: to})
	if err != nil {
		return analytics.Summary{}, 0, err
	}
	closed := make([]analytics.ClosedTrade, 0, len(rows))
	for _, t := range rows {
		if !t.NetPnl.Valid || !t.ClosedAt.Valid {
			continue
		}
		gross := t.NetPnl.Float64 + t.FeesTotal
		if t.GrossPnl.Valid {
			gross = t.GrossPnl.Float64
		}
		closed = append(closed, analytics.ClosedTrade{
			NetPnl: t.NetPnl.Float64, GrossPnl: gross, FeesTotal: t.FeesTotal, OpenedAt: t.OpenedAt, ClosedAt: t.ClosedAt.Time,
		})
	}
	summary := analytics.Summarize(closed)
	return summary, maxDrawdownFromTrades(closed), nil
}

func maxDrawdownFromTrades(ts []analytics.ClosedTrade) float64 {
	eq := 0.0
	peak := 0.0
	dd := 0.0
	for _, t := range ts {
		eq += t.NetPnl
		if eq > peak {
			peak = eq
		}
		if peak-eq > dd {
			dd = peak - eq
		}
	}
	return money.Round2(dd)
}

func analyticsEmailTemplate(rows []store.EmailTemplate) store.EmailTemplate {
	for _, row := range rows {
		if row.Key == "analytics_report" {
			return row
		}
	}
	return store.EmailTemplate{
		Key:     "analytics_report",
		Subject: "{{site_name}} analytics report",
		Body:    "Hi {{user_name}},\n\nHere is your {{period}} trading analytics summary:\n\n{{analytics_summary}}",
	}
}

func renderAnalyticsSummary(s analytics.Summary, maxDD float64, metrics []string) string {
	labels := map[string]string{
		"net_pnl":       "Net P&L",
		"total_trades":  "Trades",
		"win_rate":      "Win rate",
		"profit_factor": "Profit factor",
		"avg_trade":     "Average trade",
		"avg_win":       "Average win",
		"avg_loss":      "Average loss",
		"largest_win":   "Largest win",
		"largest_loss":  "Largest loss",
		"expectancy":    "Expectancy",
		"total_fees":    "Total fees",
		"max_drawdown":  "Maximum drawdown",
	}
	values := map[string]string{
		"net_pnl":       moneyValue(s.NetPnl),
		"total_trades":  fmt.Sprintf("%d", s.TotalTrades),
		"win_rate":      fmt.Sprintf("%.2f%%", s.WinRate*100),
		"profit_factor": moneyValue(s.ProfitFactor),
		"avg_trade":     moneyValue(s.AvgTrade),
		"avg_win":       moneyValue(s.AvgWin),
		"avg_loss":      moneyValue(s.AvgLoss),
		"largest_win":   moneyValue(s.LargestWin),
		"largest_loss":  moneyValue(s.LargestLoss),
		"expectancy":    moneyValue(s.Expectancy),
		"total_fees":    moneyValue(s.TotalFees),
		"max_drawdown":  moneyValue(maxDD),
	}
	lines := []string{}
	for _, key := range metrics {
		label, ok := labels[key]
		if !ok {
			continue
		}
		lines = append(lines, label+": "+values[key])
	}
	if len(lines) == 0 {
		return "No analytics metrics selected."
	}
	return strings.Join(lines, "\n")
}

func moneyValue(v float64) string {
	return fmt.Sprintf("%.2f", money.Round2(v))
}

func userNameFromEmail(email string) string {
	if i := strings.IndexByte(email, '@'); i > 0 {
		return email[:i]
	}
	return email
}
