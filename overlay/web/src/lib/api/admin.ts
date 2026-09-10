import { apiFetch } from "./client";

export interface AdminUser {
  id: string;
  email: string;
  is_admin: boolean;
  created_at: string;
  totp_enabled: boolean;
}

export interface PermissionDef {
  id: string;
  label: string;
  description: string;
  group: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  built_in: boolean;
  permissions: string[];
  created_at: string;
  updated_at: string;
}

export interface RoleBody {
  name: string;
  description?: string;
  permissions: string[];
}

export interface CreateAdminUserBody {
  email: string;
  password: string;
  is_admin: boolean;
}

export const adminApi = {
  listUsers: () => apiFetch<AdminUser[]>("/admin/users"),
  createUser: (body: CreateAdminUserBody) =>
    apiFetch<AdminUser>("/admin/users", { method: "POST", body: JSON.stringify(body) }),
  setAdmin: (id: string, isAdmin: boolean) =>
    apiFetch<AdminUser>(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_admin: isAdmin }),
    }),
  resetPassword: (id: string, newPassword: string) =>
    apiFetch<void>(`/admin/users/${id}/password`, {
      method: "POST",
      body: JSON.stringify({ new_password: newPassword }),
    }),
  deleteUser: (id: string) => apiFetch<void>(`/admin/users/${id}`, { method: "DELETE" }),
  listPermissions: () => apiFetch<PermissionDef[]>("/admin/permissions"),
  listRoles: () => apiFetch<Role[]>("/admin/roles"),
  createRole: (body: RoleBody) =>
    apiFetch<Role>("/admin/roles", { method: "POST", body: JSON.stringify(body) }),
  updateRole: (id: string, body: RoleBody) =>
    apiFetch<Role>(`/admin/roles/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteRole: (id: string) =>
    apiFetch<void>(`/admin/roles/${encodeURIComponent(id)}`, { method: "DELETE" }),
  getUserRoles: (id: string) =>
    apiFetch<{ role_ids: string[] }>(`/admin/users/${encodeURIComponent(id)}/roles`),
  setUserRoles: (id: string, role_ids: string[]) =>
    apiFetch<{ role_ids: string[] }>(`/admin/users/${encodeURIComponent(id)}/roles`, {
      method: "PUT",
      body: JSON.stringify({ role_ids }),
    }),
};
