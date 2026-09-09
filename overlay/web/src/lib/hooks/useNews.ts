import { useQuery } from "@tanstack/react-query";
import { newsApi, type NewsChannel } from "../api/news";

export function useNews(channel: NewsChannel) {
  return useQuery({
    queryKey: ["news", channel],
    queryFn: () => newsApi.list(channel),
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
