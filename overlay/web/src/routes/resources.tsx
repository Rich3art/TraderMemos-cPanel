import { createFileRoute } from "@tanstack/react-router";
import { ResourcesView } from "@/app/screens/ResourcesView";
import { useToastManager } from "@/components/Toast";
import { useMe } from "@/lib/hooks/useMe";
import {
  useAdminResources,
  useCreateResource,
  useDeleteResource,
  useResources,
  useUpdateResource,
} from "@/lib/hooks/useContent";

export const Route = createFileRoute("/resources")({
  component: ResourcesPage,
});

function ResourcesPage() {
  const toast = useToastManager();
  const me = useMe();
  const isAdmin = Boolean(me.data?.is_admin);
  const resourcesQ = useResources();
  const adminResourcesQ = useAdminResources(isAdmin);
  const createResource = useCreateResource();
  const updateResource = useUpdateResource();
  const deleteResource = useDeleteResource();

  return (
    <ResourcesView
      resources={resourcesQ.data ?? []}
      adminResources={adminResourcesQ.data ?? []}
      isAdmin={isAdmin}
      loading={resourcesQ.isLoading}
      adminLoading={adminResourcesQ.isLoading}
      error={resourcesQ.isError}
      saving={createResource.isPending || updateResource.isPending}
      deletingId={deleteResource.variables ?? null}
      onCreate={async (body) => {
        try {
          await createResource.mutateAsync(body);
          toast.add({ title: "Resource created" });
        } catch (err) {
          toast.add({
            title: "Could not create resource",
            description: err instanceof Error ? err.message : "Request failed",
          });
          throw err;
        }
      }}
      onUpdate={async (id, body) => {
        try {
          await updateResource.mutateAsync({ id, body });
          toast.add({ title: "Resource updated" });
        } catch (err) {
          toast.add({
            title: "Could not update resource",
            description: err instanceof Error ? err.message : "Request failed",
          });
          throw err;
        }
      }}
      onDelete={async (id) => {
        try {
          await deleteResource.mutateAsync(id);
          toast.add({ title: "Resource deleted" });
        } catch (err) {
          toast.add({
            title: "Could not delete resource",
            description: err instanceof Error ? err.message : "Request failed",
          });
          throw err;
        }
      }}
    />
  );
}
