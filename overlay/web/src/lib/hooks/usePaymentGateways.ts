import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  settingsApi,
  type PayPalGatewaySettingsPut,
  type PaystackGatewaySettingsPut,
  type StripeGatewaySettingsPut,
  type WhopGatewaySettingsPut,
} from "@/lib/api/settings";

const paypalGatewayKey = ["settings", "payment-gateways", "paypal"] as const;
const whopGatewayKey = ["settings", "payment-gateways", "whop"] as const;
const paystackGatewayKey = ["settings", "payment-gateways", "paystack"] as const;
const stripeGatewayKey = ["settings", "payment-gateways", "stripe"] as const;

export function usePayPalGatewaySettings(enabled = true) {
  return useQuery({
    queryKey: paypalGatewayKey,
    queryFn: () => settingsApi.getPayPalGatewaySettings(),
    enabled,
  });
}

export function useUpdatePayPalGatewaySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PayPalGatewaySettingsPut) => settingsApi.putPayPalGatewaySettings(body),
    onSuccess: (data) => qc.setQueryData(paypalGatewayKey, data),
  });
}

export function useWhopGatewaySettings(enabled = true) {
  return useQuery({
    queryKey: whopGatewayKey,
    queryFn: () => settingsApi.getWhopGatewaySettings(),
    enabled,
  });
}

export function useUpdateWhopGatewaySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: WhopGatewaySettingsPut) => settingsApi.putWhopGatewaySettings(body),
    onSuccess: (data) => qc.setQueryData(whopGatewayKey, data),
  });
}

export function usePaystackGatewaySettings(enabled = true) {
  return useQuery({
    queryKey: paystackGatewayKey,
    queryFn: () => settingsApi.getPaystackGatewaySettings(),
    enabled,
  });
}

export function useUpdatePaystackGatewaySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PaystackGatewaySettingsPut) =>
      settingsApi.putPaystackGatewaySettings(body),
    onSuccess: (data) => qc.setQueryData(paystackGatewayKey, data),
  });
}

export function useStripeGatewaySettings(enabled = true) {
  return useQuery({
    queryKey: stripeGatewayKey,
    queryFn: () => settingsApi.getStripeGatewaySettings(),
    enabled,
  });
}

export function useUpdateStripeGatewaySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StripeGatewaySettingsPut) => settingsApi.putStripeGatewaySettings(body),
    onSuccess: (data) => qc.setQueryData(stripeGatewayKey, data),
  });
}
