export type TextTemplateScope = "journal" | "trade" | "setup" | "general";

export type TextTemplate = {
  id: string;
  name: string;
  body: string;
  scope: TextTemplateScope;
  favorite?: boolean;
  system?: boolean;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "tradermemos.textTemplates.v1";
export const TEXT_TEMPLATES_CHANGED = "tradermemos:text-templates-changed";

export const SYSTEM_TEXT_TEMPLATES: TextTemplate[] = [
  {
    id: "system-complete-trade-review",
    name: "Complete Trade Review",
    scope: "trade",
    system: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    body: [
      "## Trade Review",
      "",
      "### Setup",
      "- Why did this trade qualify?",
      "- Did it match the planned setup?",
      "",
      "### Execution",
      "- Entry quality:",
      "- Stop placement:",
      "- Exit quality:",
      "",
      "### Result",
      "- What worked?",
      "- What needs improvement?",
      "",
      "### Lesson",
      "- One thing to repeat:",
      "- One thing to avoid:",
    ].join("\n"),
  },
  {
    id: "system-quick-review",
    name: "Quick Review",
    scope: "journal",
    system: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    body: [
      "## Quick Review",
      "",
      "- Market read:",
      "- Best decision:",
      "- Mistake to fix:",
      "- Next action:",
    ].join("\n"),
  },
  {
    id: "system-pre-trade-plan",
    name: "Pre-Trade Plan",
    scope: "setup",
    system: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    body: [
      "## Pre-Trade Plan",
      "",
      "- Bias:",
      "- Key level:",
      "- Entry trigger:",
      "- Invalidation:",
      "- Target:",
      "- Risk notes:",
    ].join("\n"),
  },
  {
    id: "system-psychology-discipline",
    name: "Psychology & Discipline",
    scope: "journal",
    system: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    body: [
      "## Psychology & Discipline",
      "",
      "- Emotional state before trading:",
      "- Did I follow my rules?",
      "- What tempted me to break plan?",
      "- What helped me stay disciplined?",
    ].join("\n"),
  },
  {
    id: "system-mistake-analysis",
    name: "Mistake Analysis",
    scope: "trade",
    system: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    body: [
      "## Mistake Analysis",
      "",
      "- What happened?",
      "- Was this a process mistake or market outcome?",
      "- What rule would have prevented it?",
      "- What will I do next time?",
    ].join("\n"),
  },
];

function readCustomTemplates(): TextTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is TextTemplate =>
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.body === "string",
    );
  } catch {
    return [];
  }
}

function writeCustomTemplates(templates: TextTemplate[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  window.dispatchEvent(new Event(TEXT_TEMPLATES_CHANGED));
}

export function listTextTemplates() {
  return [...SYSTEM_TEXT_TEMPLATES, ...readCustomTemplates()];
}

export function listCustomTextTemplates() {
  return readCustomTemplates();
}

export function saveTextTemplate(input: Partial<TextTemplate> & Pick<TextTemplate, "name" | "body">) {
  const now = new Date().toISOString();
  const templates = readCustomTemplates();
  const id = input.id && !input.system ? input.id : `template-${crypto.randomUUID()}`;
  const existing = templates.find((template) => template.id === id);
  const next: TextTemplate = {
    id,
    name: input.name.trim() || "Untitled Template",
    body: input.body,
    scope: input.scope ?? existing?.scope ?? "general",
    favorite: Boolean(input.favorite ?? existing?.favorite),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  writeCustomTemplates([next, ...templates.filter((template) => template.id !== id)]);
  return next;
}

export function deleteTextTemplate(id: string) {
  writeCustomTemplates(readCustomTemplates().filter((template) => template.id !== id));
}

export function setTextTemplateFavorite(id: string, favorite: boolean) {
  const custom = readCustomTemplates();
  const existingCustom = custom.find((template) => template.id === id);
  if (existingCustom) {
    writeCustomTemplates(
      custom.map((template) =>
        template.id === id ? { ...template, favorite, updatedAt: new Date().toISOString() } : template,
      ),
    );
    return;
  }

  const systemTemplate = SYSTEM_TEXT_TEMPLATES.find((template) => template.id === id);
  if (!systemTemplate) return;
  saveTextTemplate({
    ...systemTemplate,
    id: `custom-${systemTemplate.id}`,
    system: false,
    favorite,
  });
}
