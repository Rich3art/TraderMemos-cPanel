import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { setupsApi } from "@/lib/api/setups";

export function useSetups() {
  return useQuery({ queryKey: ["setups"], queryFn: () => setupsApi.list() });
}

export function useCreateSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setupsApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["setups"] }),
  });
}

export function useUpdateSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof setupsApi.update>[1] }) =>
      setupsApi.update(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["setups"] }),
  });
}

export function useDeleteSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => setupsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["setups"] }),
  });
}

export function useSetupAttachments(setupId: string | null) {
  return useQuery({
    queryKey: ["setup-attachments", setupId],
    queryFn: () => setupsApi.listAttachments(setupId ?? ""),
    enabled: Boolean(setupId),
  });
}

export function useUploadSetupAttachment(setupId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => setupsApi.uploadAttachment(setupId ?? "", formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["setup-attachments", setupId] });
      queryClient.invalidateQueries({ queryKey: ["setups"] });
    },
  });
}

export function useDeleteSetupAttachment(setupId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) => setupsApi.deleteAttachment(attachmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["setup-attachments", setupId] });
      queryClient.invalidateQueries({ queryKey: ["setups"] });
    },
  });
}
