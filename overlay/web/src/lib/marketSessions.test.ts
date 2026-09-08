import { describe, expect, it } from "vite-plus/test";
import {
  formatDurationUntil,
  marketSessionSnapshot,
  tradingSessionNameAt,
} from "./marketSessions";

describe("market sessions", () => {
  it("marks London and New York closed after their UTC close", () => {
    const snapshot = marketSessionSnapshot(new Date("2026-08-30T17:20:00Z"), "en-US", "UTC");

    expect(snapshot.anyOpen).toBe(false);
    expect(snapshot.label).toBe("Markets closed");
    expect(snapshot.nextTransition?.label).toBe("Sydney");
    expect(snapshot.nextTransition?.nextTransitionLabel).toBe("Sydney opens in 3h 40m");
  });

  it("shows active sessions and close transitions", () => {
    const snapshot = marketSessionSnapshot(new Date("2026-08-31T14:30:00Z"), "en-US", "UTC");

    expect(snapshot.label).toBe("London / New York open");
    expect(snapshot.openSessions.map((s) => s.id)).toEqual(["london", "new-york"]);
    expect(snapshot.nextTransition?.nextTransitionLabel).toBe("London closes in 1h 30m");
    expect(snapshot.overlapLabel).toBe("Active overlap: London + New York");
  });

  it("opens Sydney on Australia/Sydney winter time", () => {
    const snapshot = marketSessionSnapshot(new Date("2026-09-01T00:30:00Z"), "en-US", "Asia/Dubai");

    expect(snapshot.openSessions.map((s) => s.id)).toEqual(["sydney", "tokyo"]);
    expect(snapshot.sessions.find((s) => s.id === "sydney")?.localTime).toBe("10:30");
    expect(snapshot.sessions.find((s) => s.id === "sydney")?.userLocalRange).toBe(
      "1:00 AM - 10:00 AM",
    );
  });

  it("opens Sydney on Australia/Sydney daylight saving time", () => {
    const snapshot = marketSessionSnapshot(new Date("2026-12-01T21:30:00Z"), "en-US", "Asia/Dubai");

    expect(snapshot.openSessions.map((s) => s.id)).toContain("sydney");
    expect(snapshot.sessions.find((s) => s.id === "sydney")?.localTime).toBe("08:30");
    expect(snapshot.sessions.find((s) => s.id === "sydney")?.userLocalRange).toBe(
      "12:00 AM - 9:00 AM",
    );
  });

  it("shows local open and close ranges for Dubai users", () => {
    const snapshot = marketSessionSnapshot(new Date("2026-09-08T12:00:00Z"), "en-US", "Asia/Dubai");

    expect(snapshot.sessions.find((s) => s.id === "london")?.userLocalRange).toBe(
      "11:00 AM - 8:00 PM",
    );
    expect(snapshot.sessions.find((s) => s.id === "new-york")?.userLocalRange).toBe(
      "4:00 PM - 1:00 AM",
    );
    expect(snapshot.sessions.find((s) => s.id === "london")?.statusLabel).toBe("Open");
  });

  it("formats short remaining times", () => {
    expect(
      formatDurationUntil(new Date("2026-08-31T12:10:00Z"), new Date("2026-08-31T12:00:00Z")),
    ).toBe("10m");
  });

  it("detects the journal trading session from a timestamp", () => {
    expect(tradingSessionNameAt(new Date("2026-09-01T00:30:00Z"))).toBe("Asia");
    expect(tradingSessionNameAt(new Date("2026-09-08T10:00:00Z"))).toBe("London");
    expect(tradingSessionNameAt(new Date("2026-09-08T14:30:00Z"))).toBe("New York");
    expect(tradingSessionNameAt(new Date("2026-09-06T12:00:00Z"))).toBe("");
  });
});
