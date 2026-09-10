import { useMemo, useState } from "react";
import { ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/Pill";
import { Skeleton } from "@/components/Skeleton";
import type { Role, RoleBody } from "@/lib/api/admin";
import { useAdminUsers } from "@/lib/hooks/useAdminUsers";
import { useMe } from "@/lib/hooks/useMe";
import {
  useCreateRole,
  useDeleteRole,
  usePermissions,
  useRoles,
  useSetUserRoles,
  useUpdateRole,
  useUserRoles,
} from "@/lib/hooks/useRoles";
import { SettingsGroup, SettingsRow, SettingsSection } from "./settings-ui";

const EMPTY_ROLE: RoleBody = { name: "", description: "", permissions: [] };

function hasPermission(selected: string[], id: string) {
  return selected.includes("*") || selected.includes(id);
}

function RoleEditor({
  role,
  onDone,
}: {
  role?: Role | null;
  onDone: () => void;
}) {
  const me = useMe();
  const isOwner = Boolean(me.data?.is_admin);
  const permissions = usePermissions(isOwner);
  const create = useCreateRole();
  const update = useUpdateRole();
  const [form, setForm] = useState<RoleBody>(
    role
      ? { name: role.name, description: role.description, permissions: role.permissions }
      : EMPTY_ROLE,
  );
  const grouped = useMemo(() => {
    const out = new Map<string, NonNullable<typeof permissions.data>>();
    for (const perm of permissions.data ?? []) {
      out.set(perm.group, [...(out.get(perm.group) ?? []), perm]);
    }
    return [...out.entries()];
  }, [permissions.data]);
  const saving = create.isPending || update.isPending;

  function toggle(id: string) {
    setForm((prev) => {
      if (id === "*") {
        return { ...prev, permissions: prev.permissions.includes("*") ? [] : ["*"] };
      }
      const withoutAll = prev.permissions.filter((p) => p !== "*");
      return {
        ...prev,
        permissions: withoutAll.includes(id)
          ? withoutAll.filter((p) => p !== id)
          : [...withoutAll, id],
      };
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;
    if (role) await update.mutateAsync({ id: role.id, body: form });
    else await create.mutateAsync(form);
    onDone();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-border p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          aria-label="Role name"
          value={form.name}
          maxLength={100}
          placeholder="Role name"
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
        />
        <Input
          aria-label="Role description"
          value={form.description ?? ""}
          maxLength={500}
          placeholder="Short description"
          onChange={(event) =>
            setForm((prev) => ({ ...prev, description: event.target.value }))
          }
        />
      </div>
      {permissions.isLoading ? (
        <Skeleton className="h-28 w-full" />
      ) : (
        <div className="grid gap-3">
          {grouped.map(([group, items]) => (
            <div key={group} className="rounded-lg bg-sidebar/50 p-3">
              <p className="m-0 mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group}
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                {items.map((perm) => (
                  <label key={perm.id} className="flex gap-2 text-[13px] text-foreground">
                    <input
                      type="checkbox"
                      checked={hasPermission(form.permissions, perm.id)}
                      onChange={() => toggle(perm.id)}
                    />
                    <span>
                      {perm.label}
                      <span className="block text-[12px] text-muted-foreground">
                        {perm.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!form.name.trim()} loading={saving}>
          {role ? "Save role" : "Create role"}
        </Button>
      </div>
    </form>
  );
}

function AssignRoles({ roles }: { roles: Role[] }) {
  const users = useAdminUsers(true);
  const [userId, setUserId] = useState("");
  const userRoles = useUserRoles(userId || null, Boolean(userId));
  const setRoles = useSetUserRoles();
  const selected = userRoles.data?.role_ids ?? [];

  function toggle(roleId: string) {
    const next = selected.includes(roleId)
      ? selected.filter((id) => id !== roleId)
      : [...selected, roleId];
    void setRoles.mutateAsync({ userId, roleIds: next });
  }

  return (
    <SettingsSection
      title="Assign Roles"
      description="Once a user has any role assigned, server-side permissions are enforced for that user."
    >
      <SettingsGroup>
        <div className="grid gap-3 px-5 py-4">
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
          {userId ? (
            <div className="grid gap-2 md:grid-cols-2">
              {roles.map((role) => (
                <label key={role.id} className="flex gap-2 rounded-lg bg-sidebar/50 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(role.id)}
                    disabled={userRoles.isLoading || setRoles.isPending}
                    onChange={() => toggle(role.id)}
                  />
                  <span>
                    {role.name}
                    <span className="block text-xs text-muted-foreground">{role.description}</span>
                  </span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
      </SettingsGroup>
    </SettingsSection>
  );
}

export function RolesTab() {
  const me = useMe();
  const isOwner = Boolean(me.data?.is_admin);
  const roles = useRoles(isOwner);
  const remove = useDeleteRole();
  const [editing, setEditing] = useState<Role | null | undefined>(undefined);

  if (me.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!isOwner) {
    return (
      <SettingsSection title="Roles" description="Only an owner can manage roles and permissions.">
        <SettingsGroup>
          <SettingsRow primary="You are signed in as a member" secondary="Ask an owner for access." />
        </SettingsGroup>
      </SettingsSection>
    );
  }

  return (
    <div className="grid gap-6">
      <SettingsSection
        title="Roles & Permissions"
        description="Create roles, choose feature permissions, and assign roles to users."
        action={
          editing === undefined ? (
            <Button type="button" size="sm" onClick={() => setEditing(null)}>
              New role
            </Button>
          ) : null
        }
      >
        <SettingsGroup>
          {editing !== undefined ? (
            <div className="px-5 py-4">
              <RoleEditor role={editing} onDone={() => setEditing(undefined)} />
            </div>
          ) : roles.isLoading ? (
            <div className="px-5 py-4">
              <Skeleton className="h-28 w-full" />
            </div>
          ) : (
            (roles.data ?? []).map((role) => (
              <SettingsRow
                key={role.id}
                primary={
                  <span className="flex flex-wrap items-center gap-2">
                    <ShieldCheck size={15} strokeWidth={1.75} />
                    {role.name}
                    {role.built_in ? <Pill tone="muted">Built in</Pill> : null}
                  </span>
                }
                secondary={`${role.description || "No description"} · ${role.permissions.length} permissions`}
                actions={
                  <>
                    <Button type="button" variant="outline" size="xs" onClick={() => setEditing(role)}>
                      Edit
                    </Button>
                    {!role.built_in ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm(`Delete role ${role.name}?`)) void remove.mutateAsync(role.id);
                        }}
                      >
                        <Trash2 size={13} strokeWidth={1.75} />
                        Delete
                      </Button>
                    ) : null}
                  </>
                }
              />
            ))
          )}
        </SettingsGroup>
      </SettingsSection>
      <AssignRoles roles={roles.data ?? []} />
    </div>
  );
}
