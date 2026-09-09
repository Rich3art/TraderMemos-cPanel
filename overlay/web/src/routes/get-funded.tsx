import { createFileRoute } from "@tanstack/react-router";
import { GetFundedView } from "@/app/screens/GetFundedView";
import { useToastManager } from "@/components/Toast";
import { useMe } from "@/lib/hooks/useMe";
import {
  useAdminGetFundedListings,
  useCreateGetFundedListing,
  useDeleteGetFundedListing,
  useGetFundedListings,
  useUpdateGetFundedListing,
} from "@/lib/hooks/useGetFunded";

export const Route = createFileRoute("/get-funded")({
  component: GetFundedPage,
});

function GetFundedPage() {
  const toast = useToastManager();
  const me = useMe();
  const isAdmin = Boolean(me.data?.is_admin);
  const listingsQ = useGetFundedListings();
  const adminListingsQ = useAdminGetFundedListings(isAdmin);
  const createListing = useCreateGetFundedListing();
  const updateListing = useUpdateGetFundedListing();
  const deleteListing = useDeleteGetFundedListing();

  return (
    <GetFundedView
      listings={listingsQ.data ?? []}
      adminListings={adminListingsQ.data ?? []}
      isAdmin={isAdmin}
      loading={listingsQ.isLoading}
      adminLoading={adminListingsQ.isLoading}
      error={listingsQ.isError}
      saving={createListing.isPending || updateListing.isPending}
      deletingId={deleteListing.variables ?? null}
      onCreate={async (body) => {
        try {
          await createListing.mutateAsync(body);
          toast.add({ title: "Listing created" });
        } catch (err) {
          toast.add({
            title: "Could not create listing",
            description: err instanceof Error ? err.message : "Request failed",
          });
          throw err;
        }
      }}
      onUpdate={async (id, body) => {
        try {
          await updateListing.mutateAsync({ id, body });
          toast.add({ title: "Listing updated" });
        } catch (err) {
          toast.add({
            title: "Could not update listing",
            description: err instanceof Error ? err.message : "Request failed",
          });
          throw err;
        }
      }}
      onDelete={async (id) => {
        try {
          await deleteListing.mutateAsync(id);
          toast.add({ title: "Listing deleted" });
        } catch (err) {
          toast.add({
            title: "Could not delete listing",
            description: err instanceof Error ? err.message : "Request failed",
          });
          throw err;
        }
      }}
    />
  );
}
