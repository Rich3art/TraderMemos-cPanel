import { ChartLine } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { TradeChart } from "@/components/charts/TradeChart";
import { EmptyState } from "@/components/EmptyState";
import { fieldInputClass } from "@/components/field-styles";
import { Page } from "@/components/Page";
import { Button } from "@/components/ui/button";
import type { BarInterval } from "@/lib/api/market";
import { snapChartTime, useMarketBars } from "@/lib/hooks/useMarketBars";
import { inferMarketFromSymbol } from "@/lib/marketInference";

/** How far back to load per interval — roughly what fits a readable chart. */
const LOOKBACK_MS: Record<BarInterval, number> = {
  "1": 2 * 86_400_000,
  "5": 7 * 86_400_000,
  "15": 14 * 86_400_000,
  "60": 60 * 86_400_000,
  "240": 180 * 86_400_000,
  D: 365 * 86_400_000,
};

export interface AdvancedChartViewProps {
  /** Empty string = no symbol chosen yet. */
  symbol: string;
  interval: BarInterval;
  onSymbolChange: (symbol: string) => void;
  onIntervalChange: (interval: BarInterval) => void;
}

/** Standalone market chart for any symbol — no trade attached. */
export function AdvancedChartView({
  symbol,
  interval,
  onSymbolChange,
  onIntervalChange,
}: AdvancedChartViewProps) {
  const [input, setInput] = useState(symbol);
  const [loadedSpec, setLoadedSpec] = useState<{ symbol: string; interval: BarInterval } | null>(null);
  useEffect(() => setInput(symbol), [symbol]);

  // Snapped to the minute so query keys stay stable across renders.
  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - LOOKBACK_MS[interval]);
    return { from: snapChartTime(from.toISOString()), to: snapChartTime(to.toISOString()) };
  }, [interval]);

  const chartRequested = loadedSpec?.symbol === symbol && loadedSpec.interval === interval;
  const barsQ = useMarketBars({
    symbol,
    instrument_type: inferMarketFromSymbol(symbol),
    from: range.from,
    to: range.to,
    interval,
    enabled: symbol.length > 0 && chartRequested,
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const nextSymbol = input.trim().toUpperCase();
    if (!nextSymbol) return;
    setLoadedSpec({ symbol: nextSymbol, interval });
    onSymbolChange(nextSymbol);
  }

  function handleIntervalChange(next: BarInterval) {
    setLoadedSpec(null);
    onIntervalChange(next);
  }

  return (
    <Page>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[20px] font-bold tracking-[-0.02em] text-foreground">
            Advanced chart
          </h1>
          <form className="flex items-center gap-2" onSubmit={onSubmit}>
            <label className="sr-only" htmlFor="chart-symbol">
              Symbol
            </label>
            <input
              id="chart-symbol"
              className={`${fieldInputClass} w-36 uppercase`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="AAPL"
              autoComplete="off"
              spellCheck={false}
            />
            <Button type="submit" variant="soft" disabled={!input.trim()}>
              Load
            </Button>
          </form>
        </div>

        {symbol ? (
          <section className="rounded-lg bg-card p-4">
            {chartRequested ? (
              <TradeChart
                symbol={symbol}
                bars={barsQ.data?.bars}
                fills={[]}
                loading={barsQ.isLoading}
                error={barsQ.isError}
                errorMessage={barsQ.error instanceof Error ? barsQ.error.message : undefined}
                interval={interval}
                onIntervalChange={handleIntervalChange}
                height={480}
                hideHeaderLabel
                drawingTools
                annotationScope={{ entityType: "analysis", entityId: symbol }}
              />
            ) : (
              <div className="flex h-[480px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center">
                <ChartLine className="mb-3 size-7 text-muted-foreground" aria-hidden />
                <div className="text-sm font-medium text-foreground">Chart not loaded</div>
                <div className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Click Load to fetch market data and open the drawing chart.
                </div>
              </div>
            )}
          </section>
        ) : (
          <EmptyState
            title="Pick a symbol"
            hint="Load any ticker's candles — independent of your trades."
            icon={<ChartLine aria-hidden />}
          />
        )}
      </div>
    </Page>
  );
}
