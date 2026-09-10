import { apiFetch } from "./client";
import type { ContentLink, ContentPage, ResourcePost } from "./types";

export interface ContentPageBody {
  title: string;
  summary?: string;
  body?: string;
  image_url?: string;
  links?: ContentLink[];
}

export interface ResourcePostBody {
  slug?: string;
  title: string;
  excerpt?: string;
  body?: string;
  image_url?: string;
  tags?: string;
  display_order?: number;
  published?: boolean;
}

export const contentApi = {
  getPage: (slug: string) => apiFetch<ContentPage>(`/content/pages/${encodeURIComponent(slug)}`),
  updatePage: (slug: string, body: ContentPageBody) =>
    apiFetch<ContentPage>(`/admin/content/pages/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  listResources: () => apiFetch<ResourcePost[]>("/resources"),
  listAdminResources: () => apiFetch<ResourcePost[]>("/admin/content/resources"),
  createResource: (body: ResourcePostBody) =>
    apiFetch<ResourcePost>("/admin/content/resources", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateResource: (id: string, body: ResourcePostBody) =>
    apiFetch<ResourcePost>(`/admin/content/resources/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  removeResource: (id: string) =>
    apiFetch<void>(`/admin/content/resources/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
