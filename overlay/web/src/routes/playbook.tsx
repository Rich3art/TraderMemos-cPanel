import { createFileRoute } from "@tanstack/react-router";
import { PlaybookView } from "@/app/screens/PlaybookView";
import { useToastManager } from "@/components/Toast";
import { accountBaseCurrency } from "@/lib/displayPrefs";
import { useFilterParams, useFilters } from "@/lib/filters";
import { useAccounts } from "@/lib/hooks/useAccounts";
import { useBreakdown } from "@/lib/hooks/useAnalytics";
import { useDeleteSetup, useSetups } from "@/lib/hooks/useSetups";

export const Route = createFileRoute("/playbook")({
  validateSearch: (search) => ({
    tab: search.tab === "session-plan" ? "session-plan" : undefined,
    date:
      typeof search.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.date)
        ? search.date
        : undefined,
  }),
  component: PlaybookPage,
});

function PlaybookPage() {
  const search = Route.useSearch();
  const toast = useToastManager();
  const filters = useFilterParams();
  const accountIds = useFilters((s) => s.accountIds);

  const setupsQ = useSetups();
  const breakdownQ = useBreakdown("setup", filters);
  const accountsQ = useAccounts();
  const currency = accountBaseCurrency(accountsQ.data ?? [], accountIds);

  const deleteM = useDeleteSetup();

  return (
    <PlaybookView
      setups={setupsQ.data ?? []}
      setupsLoading={setupsQ.isLoading}
      setupsError={setupsQ.isError}
      breakdown={breakdownQ.data ?? []}
      breakdownLoading={breakdownQ.isLoading}
      currency={currency}
      initialTab={search.tab === "session-plan" ? "session-plan" : undefined}
      initialDate={search.date}
      onDelete={async (id) => {
        const name = setupsQ.data?.find((setup) => setup.id === id)?.name ?? "Setup";
        try {
          await deleteM.mutateAsync(id);
          toast.add({
            title: "Setup deleted",
            description: name,
          });
        } catch (err) {
          toast.add({
            title: "Could not delete setup",
            description: err instanceof Error ? err.message : "Request failed",
          });
          throw err;
        }
      }}
    />
  );
}
