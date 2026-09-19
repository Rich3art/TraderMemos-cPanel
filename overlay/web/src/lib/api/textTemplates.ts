import { apiFetch } from "./client";
import type { TextTemplate, TextTemplateScope } from "@/lib/textTemplates";

export type TextTemplateBody = {
  name: string;
  body: string;
  scope?: TextTemplateScope;
  favorite?: boolean;
};

export const textTemplatesApi = {
  list: () => apiFetch<TextTemplate[]>("/text-templates"),
  create: (body: TextTemplateBody) =>
    apiFetch<TextTemplate>("/text-templates", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (id: string, body: TextTemplateBody) =>
    apiFetch<TextTemplate>(`/text-templates/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  remove: (id: string) =>
    apiFetch<void>(`/text-templates/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
