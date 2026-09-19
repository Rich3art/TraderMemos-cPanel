import { createFileRoute } from "@tanstack/react-router";
import { TextTemplateManager } from "@/components/TextTemplateManager";

export const Route = createFileRoute("/templates")({
  component: TemplatesPage,
});

function TemplatesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Template Manager</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create reusable text templates for notes, journals, setups, and trade reviews.
        </p>
      </div>
      <TextTemplateManager />
    </div>
  );
}
