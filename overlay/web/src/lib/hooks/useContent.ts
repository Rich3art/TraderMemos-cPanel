import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { contentApi, type ContentPageBody, type ResourcePostBody } from "@/lib/api/content";

export function useContentPage(slug: string) {
  return useQuery({
    queryKey: ["content-page", slug],
    queryFn: () => contentApi.getPage(slug),
  });
}

export function useUpdateContentPage(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ContentPageBody) => contentApi.updatePage(slug, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["content-page", slug] });
    },
  });
}

export function useResources() {
  return useQuery({
    queryKey: ["resources", "published"],
    queryFn: () => contentApi.listResources(),
  });
}

export function useAdminResources(enabled: boolean) {
  return useQuery({
    queryKey: ["resources", "admin"],
    queryFn: () => contentApi.listAdminResources(),
    enabled,
  });
}

export function useCreateResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ResourcePostBody) => contentApi.createResource(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
  });
}

export function useUpdateResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ResourcePostBody }) =>
      contentApi.updateResource(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
  });
}

export function useDeleteResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => contentApi.removeResource(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
  });
}
