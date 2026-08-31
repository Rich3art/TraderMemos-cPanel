import { describe, expect, it } from "vite-plus/test";
import { inferMarketFromSymbol, marketDefaultsForSymbol } from "./marketInference";

describe("inferMarketFromSymbol", () => {
  it("detects supported market types from common symbol formats", () => {
    expect(inferMarketFromSymbol("AAPL")).toBe("stock");
    expect(inferMarketFromSymbol("TSLA240321P00250000")).toBe("option");
    expect(inferMarketFromSymbol("BTCUSDT")).toBe("crypto");
    expect(inferMarketFromSymbol("ETH/USD")).toBe("crypto");
    expect(inferMarketFromSymbol("EURUSD")).toBe("forex");
    expect(inferMarketFromSymbol("XAUUSD")).toBe("forex");
    expect(inferMarketFromSymbol("NQ")).toBe("future");
    expect(inferMarketFromSymbol("/ESZ6")).toBe("future");
  });

  it("returns the right defaults for options and futures", () => {
    expect(marketDefaultsForSymbol("AAPL240119C00150000")).toMatchObject({
      market: "option",
      multiplier: "100",
      option_right: "call",
    });
    expect(marketDefaultsForSymbol("NQ")).toMatchObject({
      market: "future",
      futuresPresetId: "nq",
      multiplier: "20",
    });
  });
});
