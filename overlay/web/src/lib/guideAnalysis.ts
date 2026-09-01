import type { BarInterval, MarketBar } from "./api/market";

export interface GuideAnalysisInput {
  symbol: string;
  instrumentType: string;
  side: "long" | "short";
  setupName: string;
  expectation: string;
  bars: MarketBar[];
}

export interface GuideAnalysisResult {
  primaryTimeframe: BarInterval;
  higherTimeframe: BarInterval;
  trend: "uptrend" | "downtrend" | "range";
  probability: number;
  bias: "favorable" | "mixed" | "unfavorable";
  eventOrNewsNote: string;
  summary: string;
}

const TIMEFRAME_LABELS: Record<BarInterval, string> = {
  "1": "1 minute",
  "5": "5 minute",
  "15": "15 minute",
  "60": "1 hour",
  "240": "4 hour",
  D: "1 day",
};

export function labelTimeframe(interval: BarInterval): string {
  return TIMEFRAME_LABELS[interval];
}

export function timeframeForExpectation(expectation: string): {
  primary: BarInterval;
  higher: BarInterval;
} {
  const s = expectation.toLowerCase();
  if (/\b(min|minute|minutes|scalp|scalping)\b/.test(s)) return { primary: "5", higher: "15" };
  if (/\b(hour|hours|intraday|today|same day)\b/.test(s)) return { primary: "60", higher: "240" };
  if (/\b(day|days|swing|week)\b/.test(s)) return { primary: "240", higher: "D" };
  return { primary: "60", higher: "240" };
}

export function trendFromBars(bars: MarketBar[]): GuideAnalysisResult["trend"] {
  const usable = bars.filter((b) => Number.isFinite(b.close));
  if (usable.length < 6) return "range";
  const sample = usable.slice(-24);
  const first = sample[0]!.close;
  const last = sample[sample.length - 1]!.close;
  if (first <= 0) return "range";
  const changePct = ((last - first) / first) * 100;
  if (changePct >= 0.6) return "uptrend";
  if (changePct <= -0.6) return "downtrend";
  return "range";
}

function eventOrNewsNote(symbol: string, instrumentType: string): string {
  const sym = symbol.trim().toUpperCase();
  if (instrumentType === "forex") {
    return `${sym}: check the Events screen before entry; currency news can change the trade quality quickly.`;
  }
  return `${sym}: live news analysis is not configured yet, so this guide uses chart trend and your plan fields.`;
}

export function analyzeGuide(input: GuideAnalysisInput): GuideAnalysisResult {
  const { primary, higher } = timeframeForExpectation(input.expectation);
  const trend = trendFromBars(input.bars);
  const wantsLong = input.side === "long";
  const aligned =
    trend === "range" || (wantsLong && trend === "uptrend") || (!wantsLong && trend === "downtrend");
  const hasSetup = input.setupName.trim().length > 0;
  const hasExpectation = input.expectation.trim().length > 0;
  const probability = Math.max(
    25,
    Math.min(75, 50 + (aligned ? 12 : -18) + (hasSetup ? 5 : -3) + (hasExpectation ? 4 : -4)),
  );
  const bias = probability >= 62 ? "favorable" : probability <= 42 ? "unfavorable" : "mixed";
  const direction = wantsLong ? "long" : "short";
  const eventNote = eventOrNewsNote(input.symbol, input.instrumentType);
  const summary = [
    `${input.symbol.trim().toUpperCase()} ${direction} guide: ${bias} (${probability}% quality estimate).`,
    `Chart trend reads as ${trend}. Main timeframe: ${labelTimeframe(primary)}; higher check: ${labelTimeframe(higher)}.`,
    aligned
      ? `The intended ${direction} direction is not fighting the current chart read.`
      : `The intended ${direction} direction conflicts with the current chart read; reduce size or wait for confirmation.`,
    eventNote,
  ].join("\n");

  return {
    primaryTimeframe: primary,
    higherTimeframe: higher,
    trend,
    probability,
    bias,
    eventOrNewsNote: eventNote,
    summary,
  };
}
