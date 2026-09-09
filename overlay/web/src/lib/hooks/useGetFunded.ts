import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getFundedApi, type GetFundedListingBody } from "@/lib/api/getFunded";

export function useGetFundedListings() {
  return useQuery({
    queryKey: ["get-funded", "published"],
    queryFn: () => getFundedApi.listPublished(),
  });
}

export function useAdminGetFundedListings(enabled: boolean) {
  return useQuery({
    queryKey: ["get-funded", "admin"],
    queryFn: () => getFundedApi.listAdmin(),
    enabled,
  });
}

export function useCreateGetFundedListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: GetFundedListingBody) => getFundedApi.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["get-funded"] });
    },
  });
}

export function useUpdateGetFundedListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: GetFundedListingBody }) =>
      getFundedApi.update(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["get-funded"] });
    },
  });
}

export function useDeleteGetFundedListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getFundedApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["get-funded"] });
    },
  });
}
