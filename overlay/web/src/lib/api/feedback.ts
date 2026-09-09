import { apiFetch } from "./client";
import type { Feedback } from "./types";

export interface FeedbackBody {
  body: string;
  page?: string;
}

export const feedbackApi = {
  list: () => apiFetch<Feedback[]>("/feedback"),
  create: (body: FeedbackBody) =>
    apiFetch<Feedback>("/feedback", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
