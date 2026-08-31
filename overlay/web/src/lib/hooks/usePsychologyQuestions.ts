import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type PsychologyQuestions, settingsApi } from "@/lib/api/settings";

export function usePsychologyQuestions() {
  return useQuery({
    queryKey: ["settings", "psychology-questions"],
    queryFn: () => settingsApi.getPsychologyQuestions(),
  });
}

export function useSavePsychologyQuestions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PsychologyQuestions) => settingsApi.putPsychologyQuestions(body),
    onSuccess: (data) => {
      qc.setQueryData(["settings", "psychology-questions"], data);
    },
  });
}
