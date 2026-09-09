import { AlertCircle, ExternalLink, Newspaper } from "lucide-react";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { Page } from "@/components/Page";
import { SegmentedControl } from "@/components/SegmentedControl";
import { ListSkeleton } from "@/components/skeletons/list-skeleton";
import type { NewsChannel, NewsItem, NewsResponse } from "@/lib/api/news";
import { NEWS_CHANNELS } from "@/lib/api/news";
import { cn } from "@/lib/cn";
import { fmtDateTime } from "@/lib/format";
import { intlLocale } from "@/lib/locale";

export interface NewsViewProps {
  channel: NewsChannel;
  onChannelChange: (channel: NewsChannel) => void;
  data?: NewsResponse;
  loading?: boolean;
  error?: boolean;
}

export function NewsView({ channel, onChannelChange, data, loading, error }: NewsViewProps) {
  const locale = intlLocale();
  const items = data?.items ?? [];

  return (
    <Page className="gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-foreground">News</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Latest market headlines with links to the original publishers.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            News Channel
          </span>
          <SegmentedControl
            value={channel}
            onChange={(value) => onChannelChange(value as NewsChannel)}
            options={NEWS_CHANNELS}
            size="sm"
            ariaLabel="News Channel"
          />
        </div>
      </div>

      <Card
        flush
        title="Market News"
        description={
          data
            ? `Source: ${data.provider}. Updated ${fmtDateTime(data.updated_at, locale)}.`
            : "Headlines refresh through the server-side news cache."
        }
      >
        {loading ? (
          <ListSkeleton rows={8} className="px-4 py-3" />
        ) : error ? (
          <EmptyState
            icon={<AlertCircle size={20} strokeWidth={1.75} />}
            title="Couldn't load news"
            hint="The news provider is unavailable or rate-limited. Try again in a few minutes."
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Newspaper size={20} strokeWidth={1.75} />}
            title="No headlines found"
            hint="Try another channel or check back later."
          />
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <NewsRow key={item.url} item={item} locale={locale} />
            ))}
          </div>
        )}
      </Card>

      {data ? (
        <p className="px-1 text-[11px] leading-4 text-muted-foreground">
          News is discovered through{" "}
          <a
            href={data.provider_url}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            {data.provider}
          </a>
          . TraderMemos shows short headlines/excerpts only and opens the original publisher for
          full articles.
        </p>
      ) : null}
    </Page>
  );
}

function NewsRow({ item, locale }: { item: NewsItem; locale: string }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "grid gap-2 px-4 py-3 no-underline transition-colors hover:bg-accent",
        "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
        "sm:grid-cols-[minmax(0,1fr)_9rem]",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-foreground">
          {item.title}
        </span>
        <span className="mt-1 block truncate text-[12px] text-muted-foreground">
          {item.excerpt}
        </span>
        <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {item.source || "Unknown source"}
          <ExternalLink size={12} strokeWidth={1.75} aria-hidden />
        </span>
      </span>
      <span className="text-left text-[12px] tabular-nums text-muted-foreground sm:text-right">
        {item.published_at ? fmtDateTime(item.published_at, locale) : "Recent"}
      </span>
    </a>
  );
}
