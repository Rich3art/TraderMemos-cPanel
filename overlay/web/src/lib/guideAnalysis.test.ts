import { describe, expect, it } from "vitest";
import { analyzeGuide, timeframeForExpectation, trendFromBars } from "./guideAnalysis";
import type { MarketBar } from "./api/market";

function bars(closes: number[]): MarketBar[] {
  return closes.map((close, i) => ({
    time: i,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  }));
}

describe("guideAnalysis", () => {
  it("maps expectations to a main and higher timeframe", () => {
    expect(timeframeForExpectation("3 to 5 days").primary).toBe("240");
    expect(timeframeForExpectation("intraday today").higher).toBe("240");
    expect(timeframeForExpectation("quick scalp").primary).toBe("5");
  });

  it("reads simple trend direction from candle closes", () => {
    expect(trendFromBars(bars([100, 101, 102, 103, 104, 105]))).toBe("uptrend");
    expect(trendFromBars(bars([105, 104, 103, 102, 101, 100]))).toBe("downtrend");
    expect(trendFromBars(bars([100, 100.1, 100.2, 100.1, 100.2, 100.1]))).toBe("range");
  });

  it("penalizes direction that fights the chart read", () => {
    const long = analyzeGuide({
      symbol: "AAPL",
      instrumentType: "stock",
      side: "long",
      setupName: "Breakout",
      expectation: "3 days",
      bars: bars([105, 104, 103, 102, 101, 100]),
    });
    expect(long.bias).toBe("unfavorable");
    expect(long.probability).toBeLessThan(50);
  });
});
