import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { feedbackApi, type FeedbackBody } from "@/lib/api/feedback";

export function useFeedback() {
  return useQuery({
    queryKey: ["feedback"],
    queryFn: () => feedbackApi.list(),
  });
}

export function useCreateFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: FeedbackBody) => feedbackApi.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feedback"] }),
  });
}
