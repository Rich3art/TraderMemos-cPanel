import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  settingsApi,
  type EmailTemplate,
  type SmtpSettingsPut,
} from "@/lib/api/settings";

const smtpSettingsKey = ["settings", "email", "smtp"] as const;
const emailTemplatesKey = ["settings", "email", "templates"] as const;

export function useSmtpSettings() {
  return useQuery({
    queryKey: smtpSettingsKey,
    queryFn: () => settingsApi.getSmtpSettings(),
  });
}

export function useSaveSmtpSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SmtpSettingsPut) => settingsApi.putSmtpSettings(body),
    onSuccess: (data) => qc.setQueryData(smtpSettingsKey, data),
  });
}

export function useEmailTemplates() {
  return useQuery({
    queryKey: emailTemplatesKey,
    queryFn: () => settingsApi.listEmailTemplates(),
  });
}

export function useSaveEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (template: Pick<EmailTemplate, "key" | "name" | "subject" | "body">) =>
      settingsApi.putEmailTemplate(template.key, {
        name: template.name,
        subject: template.subject,
        body: template.body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: emailTemplatesKey }),
  });
}

export function useTestSmtpSettings() {
  return useMutation({
    mutationFn: (body: { to_email: string }) => settingsApi.testSmtpSettings(body),
  });
}
