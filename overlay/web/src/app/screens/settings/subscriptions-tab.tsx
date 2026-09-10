import { useMemo, useState } from "react";
import { BadgeDollarSign, Copy, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/Skeleton";
import { Pill } from "@/components/Pill";
import type { SubscriptionPackage, SubscriptionPackageBody } from "@/lib/api/subscriptions";
import { CURRENCY_OPTIONS } from "@/lib/currency";
import { useAdminUsers } from "@/lib/hooks/useAdminUsers";
import { useRoles } from "@/lib/hooks/useRoles";
import {
  useCreateSubscriptionPackage,
  useDeleteSubscriptionPackage,
  useGrantSubscription,
  useSubscriptionPackages,
  useSubscriptionRecords,
  useUpdateSubscriptionPackage,
} from "@/lib/hooks/useSubscriptions";
import { useMe } from "@/lib/hooks/useMe";
import { SettingsGroup, SettingsRow, SettingsSection } from "./settings-ui";

const EMPTY_PACKAGE: SubscriptionPackageBody = {
  slug: "",
  name: "",
  role_id: "",
  price: 0,
  currency: "USD",
  image_url: "",
  description: "",
  features: [],
  access_days: 30,
  published: false,
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function PackageEditor({
  pkg,
  roles,
  onDone,
}: {
  pkg?: SubscriptionPackage | null;
  roles: { id: string; name: string }[];
  onDone: () => void;
}) {
  const create = useCreateSubscriptionPackage();
  const update = useUpdateSubscriptionPackage();
  const [form, setForm] = useState<SubscriptionPackageBody>(
    pkg
      ? {
          slug: pkg.slug,
          name: pkg.name,
          role_id: pkg.role_id,
          price: pkg.price,
          currency: pkg.currency,
          image_url: pkg.image_url,
          description: pkg.description,
          features: pkg.features,
          access_days: pkg.access_days,
          published: pkg.published,
        }
      : EMPTY_PACKAGE,
  );
  const [featureDraft, setFeatureDraft] = useState("");
  const saving = create.isPending || update.isPending;

  function set<K extends keyof SubscriptionPackageBody>(key: K, value: SubscriptionPackageBody[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = { ...form, slug: slugify(form.slug || form.name) };
    if (pkg) await update.mutateAsync({ id: pkg.id, body });
    else await create.mutateAsync(body);
    onDone();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-border p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          value={form.name}
          placeholder="Package name"
          maxLength={100}
          onChange={(event) => {
            set("name", event.target.value);
            if (!pkg && !form.slug) set("slug", slugify(event.target.value));
          }}
        />
        <Input
          value={form.slug}
          placeholder="public-url-slug"
          maxLength={100}
          onChange={(event) => set("slug", slugify(event.target.value))}
        />
        <select
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
          value={form.role_id}
          onChange={(event) => set("role_id", event.target.value)}
        >
          <option value="">Role granted after payment...</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-[1fr_120px] gap-2">
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.price}
            placeholder="Price"
            onChange={(event) => set("price", Number(event.target.value || 0))}
          />
          <select
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            value={form.currency}
            onChange={(event) => set("currency", event.target.value)}
          >
            {CURRENCY_OPTIONS.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code}
              </option>
            ))}
          </select>
        </div>
        <Input
          type="number"
          min={1}
          value={form.access_days}
          placeholder="Access days"
          onChange={(event) => set("access_days", Number(event.target.value || 30))}
        />
        <Input
          value={form.image_url}
          placeholder="Image URL"
          maxLength={500}
          onChange={(event) => set("image_url", event.target.value)}
        />
      </div>
      <textarea
        value={form.description}
        placeholder="Description"
        maxLength={2000}
        onChange={(event) => set("description", event.target.value)}
        className="min-h-24 rounded-lg border border-input bg-background px-3 py-2 text-sm"
      />
      <div className="grid gap-2">
        <div className="flex gap-2">
          <Input
            value={featureDraft}
            placeholder="Feature"
            maxLength={160}
            onChange={(event) => setFeatureDraft(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const next = featureDraft.trim();
              if (!next) return;
              set("features", [...form.features, next]);
              setFeatureDraft("");
            }}
          >
            Add
          </Button>
        </div>
        {form.features.length ? (
          <div className="flex flex-wrap gap-2">
            {form.features.map((feature, index) => (
              <button
                type="button"
                key={`${feature}-${index}`}
                className="rounded-md bg-muted px-2 py-1 text-xs text-foreground"
                onClick={() => set("features", form.features.filter((_, i) => i !== index))}
              >
                {feature} ×
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.published}
          onChange={(event) => set("published", event.target.checked)}
        />
        Published public URL
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!form.name.trim() || !form.role_id} loading={saving}>
          {pkg ? "Save package" : "Create package"}
        </Button>
      </div>
    </form>
  );
}

function ManualGrant({ packages }: { packages: SubscriptionPackage[] }) {
  const users = useAdminUsers(true);
  const grant = useGrantSubscription();
  const [userId, setUserId] = useState("");
  const [packageId, setPackageId] = useState("");

  return (
    <SettingsSection
      title="Manual access grant"
      description="For admin testing or offline payments. Payment gateways will use the same server-side grant path after verified payment."
    >
      <SettingsGroup>
        <div className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_1fr_auto]">
          <select
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          >
            <option value="">Select user...</option>
            {(users.data ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.email}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            value={packageId}
            onChange={(event) => setPackageId(event.target.value)}
          >
            <option value="">Select package...</option>
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            disabled={!userId || !packageId || grant.isPending}
            onClick={() => void grant.mutateAsync({ user_id: userId, package_id: packageId })}
          >
            Grant
          </Button>
        </div>
      </SettingsGroup>
    </SettingsSection>
  );
}

export function SubscriptionsTab() {
  const me = useMe();
  const isOwner = Boolean(me.data?.is_admin);
  const packages = useSubscriptionPackages(isOwner);
  const records = useSubscriptionRecords(isOwner);
  const roles = useRoles(isOwner);
  const remove = useDeleteSubscriptionPackage();
  const [editing, setEditing] = useState<SubscriptionPackage | null | undefined>(undefined);
  const rolesList = useMemo(() => roles.data ?? [], [roles.data]);

  if (me.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!isOwner) {
    return (
      <SettingsSection title="Subscriptions" description="Only an owner can manage packages.">
        <SettingsGroup>
          <SettingsRow primary="You are signed in as a member" secondary="Ask an owner for access." />
        </SettingsGroup>
      </SettingsSection>
    );
  }

  return (
    <div className="grid gap-6">
      <SettingsSection
        title="Subscription packages"
        description="Create public purchase packages. Payment providers will attach to these packages in the next gateway tasks."
        action={
          editing === undefined ? (
            <Button type="button" size="sm" onClick={() => setEditing(null)}>
              New package
            </Button>
          ) : null
        }
      >
        <SettingsGroup>
          {editing !== undefined ? (
            <div className="px-5 py-4">
              <PackageEditor
                pkg={editing}
                roles={rolesList}
                onDone={() => setEditing(undefined)}
              />
            </div>
          ) : packages.isLoading || roles.isLoading ? (
            <div className="px-5 py-4">
              <Skeleton className="h-28 w-full" />
            </div>
          ) : (packages.data ?? []).length === 0 ? (
            <SettingsRow primary="No packages yet" secondary="Create your first package to get a public subscription URL." />
          ) : (
            (packages.data ?? []).map((pkg) => (
              <SettingsRow
                key={pkg.id}
                primary={
                  <span className="flex flex-wrap items-center gap-2">
                    <BadgeDollarSign size={15} strokeWidth={1.75} />
                    {pkg.name}
                    <Pill tone={pkg.published ? "accent" : "muted"}>
                      {pkg.published ? "Published" : "Draft"}
                    </Pill>
                  </span>
                }
                secondary={`${pkg.currency} ${pkg.price.toFixed(2)} · ${pkg.access_days} days · grants ${rolesList.find((r) => r.id === pkg.role_id)?.name ?? "role"}`}
                actions={
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => void navigator.clipboard?.writeText(pkg.public_url)}
                    >
                      <Copy size={13} strokeWidth={1.75} />
                      URL
                    </Button>
                    <a href={pkg.public_url} target="_blank" rel="noreferrer" className="no-underline">
                      <Button type="button" variant="outline" size="xs">
                        <ExternalLink size={13} strokeWidth={1.75} />
                        Open
                      </Button>
                    </a>
                    <Button type="button" variant="outline" size="xs" onClick={() => setEditing(pkg)}>
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete package ${pkg.name}?`)) void remove.mutateAsync(pkg.id);
                      }}
                    >
                      <Trash2 size={13} strokeWidth={1.75} />
                      Delete
                    </Button>
                  </>
                }
              />
            ))
          )}
        </SettingsGroup>
      </SettingsSection>
      <ManualGrant packages={packages.data ?? []} />
      <SettingsSection title="Subscription records" description="Most recent package access records.">
        <SettingsGroup>
          {records.isLoading ? (
            <div className="px-5 py-4">
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (records.data ?? []).length === 0 ? (
            <SettingsRow primary="No subscription records yet" secondary="Records appear after manual grants or verified gateway payments." />
          ) : (
            (records.data ?? []).map((record) => (
              <SettingsRow
                key={record.id}
                primary={`${record.status.toUpperCase()} · ${record.provider}`}
                secondary={`User ${record.user_id} · package ${record.package_id} · expires ${record.expires_at ?? "never"}`}
              />
            ))
          )}
        </SettingsGroup>
      </SettingsSection>
    </div>
  );
}
