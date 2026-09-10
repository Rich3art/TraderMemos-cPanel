import { ArrowUpRight, Edit3, FileText, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { MarkdownBody } from "@/components/MarkdownBody";
import { Page } from "@/components/Page";
import { Pill } from "@/components/Pill";
import { RichTextEditor } from "@/components/RichTextEditor";
import { ListSkeleton } from "@/components/skeletons/list-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ResourcePostBody } from "@/lib/api/content";
import type { ResourcePost } from "@/lib/api/types";
import { cn } from "@/lib/cn";

export interface ResourcesViewProps {
  resources: ResourcePost[];
  adminResources: ResourcePost[];
  isAdmin: boolean;
  loading: boolean;
  adminLoading: boolean;
  error: boolean;
  saving: boolean;
  deletingId?: string | null;
  onCreate: (body: ResourcePostBody) => Promise<void>;
  onUpdate: (id: string, body: ResourcePostBody) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const EMPTY_FORM: ResourcePostBody = {
  slug: "",
  title: "",
  excerpt: "",
  body: "",
  image_url: "",
  tags: "",
  display_order: 0,
  published: false,
};

function resourceToForm(item: ResourcePost): ResourcePostBody {
  return {
    slug: item.slug,
    title: item.title,
    excerpt: item.excerpt,
    body: item.body,
    image_url: item.image_url,
    tags: item.tags,
    display_order: item.display_order,
    published: item.published,
  };
}

function ResourceCard({ item, admin }: { item: ResourcePost; admin?: boolean }) {
  const tags = item.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 5);

  return (
    <article className="flex min-h-full flex-col overflow-hidden rounded-lg bg-card ring-1 ring-border">
      {item.image_url ? (
        <div className="aspect-[16/7] overflow-hidden bg-muted">
          <img src={item.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {admin ? (
            <Pill tone={item.published ? "pos" : "muted"}>
              {item.published ? "Published" : "Draft"}
            </Pill>
          ) : null}
          {tags.map((tag) => (
            <Pill key={tag} tone="accent">
              {tag}
            </Pill>
          ))}
        </div>
        <div className="space-y-2">
          <h2 className="m-0 text-base font-semibold text-foreground">{item.title}</h2>
          {item.excerpt ? (
            <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">{item.excerpt}</p>
          ) : null}
        </div>
        {item.body ? <MarkdownBody markdown={item.body} className="text-[13px]" /> : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-[11px] text-muted-foreground">
          <span>{new Date(item.updated_at).toLocaleDateString()}</span>
          <span className="inline-flex items-center gap-1">
            /resources/{item.slug}
            <ArrowUpRight size={12} strokeWidth={1.75} />
          </span>
        </div>
      </div>
    </article>
  );
}

export function ResourcesView({
  resources,
  adminResources,
  isAdmin,
  loading,
  adminLoading,
  error,
  saving,
  deletingId,
  onCreate,
  onUpdate,
  onDelete,
}: ResourcesViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ResourcePostBody>(EMPTY_FORM);
  const sorted = useMemo(
    () =>
      [...resources].sort(
        (a, b) => a.display_order - b.display_order || b.created_at.localeCompare(a.created_at),
      ),
    [resources],
  );
  const managed = isAdmin ? adminResources : [];
  const editing = managed.find((item) => item.id === editingId);
  const canSave = Boolean(form.title?.trim()) && !saving;

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function submit() {
    if (!canSave) return;
    if (editingId) await onUpdate(editingId, form);
    else await onCreate(form);
    resetForm();
  }

  return (
    <Page className="gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-foreground">Resources</h1>
        <p className="text-[13px] text-muted-foreground">
          Educational material, reference notes, links, and trading process guides.
        </p>
      </header>

      {isAdmin ? (
        <Card
          title={editing ? "Edit resource" : "Create resource"}
          description="Published resources are visible in this section. Drafts remain visible only to admins."
          action={
            editing ? (
              <Button type="button" variant="outline" size="sm" onClick={resetForm}>
                <Plus size={14} strokeWidth={1.75} />
                New resource
              </Button>
            ) : null
          }
        >
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                aria-label="Title"
                value={form.title ?? ""}
                maxLength={180}
                placeholder="Resource title"
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              />
              <Input
                aria-label="Slug"
                value={form.slug ?? ""}
                maxLength={100}
                placeholder="url-slug"
                onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))}
              />
            </div>
            <Textarea
              aria-label="Excerpt"
              value={form.excerpt ?? ""}
              maxLength={500}
              rows={2}
              placeholder="Short summary"
              onChange={(event) => setForm((prev) => ({ ...prev, excerpt: event.target.value }))}
            />
            <RichTextEditor
              value={form.body ?? ""}
              onChange={(body) => setForm((prev) => ({ ...prev, body }))}
              minHeight={180}
              placeholder="Write the resource content..."
            />
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                aria-label="Image URL"
                value={form.image_url ?? ""}
                maxLength={800}
                placeholder="Image URL, optional"
                onChange={(event) => setForm((prev) => ({ ...prev, image_url: event.target.value }))}
              />
              <Input
                aria-label="Tags"
                value={form.tags ?? ""}
                maxLength={500}
                placeholder="Tags, comma separated"
                onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  aria-label="Display order"
                  type="number"
                  value={form.display_order ?? 0}
                  className="w-32"
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, display_order: Number(event.target.value || 0) }))
                  }
                />
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Switch
                    checked={Boolean(form.published)}
                    onCheckedChange={(published) => setForm((prev) => ({ ...prev, published }))}
                  />
                  Published
                </label>
              </div>
              <Button type="submit" disabled={!canSave}>
                <Save size={14} strokeWidth={1.75} />
                {saving ? "Saving..." : editingId ? "Save changes" : "Create resource"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card flush title="Published resources">
        {loading ? (
          <ListSkeleton rows={4} className="px-4 py-3" />
        ) : error ? (
          <EmptyState title="Could not load resources" hint="Try refreshing the page." />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={<FileText size={24} strokeWidth={1.5} />}
            title="No resources yet"
            hint={isAdmin ? "Create and publish the first resource above." : undefined}
          />
        ) : (
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            {sorted.map((item) => (
              <ResourceCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </Card>

      {isAdmin ? (
        <Card flush title="Admin resource manager">
          {adminLoading ? (
            <ListSkeleton rows={3} className="px-4 py-3" />
          ) : managed.length === 0 ? (
            <EmptyState title="No draft or published resources" />
          ) : (
            <div className="divide-y divide-border">
              {managed.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between",
                    editingId === item.id && "bg-accent/30",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="m-0 font-medium text-foreground">{item.title}</p>
                      <Pill tone={item.published ? "pos" : "muted"}>
                        {item.published ? "Published" : "Draft"}
                      </Pill>
                    </div>
                    <p className="m-0 mt-1 truncate text-[13px] text-muted-foreground">
                      /resources/{item.slug}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingId(item.id);
                        setForm(resourceToForm(item));
                      }}
                    >
                      <Edit3 size={14} strokeWidth={1.75} />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="destructive-outline"
                      size="sm"
                      disabled={deletingId === item.id}
                      onClick={() => {
                        if (window.confirm(`Delete ${item.title}?`)) void onDelete(item.id);
                      }}
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                      {deletingId === item.id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}
    </Page>
  );
}
