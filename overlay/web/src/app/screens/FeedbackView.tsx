import { MessageSquare, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { Page } from "@/components/Page";
import { Pill } from "@/components/Pill";
import { ListSkeleton } from "@/components/skeletons/list-skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Feedback } from "@/lib/api/types";
import { fmtDateTime } from "@/lib/format";
import { intlLocale } from "@/lib/locale";

export interface FeedbackViewProps {
  feedback: Feedback[];
  loading: boolean;
  error: boolean;
  saving: boolean;
  onSubmit: (body: string, page: string) => Promise<void>;
}

function statusTone(status: string): "accent" | "muted" | "pos" {
  if (status === "closed") return "pos";
  if (status === "reviewing") return "accent";
  return "muted";
}

export function FeedbackView({ feedback, loading, error, saving, onSubmit }: FeedbackViewProps) {
  const [body, setBody] = useState("");
  const [page, setPage] = useState("");
  const locale = intlLocale();
  const sorted = useMemo(
    () => [...feedback].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [feedback],
  );
  const canSubmit = body.trim().length > 0 && !saving;

  return (
    <Page className="gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-foreground">Feedback</h1>
        <p className="text-[13px] text-muted-foreground">
          Send product feedback and track what you have already submitted.
        </p>
      </header>

      <Card title="Submit feedback" description="Describe the issue, idea, or improvement.">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            void onSubmit(body, page).then(() => {
              setBody("");
              setPage("");
            });
          }}
        >
          <Textarea
            aria-label="Feedback"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={5000}
            rows={5}
            placeholder="Write your feedback..."
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <input
              aria-label="Page or context"
              value={page}
              onChange={(e) => setPage(e.target.value)}
              maxLength={240}
              placeholder="Page/context, optional"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
            />
            <Button type="submit" disabled={!canSubmit} className="sm:w-auto">
              <Send size={14} strokeWidth={1.75} />
              {saving ? "Submitting..." : "Submit feedback"}
            </Button>
          </div>
          <p className="m-0 text-[11px] text-muted-foreground">{body.length}/5000</p>
        </form>
      </Card>

      <Card flush title="Previous feedback">
        {loading ? (
          <ListSkeleton rows={4} className="px-4 py-3" />
        ) : error ? (
          <EmptyState title="Could not load feedback" hint="Try refreshing the page." />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={24} strokeWidth={1.5} />}
            title="No feedback submitted yet"
          />
        ) : (
          <div className="divide-y divide-border">
            {sorted.map((item) => (
              <article key={item.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Pill tone={statusTone(item.status)}>{item.status}</Pill>
                    {item.page ? (
                      <span className="truncate text-xs text-muted-foreground">{item.page}</span>
                    ) : null}
                  </div>
                  <time className="text-xs tabular-nums text-muted-foreground">
                    {fmtDateTime(item.created_at, locale)}
                  </time>
                </div>
                <p className="m-0 mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        )}
      </Card>
    </Page>
  );
}
