export type PositionSizingMode =
  | "risk_pct"
  | "units"
  | "risk_amount"
  | "margin_amount"
  | "margin_pct";

export interface PositionSizingInput {
  mode: PositionSizingMode;
  side: "long" | "short";
  accountBalance: number | null;
  entryPrice: number | null;
  stopPrice: number | null;
  takeProfitPrice: number | null;
  units: number | null;
  riskPercent: number | null;
  riskAmount: number | null;
  marginAmount: number | null;
  marginPercent: number | null;
  multiplier: number;
  tickSize?: number | null;
  tickValue?: number | null;
}

export interface PositionSizingResult {
  accountBalance: number | null;
  entryPrice: number | null;
  stopPrice: number | null;
  takeProfitPrice: number | null;
  units: number | null;
  monetaryRisk: number | null;
  riskPercent: number | null;
  potentialProfit: number | null;
  riskReward: number | null;
  marginAmount: number | null;
  marginPercent: number | null;
  notional: number | null;
  valueModel: "tick_value" | "multiplier";
  issues: string[];
}

function round(n: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function positive(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

function priceRisk(side: "long" | "short", entry: number, stop: number): number | null {
  const distance = side === "long" ? entry - stop : stop - entry;
  return distance > 0 ? distance : null;
}

function priceReward(side: "long" | "short", entry: number, target: number): number | null {
  const distance = side === "long" ? target - entry : entry - target;
  return distance > 0 ? distance : null;
}

export function calculatePositionSizing(input: PositionSizingInput): PositionSizingResult {
  const balance = positive(input.accountBalance);
  const entry = positive(input.entryPrice);
  const stop = positive(input.stopPrice);
  const target = positive(input.takeProfitPrice);
  const multiplier = positive(input.multiplier) ?? 1;
  const tickSize = positive(input.tickSize);
  const tickValue = positive(input.tickValue);
  const valueModel = tickSize != null && tickValue != null ? "tick_value" : "multiplier";
  const issues: string[] = [];

  const riskPerUnit = entry != null && stop != null ? priceRisk(input.side, entry, stop) : null;
  const rewardPerUnit =
    entry != null && target != null ? priceReward(input.side, entry, target) : null;
  const riskValuePerUnit =
    riskPerUnit != null
      ? valueModel === "tick_value"
        ? (riskPerUnit / tickSize!) * tickValue!
        : riskPerUnit * multiplier
      : null;
  const rewardValuePerUnit =
    rewardPerUnit != null
      ? valueModel === "tick_value"
        ? (rewardPerUnit / tickSize!) * tickValue!
        : rewardPerUnit * multiplier
      : null;
  if (entry != null && stop != null && riskPerUnit == null) {
    issues.push(
      input.side === "long"
        ? "For a long trade, stop must be below entry."
        : "For a short trade, stop must be above entry.",
    );
  }
  if (entry != null && target != null && rewardPerUnit == null) {
    issues.push(
      input.side === "long"
        ? "For a long trade, take profit should be above entry."
        : "For a short trade, take profit should be below entry.",
    );
  }

  let units = positive(input.units);
  let monetaryRisk = positive(input.riskAmount);
  let marginAmount = positive(input.marginAmount);
  let riskPercent = positive(input.riskPercent);
  let marginPercent = positive(input.marginPercent);

  if (input.mode === "risk_pct") {
    monetaryRisk = balance != null && riskPercent != null ? (balance * riskPercent) / 100 : null;
    units =
      monetaryRisk != null && riskValuePerUnit != null ? monetaryRisk / riskValuePerUnit : null;
  } else if (input.mode === "risk_amount") {
    riskPercent = balance != null && monetaryRisk != null ? (monetaryRisk / balance) * 100 : null;
    units =
      monetaryRisk != null && riskValuePerUnit != null ? monetaryRisk / riskValuePerUnit : null;
  } else if (input.mode === "units") {
    monetaryRisk =
      units != null && riskValuePerUnit != null ? units * riskValuePerUnit : null;
    riskPercent =
      balance != null && monetaryRisk != null ? (monetaryRisk / balance) * 100 : null;
  } else if (input.mode === "margin_amount") {
    marginPercent = balance != null && marginAmount != null ? (marginAmount / balance) * 100 : null;
  } else if (input.mode === "margin_pct") {
    marginAmount =
      balance != null && marginPercent != null ? (balance * marginPercent) / 100 : null;
  }

  const notional = units != null && entry != null ? units * entry * multiplier : null;
  const potentialProfit =
    units != null && rewardValuePerUnit != null ? units * rewardValuePerUnit : null;
  const riskReward =
    monetaryRisk != null && monetaryRisk > 0 && potentialProfit != null
      ? potentialProfit / monetaryRisk
      : null;

  if ((input.mode === "risk_pct" || input.mode === "risk_amount") && riskPerUnit == null) {
    issues.push("Set a valid entry and stop to calculate recommended units.");
  }
  if (balance == null) issues.push("Account balance/equity is unavailable.");

  return {
    accountBalance: balance,
    entryPrice: entry,
    stopPrice: stop,
    takeProfitPrice: target,
    units: units != null ? round(units, 6) : null,
    monetaryRisk: monetaryRisk != null ? round(monetaryRisk, 2) : null,
    riskPercent: riskPercent != null ? round(riskPercent, 4) : null,
    potentialProfit: potentialProfit != null ? round(potentialProfit, 2) : null,
    riskReward: riskReward != null ? round(riskReward, 2) : null,
    marginAmount: marginAmount != null ? round(marginAmount, 2) : null,
    marginPercent: marginPercent != null ? round(marginPercent, 4) : null,
    notional: notional != null ? round(notional, 2) : null,
    valueModel,
    issues,
  };
}
