import { describe, expect, it } from "vite-plus/test";
import { calculatePositionSizing } from "./positionSizing";

describe("calculatePositionSizing", () => {
  it("calculates units from risk percent for a long trade", () => {
    const result = calculatePositionSizing({
      mode: "risk_pct",
      side: "long",
      accountBalance: 10000,
      entryPrice: 100,
      stopPrice: 95,
      takeProfitPrice: 115,
      units: null,
      riskPercent: 1,
      riskAmount: null,
      marginAmount: null,
      marginPercent: null,
      multiplier: 1,
    });

    expect(result.monetaryRisk).toBe(100);
    expect(result.units).toBe(20);
    expect(result.potentialProfit).toBe(300);
    expect(result.riskReward).toBe(3);
  });

  it("handles short trades without divide-by-zero or inverted targets", () => {
    const result = calculatePositionSizing({
      mode: "units",
      side: "short",
      accountBalance: 5000,
      entryPrice: 50,
      stopPrice: 55,
      takeProfitPrice: 40,
      units: 10,
      riskPercent: null,
      riskAmount: null,
      marginAmount: null,
      marginPercent: null,
      multiplier: 1,
    });

    expect(result.monetaryRisk).toBe(50);
    expect(result.riskPercent).toBe(1);
    expect(result.potentialProfit).toBe(100);
    expect(result.riskReward).toBe(2);
    expect(result.issues).toEqual([]);
  });

  it("reports invalid stop placement instead of throwing", () => {
    const result = calculatePositionSizing({
      mode: "risk_amount",
      side: "long",
      accountBalance: 10000,
      entryPrice: 100,
      stopPrice: 101,
      takeProfitPrice: 110,
      units: null,
      riskPercent: null,
      riskAmount: 100,
      marginAmount: null,
      marginPercent: null,
      multiplier: 1,
    });

    expect(result.units).toBeNull();
    expect(result.issues).toContain("For a long trade, stop must be below entry.");
    expect(result.issues).toContain("Set a valid entry and stop to calculate recommended units.");
  });

  it("calculates margin amount and percent modes", () => {
    expect(
      calculatePositionSizing({
        mode: "margin_pct",
        side: "long",
        accountBalance: 2000,
        entryPrice: 10,
        stopPrice: 9,
        takeProfitPrice: 12,
        units: null,
        riskPercent: null,
        riskAmount: null,
        marginAmount: null,
        marginPercent: 5,
        multiplier: 1,
      }).marginAmount,
    ).toBe(100);

    expect(
      calculatePositionSizing({
        mode: "margin_amount",
        side: "long",
        accountBalance: 2000,
        entryPrice: 10,
        stopPrice: 9,
        takeProfitPrice: 12,
        units: null,
        riskPercent: null,
        riskAmount: null,
        marginAmount: 250,
        marginPercent: null,
        multiplier: 1,
      }).marginPercent,
    ).toBe(12.5);
  });
});
