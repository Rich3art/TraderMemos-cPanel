import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Feedback } from "@/lib/api/types";
import { FeedbackView } from "./FeedbackView";

const FEEDBACK: Feedback = {
  id: "f1",
  body: "Calendar day view needs a compact summary.",
  page: "/calendar",
  status: "open",
  created_at: "2026-09-10T08:00:00Z",
  updated_at: "2026-09-10T08:00:00Z",
};

describe("FeedbackView", () => {
  it("renders previous feedback submissions", () => {
    render(
      <FeedbackView
        feedback={[FEEDBACK]}
        loading={false}
        error={false}
        saving={false}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Feedback")).toBeInTheDocument();
    expect(screen.getByText("Calendar day view needs a compact summary.")).toBeInTheDocument();
    expect(screen.getByText("/calendar")).toBeInTheDocument();
    expect(screen.getByText("open")).toBeInTheDocument();
  });

  it("submits feedback with optional page context", async () => {
    const onSubmit = vi.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined);
    render(
      <FeedbackView feedback={[]} loading={false} error={false} saving={false} onSubmit={onSubmit} />,
    );

    await userEvent.type(screen.getByLabelText("Feedback"), "Please improve reports.");
    await userEvent.type(screen.getByLabelText("Page or context"), "/reports");
    await userEvent.click(screen.getByRole("button", { name: "Submit feedback" }));

    expect(onSubmit).toHaveBeenCalledWith("Please improve reports.", "/reports");
  });
});
