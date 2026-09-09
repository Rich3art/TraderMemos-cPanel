import { apiFetch } from "./client";
import type { GetFundedListing } from "./types";

export interface GetFundedListingBody {
  firm_name: string;
  heading: string;
  description?: string;
  content?: string;
  image_url?: string;
  affiliate_url?: string;
  cta_label?: string;
  promo_code?: string;
  display_order?: number;
  published?: boolean;
}

export const getFundedApi = {
  listPublished: () => apiFetch<GetFundedListing[]>("/get-funded"),
  listAdmin: () => apiFetch<GetFundedListing[]>("/admin/get-funded"),
  create: (body: GetFundedListingBody) =>
    apiFetch<GetFundedListing>("/admin/get-funded", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (id: string, body: GetFundedListingBody) =>
    apiFetch<GetFundedListing>(`/admin/get-funded/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  remove: (id: string) =>
    apiFetch<void>(`/admin/get-funded/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
