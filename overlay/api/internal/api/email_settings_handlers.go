package api

import (
	"crypto/tls"
	"database/sql"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/mail"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/tradermemos/api/internal/ocr"
	"github.com/tradermemos/api/internal/store"
)

type smtpSettingsDTO struct {
	Enabled      bool      `json:"enabled"`
	Host         string    `json:"host"`
	Port         int64     `json:"port"`
	Encryption   string    `json:"encryption"`
	Username     string    `json:"username"`
	PasswordSet  bool      `json:"password_set"`
	PasswordHint string    `json:"password_hint,omitempty"`
	FromEmail    string    `json:"from_email"`
	FromName     string    `json:"from_name"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type smtpSettingsPutDTO struct {
	Enabled       bool    `json:"enabled"`
	Host          string  `json:"host"`
	Port          int64   `json:"port"`
	Encryption    string  `json:"encryption"`
	Username      string  `json:"username"`
	Password      *string `json:"password"`
	ClearPassword bool    `json:"clear_password"`
	FromEmail     string  `json:"from_email"`
	FromName      string  `json:"from_name"`
}

type emailTemplateDTO struct {
	Key       string    `json:"key"`
	Name      string    `json:"name"`
	Subject   string    `json:"subject"`
	Body      string    `json:"body"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (s *Server) emailSettingsRoutes(g *echo.Group) {
	admin := g.Group("/settings/email", s.requireAdmin)
	admin.GET("", s.handleGetEmailSettings)
	admin.PUT("", s.handlePutEmailSettings)
	admin.GET("/templates", s.handleListEmailTemplates)
	admin.PUT("/templates/:key", s.handlePutEmailTemplate)
	admin.POST("/test", s.handleTestEmailSettings)
}

func (s *Server) handleGetEmailSettings(c *echo.Context) error {
	row, err := s.deps.Store.GetSmtpSettings(c.Request().Context())
	if errors.Is(err, sql.ErrNoRows) {
		return c.JSON(http.StatusOK, toSMTPSettingsDTO(defaultSMTPSettings()))
	}
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not load email settings", nil)
	}
	return c.JSON(http.StatusOK, toSMTPSettingsDTO(row))
}

func (s *Server) handlePutEmailSettings(c *echo.Context) error {
	var in smtpSettingsPutDTO
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	params, err := normalizeSMTPSettings(c, s.deps.Store, in)
	if err != nil {
		return Fail(http.StatusBadRequest, "bad_request", err.Error(), nil)
	}
	row, err := s.deps.Store.UpsertSmtpSettings(c.Request().Context(), params)
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not save email settings", nil)
	}
	return c.JSON(http.StatusOK, toSMTPSettingsDTO(row))
}

func (s *Server) handleListEmailTemplates(c *echo.Context) error {
	rows, err := s.deps.Store.ListEmailTemplates(c.Request().Context())
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not load email templates", nil)
	}
	out := make([]emailTemplateDTO, len(rows))
	for i := range rows {
		out[i] = toEmailTemplateDTO(rows[i])
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) handlePutEmailTemplate(c *echo.Context) error {
	key := strings.TrimSpace(c.Param("key"))
	var in struct {
		Name    string `json:"name"`
		Subject string `json:"subject"`
		Body    string `json:"body"`
	}
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	name := strings.TrimSpace(in.Name)
	subject := strings.TrimSpace(in.Subject)
	body := strings.TrimSpace(in.Body)
	if err := validateEmailTemplate(key, name, subject, body); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", err.Error(), nil)
	}
	row, err := s.deps.Store.UpsertEmailTemplate(c.Request().Context(), store.UpsertEmailTemplateParams{
		Key:     key,
		Name:    name,
		Subject: subject,
		Body:    body,
	})
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not save email template", nil)
	}
	return c.JSON(http.StatusOK, toEmailTemplateDTO(row))
}

func (s *Server) handleTestEmailSettings(c *echo.Context) error {
	var in struct {
		ToEmail string `json:"to_email"`
	}
	if err := c.Bind(&in); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "invalid body", nil)
	}
	toEmail := strings.TrimSpace(in.ToEmail)
	if _, err := mail.ParseAddress(toEmail); err != nil {
		return Fail(http.StatusBadRequest, "bad_request", "to_email must be a valid email address", nil)
	}
	row, err := s.deps.Store.GetSmtpSettings(c.Request().Context())
	if errors.Is(err, sql.ErrNoRows) {
		return Fail(http.StatusBadRequest, "bad_request", "SMTP settings are not configured", nil)
	}
	if err != nil {
		return Fail(http.StatusInternalServerError, "internal", "could not load email settings", nil)
	}
	if row.Enabled != 1 {
		return Fail(http.StatusBadRequest, "bad_request", "SMTP email is disabled", nil)
	}
	if err := sendSMTPMail(row, []string{toEmail}, "TraderMemo SMTP test", "This is a test email from TraderMemo."); err != nil {
		return Fail(http.StatusBadGateway, "smtp_failed", "SMTP test failed: "+err.Error(), nil)
	}
	return c.JSON(http.StatusOK, map[string]any{"ok": true})
}

func defaultSMTPSettings() store.SmtpSetting {
	return store.SmtpSetting{ID: 1, Port: 587, Encryption: "starttls"}
}

func normalizeSMTPSettings(c *echo.Context, q store.Querier, in smtpSettingsPutDTO) (store.UpsertSmtpSettingsParams, error) {
	host := strings.TrimSpace(in.Host)
	encryption := strings.TrimSpace(strings.ToLower(in.Encryption))
	if encryption == "" {
		encryption = "starttls"
	}
	if encryption != "none" && encryption != "starttls" && encryption != "tls" {
		return store.UpsertSmtpSettingsParams{}, errors.New("encryption must be none, starttls, or tls")
	}
	port := in.Port
	if port == 0 {
		port = 587
	}
	if port < 1 || port > 65535 {
		return store.UpsertSmtpSettingsParams{}, errors.New("port must be between 1 and 65535")
	}
	username := strings.TrimSpace(in.Username)
	fromEmail := strings.TrimSpace(in.FromEmail)
	fromName := strings.TrimSpace(in.FromName)
	if len(host) > 255 || len(username) > 255 || len(fromEmail) > 255 || len(fromName) > 120 {
		return store.UpsertSmtpSettingsParams{}, errors.New("one or more fields is too long")
	}
	if fromEmail != "" {
		if _, err := mail.ParseAddress(fromEmail); err != nil {
			return store.UpsertSmtpSettingsParams{}, errors.New("from_email must be a valid email address")
		}
	}
	if in.Enabled && (host == "" || fromEmail == "") {
		return store.UpsertSmtpSettingsParams{}, errors.New("enabled SMTP requires host and from_email")
	}

	password := ""
	if existing, err := q.GetSmtpSettings(c.Request().Context()); err == nil {
		password = existing.Password
	} else if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return store.UpsertSmtpSettingsParams{}, errors.New("could not load existing email settings")
	}
	if in.ClearPassword {
		password = ""
	}
	if in.Password != nil {
		password = strings.TrimSpace(*in.Password)
	}
	if len(password) > 4096 {
		return store.UpsertSmtpSettingsParams{}, errors.New("password is too long")
	}
	enabled := int64(0)
	if in.Enabled {
		enabled = 1
	}
	return store.UpsertSmtpSettingsParams{
		Enabled:    enabled,
		Host:       host,
		Port:       port,
		Encryption: encryption,
		Username:   username,
		Password:   password,
		FromEmail:  fromEmail,
		FromName:   fromName,
	}, nil
}

func validateEmailTemplate(key, name, subject, body string) error {
	if !allowedEmailTemplateKey(key) {
		return errors.New("template key is not supported")
	}
	if name == "" || subject == "" || body == "" {
		return errors.New("name, subject, and body are required")
	}
	if len(name) > 120 || len(subject) > 300 || len(body) > 20000 {
		return errors.New("template content is too long")
	}
	return nil
}

func allowedEmailTemplateKey(key string) bool {
	switch key {
	case "password_reset", "email_verification", "notification", "analytics_report", "subscription_payment":
		return true
	default:
		return false
	}
}

func toSMTPSettingsDTO(row store.SmtpSetting) smtpSettingsDTO {
	return smtpSettingsDTO{
		Enabled:      row.Enabled == 1,
		Host:         row.Host,
		Port:         row.Port,
		Encryption:   row.Encryption,
		Username:     row.Username,
		PasswordSet:  strings.TrimSpace(row.Password) != "",
		PasswordHint: ocr.MaskAPIKeyHint(row.Password),
		FromEmail:    row.FromEmail,
		FromName:     row.FromName,
		UpdatedAt:    row.UpdatedAt,
	}
}

func toEmailTemplateDTO(row store.EmailTemplate) emailTemplateDTO {
	return emailTemplateDTO{
		Key:       row.Key,
		Name:      row.Name,
		Subject:   row.Subject,
		Body:      row.Body,
		UpdatedAt: row.UpdatedAt,
	}
}

func sendSMTPMail(cfg store.SmtpSetting, to []string, subject, body string) error {
	host := strings.TrimSpace(cfg.Host)
	addr := net.JoinHostPort(host, strconv.FormatInt(cfg.Port, 10))
	from := strings.TrimSpace(cfg.FromEmail)
	if host == "" || from == "" {
		return errors.New("SMTP host and from email are required")
	}
	if _, err := mail.ParseAddress(from); err != nil {
		return errors.New("from email is invalid")
	}
	for _, recipient := range to {
		if _, err := mail.ParseAddress(recipient); err != nil {
			return errors.New("recipient email is invalid")
		}
	}
	fromHeader := from
	if strings.TrimSpace(cfg.FromName) != "" {
		fromHeader = (&mail.Address{Name: strings.TrimSpace(cfg.FromName), Address: from}).String()
	}
	msg := strings.Join([]string{
		"From: " + fromHeader,
		"To: " + strings.Join(to, ", "),
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n")
	var auth smtp.Auth
	if strings.TrimSpace(cfg.Username) != "" {
		auth = smtp.PlainAuth("", cfg.Username, cfg.Password, host)
	}
	switch strings.ToLower(strings.TrimSpace(cfg.Encryption)) {
	case "tls":
		conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 10 * time.Second}, "tcp", addr, &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12})
		if err != nil {
			return err
		}
		defer conn.Close()
		client, err := smtp.NewClient(conn, host)
		if err != nil {
			return err
		}
		defer client.Close()
		return smtpSendWithClient(client, auth, from, to, []byte(msg))
	case "starttls":
		client, err := smtp.Dial(addr)
		if err != nil {
			return err
		}
		defer client.Close()
		if err := client.StartTLS(&tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}); err != nil {
			return err
		}
		return smtpSendWithClient(client, auth, from, to, []byte(msg))
	default:
		return smtp.SendMail(addr, auth, from, to, []byte(msg))
	}
}

func smtpSendWithClient(client *smtp.Client, auth smtp.Auth, from string, to []string, msg []byte) error {
	if auth != nil {
		if err := client.Auth(auth); err != nil {
			return err
		}
	}
	if err := client.Mail(from); err != nil {
		return err
	}
	for _, recipient := range to {
		if err := client.Rcpt(recipient); err != nil {
			return err
		}
	}
	w, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := fmt.Fprint(w, string(msg)); err != nil {
		return err
	}
	return w.Close()
}
