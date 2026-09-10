import { CalendarClock, Mail, Send, ShieldCheck, TextCursorInput } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FormInput, FormTextarea, PasswordInput } from "@/components/FormInput";
import { FormSkeleton } from "@/components/skeletons/form-skeleton";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { EmailTemplate, SmtpEncryption } from "@/lib/api/settings";
import {
  useAnalyticsEmailSettings,
  useEmailTemplates,
  useSaveEmailTemplate,
  useSaveAnalyticsEmailSettings,
  useSaveSmtpSettings,
  useSmtpSettings,
  useTestSmtpSettings,
} from "@/lib/hooks/useEmailSettings";
import {
  SettingsCard,
  SettingsCardNote,
  SettingsCardRow,
  SettingsSection,
  SettingsToggle,
} from "./settings-ui";

const ENCRYPTION_OPTIONS: { value: SmtpEncryption; label: string }[] = [
  { value: "starttls", label: "STARTTLS" },
  { value: "tls", label: "TLS / SSL" },
  { value: "none", label: "None" },
];

const ANALYTICS_METRICS = [
  { key: "net_pnl", label: "Net P&L" },
  { key: "total_trades", label: "Trades" },
  { key: "win_rate", label: "Win rate" },
  { key: "profit_factor", label: "Profit factor" },
  { key: "avg_trade", label: "Average trade" },
  { key: "avg_win", label: "Average win" },
  { key: "avg_loss", label: "Average loss" },
  { key: "largest_win", label: "Largest win" },
  { key: "largest_loss", label: "Largest loss" },
  { key: "expectancy", label: "Expectancy" },
  { key: "total_fees", label: "Total fees" },
  { key: "max_drawdown", label: "Maximum drawdown" },
] as const;

export function EmailTab() {
  const smtp = useSmtpSettings();
  const templates = useEmailTemplates();
  const analyticsEmail = useAnalyticsEmailSettings();
  const saveSmtp = useSaveSmtpSettings();
  const testSmtp = useTestSmtpSettings();
  const saveTemplate = useSaveEmailTemplate();
  const saveAnalyticsEmail = useSaveAnalyticsEmailSettings();

  const [enabled, setEnabled] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [encryption, setEncryption] = useState<SmtpEncryption>("starttls");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [smtpError, setSmtpError] = useState("");
  const [smtpMessage, setSmtpMessage] = useState("");
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [analyticsEmailTo, setAnalyticsEmailTo] = useState("");
  const [analyticsTimezone, setAnalyticsTimezone] = useState("UTC");
  const [analyticsDaily, setAnalyticsDaily] = useState(false);
  const [analyticsWeekly, setAnalyticsWeekly] = useState(false);
  const [analyticsMonthly, setAnalyticsMonthly] = useState(false);
  const [analyticsMetrics, setAnalyticsMetrics] = useState<string[]>([]);
  const [analyticsError, setAnalyticsError] = useState("");
  const [analyticsMessage, setAnalyticsMessage] = useState("");

  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [templateError, setTemplateError] = useState("");

  useEffect(() => {
    if (!smtp.data) return;
    setEnabled(Boolean(smtp.data.enabled));
    setHost(smtp.data.host || "");
    setPort(String(smtp.data.port || 587));
    setEncryption(smtp.data.encryption || "starttls");
    setUsername(smtp.data.username || "");
    setFromEmail(smtp.data.from_email || "");
    setFromName(smtp.data.from_name || "");
    setPassword("");
    setClearPassword(false);
  }, [smtp.data]);

  useEffect(() => {
    if (!analyticsEmail.data) return;
    setAnalyticsEnabled(Boolean(analyticsEmail.data.enabled));
    setAnalyticsEmailTo(analyticsEmail.data.email || "");
    setAnalyticsTimezone(analyticsEmail.data.timezone || "UTC");
    setAnalyticsDaily(Boolean(analyticsEmail.data.daily));
    setAnalyticsWeekly(Boolean(analyticsEmail.data.weekly));
    setAnalyticsMonthly(Boolean(analyticsEmail.data.monthly));
    setAnalyticsMetrics(analyticsEmail.data.metrics?.length ? analyticsEmail.data.metrics : ["net_pnl", "total_trades", "win_rate", "profit_factor", "avg_trade", "max_drawdown"]);
  }, [analyticsEmail.data]);

  useEffect(() => {
    if (!templates.data?.length) return;
    const current =
      templates.data.find((template) => template.key === selectedTemplateKey) ?? templates.data[0];
    setSelectedTemplateKey(current.key);
    setTemplateName(current.name);
    setTemplateSubject(current.subject);
    setTemplateBody(current.body);
  }, [templates.data, selectedTemplateKey]);

  const selectedTemplate = useMemo<EmailTemplate | undefined>(
    () => templates.data?.find((template) => template.key === selectedTemplateKey),
    [templates.data, selectedTemplateKey],
  );

  async function handleSaveSmtp() {
    setSmtpError("");
    setSmtpMessage("");
    try {
      await saveSmtp.mutateAsync({
        enabled,
        host,
        port: Number(port),
        encryption,
        username,
        from_email: fromEmail,
        from_name: fromName,
        clear_password: clearPassword,
        ...(password.trim() ? { password: password.trim() } : {}),
      });
      setPassword("");
      setClearPassword(false);
      setSmtpMessage("Email settings saved.");
    } catch (err) {
      setSmtpError(err instanceof Error ? err.message : "Could not save email settings.");
    }
  }

  async function handleTestSmtp() {
    setSmtpError("");
    setSmtpMessage("");
    try {
      await testSmtp.mutateAsync({ to_email: toEmail });
      setSmtpMessage("Test email sent.");
    } catch (err) {
      setSmtpError(err instanceof Error ? err.message : "Could not send test email.");
    }
  }

  async function handleSaveTemplate() {
    setTemplateError("");
    if (!selectedTemplate) return;
    try {
      await saveTemplate.mutateAsync({
        key: selectedTemplate.key,
        name: templateName,
        subject: templateSubject,
        body: templateBody,
      });
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "Could not save email template.");
    }
  }

  async function handleSaveAnalyticsEmail() {
    setAnalyticsError("");
    setAnalyticsMessage("");
    try {
      await saveAnalyticsEmail.mutateAsync({
        enabled: analyticsEnabled,
        email: analyticsEmailTo,
        timezone: analyticsTimezone,
        daily: analyticsDaily,
        weekly: analyticsWeekly,
        monthly: analyticsMonthly,
        metrics: analyticsMetrics,
      });
      setAnalyticsMessage("Analytics email schedule saved.");
    } catch (err) {
      setAnalyticsError(err instanceof Error ? err.message : "Could not save analytics email schedule.");
    }
  }

  function toggleAnalyticsMetric(key: string) {
    setAnalyticsMetrics((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  }

  return (
    <SettingsSection
      title="Email"
      footer="Configure SMTP delivery and editable templates for transactional emails."
    >
      {smtp.isPending && !smtp.data ? (
        <SettingsCard title="SMTP server">
          <FormSkeleton fields={5} />
        </SettingsCard>
      ) : smtp.isError || !smtp.data ? (
        <SettingsCard title="SMTP server">
          <SettingsCardNote tone="destructive">Failed to load email settings.</SettingsCardNote>
        </SettingsCard>
      ) : (
        <SettingsCard
          title="SMTP server"
          description="Credentials are stored on the API server. The browser only sees whether a password is saved and a masked hint."
        >
          <SettingsCardRow
            icon={Mail}
            active={enabled}
            label="SMTP email"
            detail="Enable after host, sender and credentials are correct."
          >
            <SettingsToggle checked={enabled} onCheckedChange={setEnabled} />
          </SettingsCardRow>
          <div className="grid gap-3 px-5 py-3 md:grid-cols-[1fr_120px_180px]">
            <label className="block text-[12px] font-medium text-foreground">
              Host
              <FormInput
                className="mt-1"
                value={host}
                onChange={(event) => setHost(event.target.value)}
                placeholder="smtp.example.com"
              />
            </label>
            <label className="block text-[12px] font-medium text-foreground">
              Port
              <FormInput
                className="mt-1"
                value={port}
                onChange={(event) => setPort(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className="block text-[12px] font-medium text-foreground">
              Encryption
              <NativeSelect
                value={encryption}
                onChange={(event) => setEncryption(event.target.value as SmtpEncryption)}
                wrapperClassName="mt-1 w-full"
                className="w-full"
              >
                {ENCRYPTION_OPTIONS.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
          </div>
          <div className="grid gap-3 px-5 py-3 md:grid-cols-2">
            <label className="block text-[12px] font-medium text-foreground">
              Username
              <FormInput
                className="mt-1"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="block text-[12px] font-medium text-foreground">
              Password
              <PasswordInput
                className="mt-1"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={
                  smtp.data.password_set
                    ? `${smtp.data.password_hint || "Password saved"} - leave blank to keep`
                    : "SMTP password"
                }
                autoComplete="new-password"
              />
            </label>
          </div>
          <div className="grid gap-3 px-5 py-3 md:grid-cols-2">
            <label className="block text-[12px] font-medium text-foreground">
              From email
              <FormInput
                className="mt-1"
                value={fromEmail}
                onChange={(event) => setFromEmail(event.target.value)}
                placeholder="journal@example.com"
              />
            </label>
            <label className="block text-[12px] font-medium text-foreground">
              From name
              <FormInput
                className="mt-1"
                value={fromName}
                onChange={(event) => setFromName(event.target.value)}
                placeholder="TraderMemo"
              />
            </label>
          </div>
          <SettingsCardRow
            icon={ShieldCheck}
            label="Secret handling"
            detail="Leave the password blank to keep the saved value. Use clear only when you want to remove it."
          >
            <Button
              type="button"
              variant={clearPassword ? "destructive" : "outline"}
              size="sm"
              disabled={!smtp.data.password_set}
              onClick={() => setClearPassword((next) => !next)}
            >
              {clearPassword ? "Will clear password" : "Clear saved password"}
            </Button>
            <Button type="button" onClick={handleSaveSmtp} disabled={saveSmtp.isPending}>
              {saveSmtp.isPending ? "Saving..." : "Save SMTP"}
            </Button>
          </SettingsCardRow>
          <SettingsCardRow
            icon={Send}
            label="Send test"
            detail="Uses the saved SMTP settings and sends a plain text test email."
          >
            <FormInput
              value={toEmail}
              onChange={(event) => setToEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-[220px]"
            />
            <Button type="button" variant="outline" onClick={handleTestSmtp} disabled={testSmtp.isPending}>
              {testSmtp.isPending ? "Sending..." : "Send test"}
            </Button>
          </SettingsCardRow>
          {smtpError ? <SettingsCardNote tone="destructive">{smtpError}</SettingsCardNote> : null}
          {smtpMessage ? <SettingsCardNote>{smtpMessage}</SettingsCardNote> : null}
        </SettingsCard>
      )}

      <SettingsCard
        title="Scheduled analytics reports"
        description="Send automated daily, weekly, and monthly analytics summaries using the Analytics report email template."
      >
        {analyticsEmail.isPending && !analyticsEmail.data ? (
          <FormSkeleton fields={4} />
        ) : analyticsEmail.isError || !analyticsEmail.data ? (
          <SettingsCardNote tone="destructive">
            Failed to load analytics email settings.
          </SettingsCardNote>
        ) : (
          <>
            <SettingsCardRow
              icon={CalendarClock}
              active={analyticsEnabled}
              label="Analytics emails"
              detail="Reports are sent by the API server background job after a period is complete."
            >
              <SettingsToggle checked={analyticsEnabled} onCheckedChange={setAnalyticsEnabled} />
            </SettingsCardRow>
            <div className="grid gap-3 px-5 py-3 md:grid-cols-2">
              <label className="block text-[12px] font-medium text-foreground">
                Send to
                <FormInput
                  className="mt-1"
                  value={analyticsEmailTo}
                  onChange={(event) => setAnalyticsEmailTo(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label className="block text-[12px] font-medium text-foreground">
                Timezone
                <FormInput
                  className="mt-1"
                  value={analyticsTimezone}
                  onChange={(event) => setAnalyticsTimezone(event.target.value)}
                  placeholder="Asia/Dubai"
                />
              </label>
            </div>
            <div className="grid gap-2 px-5 py-3 md:grid-cols-3">
              {[
                ["daily", "Daily", analyticsDaily, setAnalyticsDaily],
                ["weekly", "Weekly", analyticsWeekly, setAnalyticsWeekly],
                ["monthly", "Monthly", analyticsMonthly, setAnalyticsMonthly],
              ].map(([key, label, checked, setter]) => (
                <label key={key as string} className="flex items-center gap-2 rounded-lg bg-sidebar/50 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={checked as boolean}
                    onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)}
                  />
                  {label as string}
                </label>
              ))}
            </div>
            <div className="grid gap-2 px-5 py-3 md:grid-cols-3">
              {ANALYTICS_METRICS.map((metric) => (
                <label key={metric.key} className="flex items-center gap-2 text-[13px] text-foreground">
                  <input
                    type="checkbox"
                    checked={analyticsMetrics.includes(metric.key)}
                    onChange={() => toggleAnalyticsMetric(metric.key)}
                  />
                  {metric.label}
                </label>
              ))}
            </div>
            <SettingsCardRow
              icon={Send}
              label="Delivery"
              detail="SMTP must be enabled above. Duplicate report emails are prevented by period tracking."
            >
              <Button
                type="button"
                onClick={handleSaveAnalyticsEmail}
                disabled={saveAnalyticsEmail.isPending}
              >
                {saveAnalyticsEmail.isPending ? "Saving..." : "Save schedule"}
              </Button>
            </SettingsCardRow>
            {analyticsError ? (
              <SettingsCardNote tone="destructive">{analyticsError}</SettingsCardNote>
            ) : null}
            {analyticsMessage ? <SettingsCardNote>{analyticsMessage}</SettingsCardNote> : null}
          </>
        )}
      </SettingsCard>

      <SettingsCard
        title="Email templates"
        description="Templates are stored as plain text and support safe placeholder shortcodes such as {{user_name}}, {{site_name}}, {{reset_link}}, {{verification_link}}, {{period}}, and {{analytics_summary}}."
      >
        {templates.isPending && !templates.data ? (
          <FormSkeleton fields={3} />
        ) : templates.isError || !templates.data?.length ? (
          <SettingsCardNote tone="destructive">Failed to load email templates.</SettingsCardNote>
        ) : (
          <>
            <div className="grid gap-3 px-5 py-3 md:grid-cols-[220px_1fr]">
              <label className="block text-[12px] font-medium text-foreground">
                Template
                <NativeSelect
                  value={selectedTemplateKey}
                  onChange={(event) => setSelectedTemplateKey(event.target.value)}
                  wrapperClassName="mt-1 w-full"
                  className="w-full"
                >
                  {templates.data.map((template) => (
                    <NativeSelectOption key={template.key} value={template.key}>
                      {template.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
              <label className="block text-[12px] font-medium text-foreground">
                Subject
                <FormInput
                  className="mt-1"
                  value={templateSubject}
                  onChange={(event) => setTemplateSubject(event.target.value)}
                />
              </label>
            </div>
            <div className="px-5 py-3">
              <label className="block text-[12px] font-medium text-foreground">
                Template name
                <FormInput
                  className="mt-1"
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                />
              </label>
            </div>
            <div className="px-5 py-3">
              <label className="block text-[12px] font-medium text-foreground">
                Body
                <FormTextarea
                  className="mt-1 min-h-[220px] font-mono text-[12px]"
                  value={templateBody}
                  onChange={(event) => setTemplateBody(event.target.value)}
                />
              </label>
            </div>
            <SettingsCardRow
              icon={TextCursorInput}
              label="Template format"
              detail="Rich HTML is not sent from these templates yet; plain text is safer for transactional email."
            >
              <Button
                type="button"
                onClick={handleSaveTemplate}
                disabled={saveTemplate.isPending || !selectedTemplate}
              >
                {saveTemplate.isPending ? "Saving..." : "Save template"}
              </Button>
            </SettingsCardRow>
            {templateError ? (
              <SettingsCardNote tone="destructive">{templateError}</SettingsCardNote>
            ) : null}
          </>
        )}
      </SettingsCard>
    </SettingsSection>
  );
}
