import { apiFetch, qs } from "./client";

export type NewsChannel = "forex" | "crypto" | "metals";

export interface NewsItem {
  title: string;
  excerpt: string;
  source: string;
  url: string;
  published_at: string;
  channel: NewsChannel;
}

export interface NewsResponse {
  channel: NewsChannel;
  provider: string;
  provider_url: string;
  updated_at: string;
  items: NewsItem[];
}

export const NEWS_CHANNELS: { value: NewsChannel; label: string }[] = [
  { value: "forex", label: "Forex" },
  { value: "crypto", label: "Crypto" },
  { value: "metals", label: "Metals" },
];

export const newsApi = {
  list: (channel: NewsChannel) => apiFetch<NewsResponse>(`/news${qs({ channel })}`),
};
