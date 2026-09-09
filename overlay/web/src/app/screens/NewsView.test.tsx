import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewsView } from "./NewsView";

describe("NewsView", () => {
  it("renders headlines and opens source links", () => {
    render(
      <NewsView
        channel="forex"
        onChannelChange={() => {}}
        data={{
          channel: "forex",
          provider: "GDELT Project",
          provider_url: "https://www.gdeltproject.org/",
          updated_at: "2026-09-09T10:00:00Z",
          items: [
            {
              title: "Dollar steadies before inflation data",
              excerpt: "Dollar steadies before inflation data",
              source: "Example Markets",
              url: "https://example.com/news/1",
              published_at: "2026-09-09T09:00:00Z",
              channel: "forex",
            },
          ],
        }}
      />,
    );

    const link = screen.getByRole("link", { name: /Dollar steadies/i });
    expect(link).toHaveAttribute("href", "https://example.com/news/1");
    expect(screen.getByText("News Channel")).toBeInTheDocument();
    expect(screen.getByText(/short headlines\/excerpts only/i)).toBeInTheDocument();
  });

  it("changes channels", async () => {
    const user = userEvent.setup();
    const onChannelChange = vi.fn();
    render(<NewsView channel="forex" onChannelChange={onChannelChange} data={undefined} />);

    await user.click(screen.getByRole("button", { name: "Crypto" }));
    expect(onChannelChange).toHaveBeenCalledWith("crypto");
  });

  it("shows error and empty states", () => {
    const { rerender } = render(
      <NewsView channel="forex" onChannelChange={() => {}} error data={undefined} />,
    );
    expect(screen.getByText("Couldn't load news")).toBeInTheDocument();

    rerender(
      <NewsView
        channel="metals"
        onChannelChange={() => {}}
        data={{
          channel: "metals",
          provider: "GDELT Project",
          provider_url: "https://www.gdeltproject.org/",
          updated_at: "2026-09-09T10:00:00Z",
          items: [],
        }}
      />,
    );
    expect(screen.getByText("No headlines found")).toBeInTheDocument();
  });
});
