package mailer

import (
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"net/mail"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	"github.com/tradermemos/api/internal/store"
)

func RenderTemplate(text string, vars map[string]string) string {
	out := text
	for key, value := range vars {
		out = strings.ReplaceAll(out, "{{"+key+"}}", value)
	}
	return out
}

func SendSMTPMail(cfg store.SmtpSetting, to []string, subject, body string) error {
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
