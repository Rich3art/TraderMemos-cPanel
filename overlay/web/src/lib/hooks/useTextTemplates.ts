import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { textTemplatesApi, type TextTemplateBody } from "@/lib/api/textTemplates";

export function useTextTemplates() {
  return useQuery({
    queryKey: ["text-templates"],
    queryFn: () => textTemplatesApi.list(),
  });
}

export function useCreateTextTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TextTemplateBody) => textTemplatesApi.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["text-templates"] });
    },
  });
}

export function useUpdateTextTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: TextTemplateBody }) =>
      textTemplatesApi.update(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["text-templates"] });
    },
  });
}

export function useDeleteTextTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => textTemplatesApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["text-templates"] });
    },
  });
}
