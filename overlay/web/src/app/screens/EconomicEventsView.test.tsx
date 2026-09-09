import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import type { EconomicEvent } from "@/lib/api/economicEvents";
import {
  addDaysKey,
  EconomicEventsView,
  economicEventSector,
  formatWeekLabel,
  weekStartKey,
} from "./EconomicEventsView";

function ev(overrides: Partial<EconomicEvent>): EconomicEvent {
  return {
    id: 1,
    provider: "forexfactory",
    title: "CPI y/y",
    country: "USD",
    impact: "high",
    time: "2026-08-04T12:30:00Z",
    forecast: "2.9%",
    previous: "3.0%",
    actual: "",
    ...overrides,
  };
}

const baseProps = {
  loading: false,
  error: false,
  weekStart: "2026-08-02",
  isCurrentWeek: true,
  onPrevWeek: vi.fn<() => void>(),
  onNextWeek: vi.fn<() => void>(),
  onThisWeek: vi.fn<() => void>(),
  onSectorChange: vi.fn<(next?: string) => void>(),
  onImpactChange: vi.fn<(next?: string[]) => void>(),
  onCurrenciesChange: vi.fn<(next?: string[]) => void>(),
};

describe("EconomicEventsView", () => {
  it("groups events by day with impact badges and figures", () => {
    render(
      <EconomicEventsView
        {...baseProps}
        events={[
          ev({ id: 1 }),
          ev({
            id: 2,
            title: "Unemployment Rate",
            country: "EUR",
            impact: "medium",
            time: "2026-08-05T09:00:00Z",
            forecast: "6.2%",
            previous: "6.3%",
          }),
        ]}
      />,
    );
    expect(screen.getByText("CPI y/y")).toBeInTheDocument();
    expect(screen.getByText("Unemployment Rate")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("2.9%")).toBeInTheDocument();
    // Two distinct day sections.
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2);
  });

  it("filters by impact and currency client-side", () => {
    render(
      <EconomicEventsView
        {...baseProps}
        impact={["high"]}
        currencies={["USD"]}
        events={[ev({ id: 1 }), ev({ id: 2, title: "GDP q/q", country: "EUR", impact: "low" })]}
      />,
    );
    expect(screen.getByText("CPI y/y")).toBeInTheDocument();
    expect(screen.queryByText("GDP q/q")).not.toBeInTheDocument();
  });

  it("shows the filtered empty state when filters hide everything", () => {
    render(<EconomicEventsView {...baseProps} impact={["holiday"]} events={[ev({ id: 1 })]} />);
    expect(screen.getByText("No events match the filters")).toBeInTheDocument();
  });

  it("filters by calendar sector", () => {
    render(
      <EconomicEventsView
        {...baseProps}
        sector="energy"
        events={[
          ev({ id: 1, title: "CPI y/y" }),
          ev({ id: 2, title: "Crude Oil Inventories", country: "USD" }),
        ]}
      />,
    );
    expect(screen.getByText("Crude Oil Inventories")).toBeInTheDocument();
    expect(screen.queryByText("CPI y/y")).not.toBeInTheDocument();
  });

  it("shows an error state when the query fails", () => {
    render(<EconomicEventsView {...baseProps} error events={[]} />);
    expect(screen.getByText("Couldn't load events")).toBeInTheDocument();
  });

  it("opens event details with impact analysis and a source link", async () => {
    render(
      <EconomicEventsView
        {...baseProps}
        events={[ev({ actual: "3.1%", provider: "official-us" })]}
      />,
    );

    await userEvent.click(screen.getByRole("row", { name: /cpi y\/y/i }));

    expect(screen.getByRole("heading", { name: /cpi y\/y/i })).toBeInTheDocument();
    expect(screen.getByText("AI impact analysis")).toBeInTheDocument();
    expect(screen.getByText(/above forecast/i)).toBeInTheDocument();
    expect(screen.getByText("Official U.S. sources")).toBeInTheDocument();
    expect(screen.getByText(/BLS.gov cannot vouch/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open source calendar/i })).toHaveAttribute(
      "href",
      "https://www.bls.gov/schedule/news_release/",
    );
  });
});

describe("economicEventSector", () => {
  it("classifies sector-specific events and defaults macro currency events to forex", () => {
    expect(economicEventSector(ev({ title: "Crude Oil Inventories" }))).toBe("energy");
    expect(economicEventSector(ev({ title: "Bitcoin ETF Flow" }))).toBe("crypto");
    expect(economicEventSector(ev({ title: "Gold Reserves" }))).toBe("metals");
    expect(economicEventSector(ev({ title: "Non-Farm Employment Change" }))).toBe("forex");
  });
});

describe("week helpers", () => {
  it("weekStartKey returns a Sunday and addDaysKey steps days", () => {
    const start = weekStartKey(0, "UTC");
    expect(new Date(`${start}T12:00:00Z`).getUTCDay()).toBe(0);
    expect(addDaysKey("2026-08-02", 7)).toBe("2026-08-09");
    expect(addDaysKey("2026-08-02", -1)).toBe("2026-08-01");
    // Offset weeks land exactly 7 days apart.
    expect(addDaysKey(weekStartKey(1, "UTC"), -7)).toBe(start);
  });

  it("formats the week range without leaking the year inside the current year", () => {
    // Intl separates range parts with thin spaces — compare on plain spaces.
    const label = (weekStart: string) =>
      formatWeekLabel(weekStart, "en-US", "2026-08-03").replace(/\s/g, " ");
    expect(label("2026-08-02")).toBe("Aug 2 – 8");
    expect(label("2026-07-26")).toBe("Jul 26 – Aug 1");
    // Weeks outside the current year keep the year for disambiguation.
    expect(label("2025-12-28")).toBe("Dec 28, 2025 – Jan 3, 2026");
  });
});
