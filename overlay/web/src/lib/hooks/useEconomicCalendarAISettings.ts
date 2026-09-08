import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LlmApiModelsRequest, LlmApiSettingsTestRequest } from "@/lib/llmApiSettings";
import { type EconomicCalendarAISettingsPut, settingsApi } from "@/lib/api/settings";

export function useEconomicCalendarAISettings() {
  return useQuery({
    queryKey: ["settings", "economic-calendar-ai"],
    queryFn: () => settingsApi.getEconomicCalendarAISettings(),
  });
}

export function useSaveEconomicCalendarAISettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EconomicCalendarAISettingsPut) =>
      settingsApi.putEconomicCalendarAISettings(body),
    onSuccess: (data) => {
      qc.setQueryData(["settings", "economic-calendar-ai"], data);
    },
  });
}

export function useTestEconomicCalendarAISettings() {
  return useMutation({
    mutationFn: (body: LlmApiSettingsTestRequest) =>
      settingsApi.testEconomicCalendarAISettings(body),
  });
}

export function useListEconomicCalendarAIModels() {
  return useMutation({
    mutationFn: (body: LlmApiModelsRequest) => settingsApi.listEconomicCalendarAIModels(body),
  });
}
