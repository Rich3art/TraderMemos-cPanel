export type TextTemplateScope = "journal" | "trade" | "setup" | "general";

export type TextTemplate = {
  id: string;
  name: string;
  body: string;
  scope: TextTemplateScope;
  favorite?: boolean;
  system?: boolean;
  createdAt?: string;
  updatedAt?: string;
  created_at?: string;
  updated_at?: string;
};

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

export function combineTextTemplates(custom: TextTemplate[] | undefined): TextTemplate[] {
  return [...SYSTEM_TEXT_TEMPLATES, ...(custom ?? [])];
}
