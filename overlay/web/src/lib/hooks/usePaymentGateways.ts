import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsApi, type PayPalGatewaySettingsPut } from "@/lib/api/settings";

const paypalGatewayKey = ["settings", "payment-gateways", "paypal"] as const;

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
