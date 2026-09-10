import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  subscriptionsApi,
  type SubscriptionPackageBody,
} from "@/lib/api/subscriptions";

const PACKAGES_KEY = ["admin", "subscriptions", "packages"] as const;
const RECORDS_KEY = ["admin", "subscriptions", "records"] as const;

export function useSubscriptionPackages(enabled = true) {
  return useQuery({
    queryKey: PACKAGES_KEY,
    queryFn: () => subscriptionsApi.listPackages(),
    enabled,
  });
}

export function usePublicSubscriptionPackage(slug: string) {
  return useQuery({
    queryKey: ["public", "subscriptions", slug],
    queryFn: () => subscriptionsApi.getPublicPackage(slug),
    enabled: Boolean(slug),
  });
}

export function useCreateSubscriptionPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SubscriptionPackageBody) => subscriptionsApi.createPackage(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: PACKAGES_KEY }),
  });
}

export function useUpdateSubscriptionPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SubscriptionPackageBody }) =>
      subscriptionsApi.updatePackage(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: PACKAGES_KEY }),
  });
}

export function useDeleteSubscriptionPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => subscriptionsApi.deletePackage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PACKAGES_KEY }),
  });
}

export function useSubscriptionRecords(enabled = true) {
  return useQuery({
    queryKey: RECORDS_KEY,
    queryFn: () => subscriptionsApi.listRecords(),
    enabled,
  });
}

export function useGrantSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { user_id: string; package_id: string; provider?: string; provider_ref?: string }) =>
      subscriptionsApi.grant(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: RECORDS_KEY });
      void qc.invalidateQueries({ queryKey: ["admin", "user-roles"] });
    },
  });
}

export function useCreatePayPalOrder() {
  return useMutation({
    mutationFn: (body: { package_id: string; return_url?: string; cancel_url?: string }) =>
      subscriptionsApi.createPayPalOrder(body),
  });
}

export function useCapturePayPalOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderID: string) => subscriptionsApi.capturePayPalOrder(orderID),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: RECORDS_KEY });
      void qc.invalidateQueries({ queryKey: ["admin", "user-roles"] });
    },
  });
}

export function useCreateWhopCheckout() {
  return useMutation({
    mutationFn: (body: { package_id: string; redirect_url?: string }) =>
      subscriptionsApi.createWhopCheckout(body),
  });
}

export function useInitializePaystack() {
  return useMutation({
    mutationFn: (body: { package_id: string; email?: string; callback_url?: string }) =>
      subscriptionsApi.initializePaystack(body),
  });
}

export function useVerifyPaystack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reference: string) => subscriptionsApi.verifyPaystack(reference),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: RECORDS_KEY });
      void qc.invalidateQueries({ queryKey: ["admin", "user-roles"] });
    },
  });
}
