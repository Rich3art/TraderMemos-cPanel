import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, type RoleBody } from "@/lib/api/admin";

const ROLES_KEY = ["admin", "roles"];

export function usePermissions(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "permissions"],
    queryFn: () => adminApi.listPermissions(),
    enabled,
  });
}

export function useRoles(enabled: boolean) {
  return useQuery({
    queryKey: ROLES_KEY,
    queryFn: () => adminApi.listRoles(),
    enabled,
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RoleBody) => adminApi.createRole(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROLES_KEY }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RoleBody }) => adminApi.updateRole(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROLES_KEY }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.deleteRole(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROLES_KEY }),
  });
}

export function useUserRoles(userId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "user-roles", userId],
    queryFn: () => adminApi.getUserRoles(userId ?? ""),
    enabled: enabled && Boolean(userId),
  });
}

export function useSetUserRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roleIds }: { userId: string; roleIds: string[] }) =>
      adminApi.setUserRoles(userId, roleIds),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["admin", "user-roles", vars.userId] });
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
