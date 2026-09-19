import { FileText, Plus, Save, Star, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteTextTemplate,
  listTextTemplates,
  saveTextTemplate,
  setTextTemplateFavorite,
  TEXT_TEMPLATES_CHANGED,
  type TextTemplate,
} from "@/lib/textTemplates";
import { cn } from "@/lib/cn";

function blankTemplate(): TextTemplate {
  const now = new Date().toISOString();
  return {
    id: "",
    name: "",
    body: "",
    scope: "general",
    createdAt: now,
    updatedAt: now,
  };
}

export function TextTemplateManager() {
  const [templates, setTemplates] = useState(() => listTextTemplates());
  const [selectedId, setSelectedId] = useState<string | null>(templates[0]?.id ?? null);
  const selected = templates.find((template) => template.id === selectedId) ?? null;
  const [draft, setDraft] = useState<TextTemplate>(() => selected ?? blankTemplate());

  useEffect(() => {
    const refresh = () => setTemplates(listTextTemplates());
    window.addEventListener(TEXT_TEMPLATES_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(TEXT_TEMPLATES_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    setDraft(selected ?? blankTemplate());
  }, [selected]);

  const groups = useMemo(
    () => ({
      favorites: templates.filter((template) => template.favorite),
      system: templates.filter((template) => template.system),
      custom: templates.filter((template) => !template.system),
    }),
    [templates],
  );

  const selectNew = () => {
    setSelectedId(null);
    setDraft(blankTemplate());
  };

  const save = () => {
    const saved = saveTextTemplate(draft);
    setSelectedId(saved.id);
  };

  const remove = () => {
    if (!selected || selected.system) return;
    deleteTextTemplate(selected.id);
    setSelectedId(null);
  };

  const toggleFavorite = () => {
    if (!selected) return;
    setTextTemplateFavorite(selected.id, !selected.favorite);
  };

  return (
    <section className="min-h-[calc(100vh-7rem)] overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid min-h-[calc(100vh-7rem)] grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b border-border p-4 md:border-r md:border-b-0">
          <Button variant="outline" className="w-full" onClick={selectNew}>
            <Plus size={16} strokeWidth={1.75} aria-hidden />
            New Template
          </Button>
          <TemplateGroup
            title="Favorites"
            count={groups.favorites.length}
            templates={groups.favorites}
            selectedId={selectedId}
            empty="No favorites yet"
            onSelect={setSelectedId}
          />
          <TemplateGroup
            title="System Templates"
            count={groups.system.length}
            templates={groups.system}
            selectedId={selectedId}
            empty="No system templates"
            onSelect={setSelectedId}
          />
          <TemplateGroup
            title="My Templates"
            count={groups.custom.length}
            templates={groups.custom}
            selectedId={selectedId}
            empty="No custom templates"
            onSelect={setSelectedId}
          />
        </aside>
        <div className="flex min-w-0 flex-col p-5">
          {!selected && !draft.name && !draft.body ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <FileText size={48} strokeWidth={1.5} className="text-muted-foreground" />
              <div>
                <h2 className="text-lg font-semibold">No Template Selected</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select a template from the list or create a new one.
                </p>
              </div>
              <Button variant="outline" onClick={selectNew}>
                <Plus size={16} strokeWidth={1.75} aria-hidden />
                New Template
              </Button>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">
                    {draft.id && draft.system ? "System Template" : "Template"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Saved templates can be inserted into notes, journals, setups, and trades.
                  </p>
                </div>
                <div className="flex gap-2">
                  {selected ? (
                    <Button variant="outline" onClick={toggleFavorite}>
                      <Star size={16} strokeWidth={1.75} aria-hidden />
                      {selected.favorite ? "Unfavorite" : "Favorite"}
                    </Button>
                  ) : null}
                  {!draft.system ? (
                    <>
                      {selected ? (
                        <Button variant="destructive-outline" onClick={remove}>
                          <Trash2 size={16} strokeWidth={1.75} aria-hidden />
                          Delete
                        </Button>
                      ) : null}
                      <Button onClick={save}>
                        <Save size={16} strokeWidth={1.75} aria-hidden />
                        Save
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
              <label className="space-y-2">
                <span className="text-sm font-medium">Template name</span>
                <Input
                  value={draft.name}
                  readOnly={draft.system}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Mistake review, London session plan..."
                />
              </label>
              <label className="flex min-h-0 flex-1 flex-col gap-2">
                <span className="text-sm font-medium">Template content</span>
                <Textarea
                  value={draft.body}
                  readOnly={draft.system}
                  onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
                  placeholder="Write the reusable note or journal structure..."
                  className="min-h-[360px] flex-1 resize-none font-mono text-sm"
                />
              </label>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function TemplateGroup({
  title,
  count,
  templates,
  selectedId,
  empty,
  onSelect,
}: {
  title: string;
  count: number;
  templates: TextTemplate[];
  selectedId: string | null;
  empty: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{title}</span>
        <span>{count || ""}</span>
      </div>
      {templates.length === 0 ? (
        <div className="text-sm text-muted-foreground">{empty}</div>
      ) : (
        <div className="space-y-1">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelect(template.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                selectedId === template.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <FileText size={14} strokeWidth={1.75} aria-hidden />
              <span className="min-w-0 truncate">{template.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
