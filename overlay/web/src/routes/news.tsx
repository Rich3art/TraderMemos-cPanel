import { createFileRoute } from "@tanstack/react-router";
import { NewsView } from "@/app/screens/NewsView";
import { NEWS_CHANNELS, type NewsChannel } from "@/lib/api/news";
import { useNews } from "@/lib/hooks/useNews";

export function validateNewsSearch(search: Record<string, unknown>): { channel: NewsChannel } {
  const raw = typeof search.channel === "string" ? search.channel.toLowerCase() : "";
  const channel = NEWS_CHANNELS.some((option) => option.value === raw)
    ? (raw as NewsChannel)
    : "forex";
  return { channel };
}

export const Route = createFileRoute("/news")({
  validateSearch: validateNewsSearch,
  component: NewsPage,
});

function NewsPage() {
  const { channel } = Route.useSearch();
  const navigate = Route.useNavigate();
  const newsQ = useNews(channel);
  return (
    <NewsView
      channel={channel}
      onChannelChange={(next) => void navigate({ to: "/news", search: { channel: next } })}
      data={newsQ.data}
      loading={newsQ.isLoading}
      error={newsQ.isError}
    />
  );
}
