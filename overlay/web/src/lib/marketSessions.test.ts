import { describe, expect, it } from "vite-plus/test";
import { formatDurationUntil, marketSessionSnapshot } from "./marketSessions";

describe("market sessions", () => {
  it("marks London and New York closed after their UTC close", () => {
    const snapshot = marketSessionSnapshot(new Date("2026-08-30T17:20:00Z"), "en-US");

    expect(snapshot.anyOpen).toBe(false);
    expect(snapshot.label).toBe("Markets closed");
    expect(snapshot.nextTransition?.label).toBe("Tokyo");
    expect(snapshot.nextTransition?.nextTransitionLabel).toBe("Tokyo opens in 6h 40m");
  });

  it("shows active sessions and close transitions", () => {
    const snapshot = marketSessionSnapshot(new Date("2026-08-31T14:30:00Z"), "en-US");

    expect(snapshot.label).toBe("London / New York open");
    expect(snapshot.openSessions.map((s) => s.id)).toEqual(["london", "new-york"]);
    expect(snapshot.nextTransition?.nextTransitionLabel).toBe("London closes in 2h 30m");
  });

  it("formats short remaining times", () => {
    expect(formatDurationUntil(new Date("2026-08-31T12:10:00Z"), new Date("2026-08-31T12:00:00Z"))).toBe("10m");
  });
});
