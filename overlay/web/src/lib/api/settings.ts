import { apiFetch } from "./client";
import type {
  LlmApiModelsRequest,
  LlmApiModelsResult,
  LlmApiSettings,
  LlmApiSettingsPut,
  LlmApiSettingsTestRequest,
  LlmApiSettingsTestResult,
} from "@/lib/llmApiSettings";

export type { LlmApiSettings as OcrSettings, LlmApiSettingsPut as OcrSettingsPut };
export type { LlmApiSettingsTestRequest as OcrSettingsTestRequest };
export type { LlmApiSettingsTestResult as OcrSettingsTestResult };
export type { LlmApiModelsRequest as OcrModelsRequest };
export type { LlmApiModelsResult as OcrModelsResult };

export type CoachSettings = LlmApiSettings;
export type CoachSettingsPut = LlmApiSettingsPut;
export type EconomicCalendarAISettings = LlmApiSettings;
export type EconomicCalendarAISettingsPut = LlmApiSettingsPut;

export interface RiskRules {
  max_risk_per_trade: number | null;
  max_daily_loss: number | null;
  max_daily_drawdown: number | null;
  max_open_risk: number | null;
  default_account_risk_pct: number | null;
  max_trades_per_day: number | null;
  max_consecutive_losses: number | null;
}

export interface AnnualGoal {
  year: number;
  amount: number | null;
}

export interface ChecklistTemplate {
  items: string[];
  content?: string;
}

export interface PsychologyQuestions {
  questions: string[];
}

export type CommercialNewsProvider = "public" | "paid";
export type CommercialPaidProvider = "" | "newsapi" | "finnhub" | "mediastack" | "custom";

export interface CommercialFeedSettings {
  news_provider: CommercialNewsProvider;
  paid_provider: CommercialPaidProvider;
  api_base_url: string;
  license_note: string;
  api_key_set: boolean;
  api_key_hint?: string;
}

export interface CommercialFeedSettingsPut {
  news_provider: CommercialNewsProvider;
  paid_provider: CommercialPaidProvider;
  api_base_url: string;
  license_note: string;
  api_key?: string;
}

export type SmtpEncryption = "none" | "starttls" | "tls";

export interface SmtpSettings {
  enabled: boolean;
  host: string;
  port: number;
  encryption: SmtpEncryption;
  username: string;
  password_set: boolean;
  password_hint?: string;
  from_email: string;
  from_name: string;
  updated_at?: string;
}

export interface SmtpSettingsPut {
  enabled: boolean;
  host: string;
  port: number;
  encryption: SmtpEncryption;
  username: string;
  password?: string;
  clear_password?: boolean;
  from_email: string;
  from_name: string;
}

export interface EmailTemplate {
  key: string;
  name: string;
  subject: string;
  body: string;
  updated_at?: string;
}

export interface AnalyticsEmailSettings {
  enabled: boolean;
  email: string;
  timezone: string;
  daily: boolean;
  weekly: boolean;
  monthly: boolean;
  metrics: string[];
  updated_at?: string;
}

export interface DailyJournalReminderSettings {
  enabled: boolean;
  reminder_time: string;
  timezone: string;
  push_enabled: boolean;
  email_enabled: boolean;
  email: string;
  updated_at?: string;
}

export type PayPalMode = "sandbox" | "live";

export interface PayPalGatewaySettings {
  enabled: boolean;
  mode: PayPalMode;
  client_id: string;
  client_secret_set: boolean;
  client_secret_hint?: string;
  webhook_id_set: boolean;
  webhook_id_hint?: string;
  updated_at?: string;
}

export interface PayPalGatewaySettingsPut {
  enabled: boolean;
  mode: PayPalMode;
  client_id: string;
  client_secret?: string;
  clear_client_secret?: boolean;
  webhook_id?: string;
  clear_webhook_id?: boolean;
}

export interface WhopGatewaySettings {
  enabled: boolean;
  mode: PayPalMode;
  account_id: string;
  api_key_set: boolean;
  api_key_hint?: string;
  webhook_secret_set: boolean;
  webhook_secret_hint?: string;
  updated_at?: string;
}

export interface WhopGatewaySettingsPut {
  enabled: boolean;
  mode: PayPalMode;
  account_id: string;
  api_key?: string;
  clear_api_key?: boolean;
  webhook_secret?: string;
  clear_webhook_secret?: boolean;
}

export interface PaystackGatewaySettings {
  enabled: boolean;
  public_key: string;
  secret_key_set: boolean;
  secret_key_hint?: string;
  updated_at?: string;
}

export interface PaystackGatewaySettingsPut {
  enabled: boolean;
  public_key: string;
  secret_key?: string;
  clear_secret_key?: boolean;
}

export const settingsApi = {
  getRiskRules: () => apiFetch<RiskRules>("/settings/risk-rules"),
  putRiskRules: (body: RiskRules) =>
    apiFetch<RiskRules>("/settings/risk-rules", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  getAnnualGoal: (year?: number) => {
    const q = year != null ? `?year=${year}` : "";
    return apiFetch<AnnualGoal>(`/settings/annual-goal${q}`);
  },
  putAnnualGoal: (body: { year: number; amount: number }) =>
    apiFetch<AnnualGoal>("/settings/annual-goal", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteAnnualGoal: (year: number) =>
    apiFetch<AnnualGoal>(`/settings/annual-goal?year=${year}`, {
      method: "DELETE",
    }),
  getChecklistTemplate: () => apiFetch<ChecklistTemplate>("/settings/checklist-template"),
  putChecklistTemplate: (
    body: Partial<ChecklistTemplate> & { content?: string; items?: string[] },
  ) =>
    apiFetch<ChecklistTemplate>("/settings/checklist-template", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  getPsychologyQuestions: () => apiFetch<PsychologyQuestions>("/settings/psychology-questions"),
  putPsychologyQuestions: (body: PsychologyQuestions) =>
    apiFetch<PsychologyQuestions>("/settings/psychology-questions", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  getOcrSettings: () => apiFetch<LlmApiSettings>("/settings/ocr"),
  putOcrSettings: (body: LlmApiSettingsPut) =>
    apiFetch<LlmApiSettings>("/settings/ocr", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  testOcrSettings: (body: LlmApiSettingsTestRequest = {}) =>
    apiFetch<LlmApiSettingsTestResult>("/settings/ocr/test", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listOcrModels: (body: LlmApiModelsRequest = {}) =>
    apiFetch<LlmApiModelsResult>("/settings/ocr/models", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getCoachSettings: () => apiFetch<CoachSettings>("/settings/coach"),
  putCoachSettings: (body: CoachSettingsPut) =>
    apiFetch<CoachSettings>("/settings/coach", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  testCoachSettings: (body: LlmApiSettingsTestRequest = {}) =>
    apiFetch<LlmApiSettingsTestResult>("/settings/coach/test", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listCoachModels: (body: LlmApiModelsRequest = {}) =>
    apiFetch<LlmApiModelsResult>("/settings/coach/models", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getEconomicCalendarAISettings: () =>
    apiFetch<EconomicCalendarAISettings>("/settings/economic-calendar-ai"),
  putEconomicCalendarAISettings: (body: EconomicCalendarAISettingsPut) =>
    apiFetch<EconomicCalendarAISettings>("/settings/economic-calendar-ai", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  testEconomicCalendarAISettings: (body: LlmApiSettingsTestRequest = {}) =>
    apiFetch<LlmApiSettingsTestResult>("/settings/economic-calendar-ai/test", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listEconomicCalendarAIModels: (body: LlmApiModelsRequest = {}) =>
    apiFetch<LlmApiModelsResult>("/settings/economic-calendar-ai/models", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getCommercialFeedSettings: () =>
    apiFetch<CommercialFeedSettings>("/settings/commercial-feed"),
  putCommercialFeedSettings: (body: CommercialFeedSettingsPut) =>
    apiFetch<CommercialFeedSettings>("/settings/commercial-feed", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  getSmtpSettings: () => apiFetch<SmtpSettings>("/settings/email"),
  putSmtpSettings: (body: SmtpSettingsPut) =>
    apiFetch<SmtpSettings>("/settings/email", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  listEmailTemplates: () => apiFetch<EmailTemplate[]>("/settings/email/templates"),
  putEmailTemplate: (key: string, body: Pick<EmailTemplate, "name" | "subject" | "body">) =>
    apiFetch<EmailTemplate>(`/settings/email/templates/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  testSmtpSettings: (body: { to_email: string }) =>
    apiFetch<{ ok: boolean }>("/settings/email/test", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getAnalyticsEmailSettings: () =>
    apiFetch<AnalyticsEmailSettings>("/settings/analytics-emails"),
  putAnalyticsEmailSettings: (body: AnalyticsEmailSettings) =>
    apiFetch<AnalyticsEmailSettings>("/settings/analytics-emails", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  getDailyJournalReminderSettings: () =>
    apiFetch<DailyJournalReminderSettings>("/settings/daily-journal-reminder"),
  putDailyJournalReminderSettings: (body: DailyJournalReminderSettings) =>
    apiFetch<DailyJournalReminderSettings>("/settings/daily-journal-reminder", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  getPayPalGatewaySettings: () =>
    apiFetch<PayPalGatewaySettings>("/settings/payment-gateways/paypal"),
  putPayPalGatewaySettings: (body: PayPalGatewaySettingsPut) =>
    apiFetch<PayPalGatewaySettings>("/settings/payment-gateways/paypal", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  getWhopGatewaySettings: () =>
    apiFetch<WhopGatewaySettings>("/settings/payment-gateways/whop"),
  putWhopGatewaySettings: (body: WhopGatewaySettingsPut) =>
    apiFetch<WhopGatewaySettings>("/settings/payment-gateways/whop", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  getPaystackGatewaySettings: () =>
    apiFetch<PaystackGatewaySettings>("/settings/payment-gateways/paystack"),
  putPaystackGatewaySettings: (body: PaystackGatewaySettingsPut) =>
    apiFetch<PaystackGatewaySettings>("/settings/payment-gateways/paystack", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
};
