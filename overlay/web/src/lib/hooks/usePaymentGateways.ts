import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  settingsApi,
  type PayPalGatewaySettingsPut,
  type WhopGatewaySettingsPut,
} from "@/lib/api/settings";

const paypalGatewayKey = ["settings", "payment-gateways", "paypal"] as const;
const whopGatewayKey = ["settings", "payment-gateways", "whop"] as const;

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
