import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsApi, type CommercialFeedSettingsPut } from "@/lib/api/settings";

const commercialFeedSettingsKey = ["settings", "commercial-feed"] as const;

export function useCommercialFeedSettings() {
  return useQuery({
    queryKey: commercialFeedSettingsKey,
    queryFn: () => settingsApi.getCommercialFeedSettings(),
  });
}

export function useSaveCommercialFeedSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CommercialFeedSettingsPut) => settingsApi.putCommercialFeedSettings(body),
    onSuccess: (data) => {
      qc.setQueryData(commercialFeedSettingsKey, data);
    },
  });
}

