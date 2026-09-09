import { createFileRoute } from "@tanstack/react-router";
import { FeedbackView } from "@/app/screens/FeedbackView";
import { useToastManager } from "@/components/Toast";
import { useCreateFeedback, useFeedback } from "@/lib/hooks/useFeedback";

export const Route = createFileRoute("/feedback")({
  component: FeedbackPage,
});

function FeedbackPage() {
  const toast = useToastManager();
  const feedbackQ = useFeedback();
  const createFeedback = useCreateFeedback();

  return (
    <FeedbackView
      feedback={feedbackQ.data ?? []}
      loading={feedbackQ.isLoading}
      error={feedbackQ.isError}
      saving={createFeedback.isPending}
      onSubmit={async (body, page) => {
        try {
          await createFeedback.mutateAsync({ body, page });
          toast.add({ title: "Feedback submitted" });
        } catch (err) {
          toast.add({
            title: "Could not submit feedback",
            description: err instanceof Error ? err.message : "Request failed",
          });
          throw err;
        }
      }}
    />
  );
}
