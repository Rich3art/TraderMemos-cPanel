import { FileText, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  listTextTemplates,
  TEXT_TEMPLATES_CHANGED,
  type TextTemplate,
} from "@/lib/textTemplates";
import { cn } from "@/lib/cn";

export function TextTemplateButton({
  onApply,
  className,
}: {
  onApply: (body: string, template: TextTemplate) => void;
  className?: string;
}) {
  const [templates, setTemplates] = useState(() => listTextTemplates());

  useEffect(() => {
    const refresh = () => setTemplates(listTextTemplates());
    window.addEventListener(TEXT_TEMPLATES_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(TEXT_TEMPLATES_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const favorites = useMemo(() => templates.filter((template) => template.favorite), [templates]);
  const visibleTemplates = favorites.length > 0 ? favorites : templates.slice(0, 6);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="xs"
            className={cn("h-7 gap-1.5", className)}
          >
            <FileText size={13} strokeWidth={1.75} aria-hidden />
            Template
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72 p-0">
        <div className="space-y-3 p-3">
          <div>
            <div className="text-sm font-semibold text-foreground">Templates</div>
            <div className="text-xs text-muted-foreground">Insert saved text into this field.</div>
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {visibleTemplates.map((template) => (
              <PopoverClose
                key={template.id}
                render={
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={() => onApply(template.body, template)}
                  >
                    {template.favorite ? (
                      <Star
                        size={14}
                        strokeWidth={1.75}
                        className="mt-0.5 shrink-0 text-warning"
                        aria-hidden
                      />
                    ) : (
                      <FileText
                        size={14}
                        strokeWidth={1.75}
                        className="mt-0.5 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground">
                        {template.name}
                      </span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {template.body.replace(/[#*_`>-]/g, "").trim() || "Empty template"}
                      </span>
                    </span>
                  </button>
                }
              />
            ))}
          </div>
          <Button
            variant="ghost"
            size="xs"
            className="w-full justify-center"
            render={<Link to="/templates" />}
          >
            Manage templates
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
