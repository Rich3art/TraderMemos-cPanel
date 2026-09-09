import { ArrowUpRight, BadgePercent, Building2, Edit3, Plus, Save, Trash2 } from "lucide-react";
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
import type { GetFundedListingBody } from "@/lib/api/getFunded";
import type { GetFundedListing } from "@/lib/api/types";
import { cn } from "@/lib/cn";

export interface GetFundedViewProps {
  listings: GetFundedListing[];
  adminListings: GetFundedListing[];
  isAdmin: boolean;
  loading: boolean;
  adminLoading: boolean;
  error: boolean;
  saving: boolean;
  deletingId?: string | null;
  onCreate: (body: GetFundedListingBody) => Promise<void>;
  onUpdate: (id: string, body: GetFundedListingBody) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const EMPTY_FORM: GetFundedListingBody = {
  firm_name: "",
  heading: "",
  description: "",
  content: "",
  image_url: "",
  affiliate_url: "",
  cta_label: "Learn more",
  promo_code: "",
  display_order: 0,
  published: false,
};

function listingToForm(item: GetFundedListing): GetFundedListingBody {
  return {
    firm_name: item.firm_name,
    heading: item.heading,
    description: item.description,
    content: item.content,
    image_url: item.image_url,
    affiliate_url: item.affiliate_url,
    cta_label: item.cta_label,
    promo_code: item.promo_code,
    display_order: item.display_order,
    published: item.published,
  };
}

function ListingCard({ item, admin }: { item: GetFundedListing; admin?: boolean }) {
  return (
    <article className="flex min-h-full flex-col overflow-hidden rounded-lg bg-card ring-1 ring-border">
      {item.image_url ? (
        <div className="aspect-[16/7] overflow-hidden bg-muted">
          <img
            src={item.image_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="accent">{item.firm_name}</Pill>
          {admin ? (
            <Pill tone={item.published ? "pos" : "muted"}>
              {item.published ? "Published" : "Draft"}
            </Pill>
          ) : null}
          {item.promo_code ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground">
              <BadgePercent size={13} strokeWidth={1.75} />
              {item.promo_code}
            </span>
          ) : null}
        </div>
        <div className="space-y-2">
          <h2 className="m-0 text-base font-semibold text-foreground">{item.heading}</h2>
          {item.description ? (
            <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">
              {item.description}
            </p>
          ) : null}
        </div>
        {item.content ? <MarkdownBody markdown={item.content} className="text-[13px]" /> : null}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          {item.affiliate_url ? (
            <a
              href={item.affiliate_url}
              target="_blank"
              rel="noreferrer sponsored"
              className="inline-flex h-8 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              {item.cta_label || "Learn more"}
              <ArrowUpRight size={14} strokeWidth={1.75} />
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">Affiliate link not configured.</span>
          )}
          {admin ? (
            <span className="text-[11px] text-muted-foreground">Order {item.display_order}</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function GetFundedView({
  listings,
  adminListings,
  isAdmin,
  loading,
  adminLoading,
  error,
  saving,
  deletingId,
  onCreate,
  onUpdate,
  onDelete,
}: GetFundedViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<GetFundedListingBody>(EMPTY_FORM);
  const sorted = useMemo(
    () => [...listings].sort((a, b) => a.display_order - b.display_order || b.created_at.localeCompare(a.created_at)),
    [listings],
  );
  const managed = isAdmin ? adminListings : [];
  const editing = managed.find((item) => item.id === editingId);
  const canSave = form.firm_name?.trim() && form.heading?.trim() && !saving;

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function submit() {
    if (!canSave) return;
    if (editingId) {
      await onUpdate(editingId, form);
    } else {
      await onCreate(form);
    }
    resetForm();
  }

  return (
    <Page className="gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-foreground">Get Funded</h1>
        <p className="text-[13px] text-muted-foreground">
          Compare prop-firm opportunities, promos, and funding paths.
        </p>
      </header>

      {isAdmin ? (
        <Card
          title={editing ? "Edit prop firm listing" : "Create prop firm listing"}
          description="Published listings appear on the Get Funded page. Drafts stay visible only here."
          action={
            editing ? (
              <Button type="button" variant="outline" size="sm" onClick={resetForm}>
                <Plus size={14} strokeWidth={1.75} />
                New listing
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
                aria-label="Firm name"
                value={form.firm_name}
                maxLength={120}
                placeholder="Prop firm name"
                onChange={(event) => setForm((prev) => ({ ...prev, firm_name: event.target.value }))}
              />
              <Input
                aria-label="Heading"
                value={form.heading}
                maxLength={180}
                placeholder="Heading"
                onChange={(event) => setForm((prev) => ({ ...prev, heading: event.target.value }))}
              />
            </div>
            <Textarea
              aria-label="Description"
              value={form.description}
              maxLength={500}
              rows={2}
              placeholder="Short description"
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
            <RichTextEditor
              value={form.content ?? ""}
              onChange={(content) => setForm((prev) => ({ ...prev, content }))}
              minHeight={160}
              placeholder="Detailed promo content, images, notes, and links..."
            />
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                aria-label="Image URL"
                value={form.image_url}
                maxLength={800}
                placeholder="Thumbnail URL, optional"
                onChange={(event) => setForm((prev) => ({ ...prev, image_url: event.target.value }))}
              />
              <Input
                aria-label="Affiliate URL"
                value={form.affiliate_url}
                maxLength={800}
                placeholder="Affiliate URL"
                onChange={(event) => setForm((prev) => ({ ...prev, affiliate_url: event.target.value }))}
              />
              <Input
                aria-label="CTA label"
                value={form.cta_label}
                maxLength={80}
                placeholder="CTA label"
                onChange={(event) => setForm((prev) => ({ ...prev, cta_label: event.target.value }))}
              />
              <Input
                aria-label="Promo code"
                value={form.promo_code}
                maxLength={80}
                placeholder="Promo code"
                onChange={(event) => setForm((prev) => ({ ...prev, promo_code: event.target.value }))}
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
                {saving ? "Saving..." : editingId ? "Save changes" : "Create listing"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card flush title={isAdmin ? "Listings" : undefined}>
        {loading ? (
          <ListSkeleton rows={4} className="px-4 py-3" />
        ) : error ? (
          <EmptyState title="Could not load Get Funded listings" hint="Try refreshing the page." />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={<Building2 size={24} strokeWidth={1.5} />}
            title="No prop firm listings yet"
            hint={isAdmin ? "Create and publish the first listing above." : undefined}
          />
        ) : (
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            {sorted.map((item) => (
              <ListingCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </Card>

      {isAdmin ? (
        <Card flush title="Admin listing manager">
          {adminLoading ? (
            <ListSkeleton rows={3} className="px-4 py-3" />
          ) : managed.length === 0 ? (
            <EmptyState title="No drafts or published listings" />
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
                      <p className="m-0 font-medium text-foreground">{item.firm_name}</p>
                      <Pill tone={item.published ? "pos" : "muted"}>
                        {item.published ? "Published" : "Draft"}
                      </Pill>
                    </div>
                    <p className="m-0 mt-1 truncate text-[13px] text-muted-foreground">
                      {item.heading}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingId(item.id);
                        setForm(listingToForm(item));
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
                        if (window.confirm(`Delete ${item.firm_name}?`)) void onDelete(item.id);
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
