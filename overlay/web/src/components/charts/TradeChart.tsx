import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import {
  ChartCandlestick,
  Maximize2,
  MousePointer2,
  MoveHorizontal,
  MoveVertical,
  Play,
  Slash,
  Square,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";
import type { Execution } from "@/lib/api/types";
import type { MarketBar, BarInterval } from "@/lib/api/market";
import { cn } from "@/lib/cn";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Skeleton } from "@/components/Skeleton";
import { Button } from "@/components/ui/button";
import { barsToCandlestickData } from "./barsToCandlestickData";
import { utcSecToChartTime } from "./chartTime";
import { BAR_INTERVALS, tradeChartTheme } from "./tradeChartTheme";

/** The fill fields the chart draws — synthetic backtest fills qualify too. */
export type ChartFill = Pick<Execution, "side" | "quantity" | "price" | "executed_at">;

type DrawingTool = "select" | "trendline" | "horizontal" | "vertical" | "rectangle";

type ChartDrawing =
  | { id: string; type: "trendline"; from: DrawingPoint; to: DrawingPoint }
  | { id: string; type: "horizontal"; price: number }
  | { id: string; type: "vertical"; time: number }
  | { id: string; type: "rectangle"; from: DrawingPoint; to: DrawingPoint };

type DrawingPoint = { time: number; price: number };

type DraftDrawing =
  | { type: "trendline"; from: DrawingPoint; to: DrawingPoint }
  | { type: "rectangle"; from: DrawingPoint; to: DrawingPoint };

const DRAWING_COLOR = "#38bdf8";
const DRAWING_FILL = "rgba(56, 189, 248, 0.12)";
const DRAWING_STORAGE_PREFIX = "tradermemos-chart-drawings:";

function drawingStorageKey(symbol: string, interval: BarInterval) {
  return `${DRAWING_STORAGE_PREFIX}${symbol.trim().toUpperCase()}:${interval}`;
}

function isDrawingTool(value: string): value is DrawingTool {
  return ["select", "trendline", "horizontal", "vertical", "rectangle"].includes(value);
}

function isChartDrawing(value: unknown): value is ChartDrawing {
  if (!value || typeof value !== "object") return false;
  const d = value as Partial<ChartDrawing>;
  if (typeof d.id !== "string" || typeof d.type !== "string") return false;
  if (d.type === "horizontal") return typeof d.price === "number";
  if (d.type === "vertical") return typeof d.time === "number";
  if (d.type === "trendline" || d.type === "rectangle") {
    const maybe = d as Partial<Extract<ChartDrawing, { type: "trendline" | "rectangle" }>>;
    return Boolean(
      maybe.from &&
        maybe.to &&
        typeof maybe.from.time === "number" &&
        typeof maybe.from.price === "number" &&
        typeof maybe.to.time === "number" &&
        typeof maybe.to.price === "number",
    );
  }
  return false;
}

function makeDrawingId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `drawing-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function fillMarkers(fills: ChartFill[]): SeriesMarker<Time>[] {
  return fills.map((f) => ({
    time: utcSecToChartTime(Math.floor(new Date(f.executed_at).getTime() / 1000)),
    position: f.side === "buy" ? "belowBar" : "aboveBar",
    shape: f.side === "buy" ? "arrowUp" : "arrowDown",
    color: f.side === "buy" ? tradeChartTheme.buyMarker : tradeChartTheme.sellMarker,
    text: `${f.quantity} @ ${f.price}`,
  }));
}

// Matches the Card header on the trade detail page — the chart is one of its
// card blocks, not a differently-branded panel.
const sectionLabelClass = "text-xs font-medium text-muted-foreground";

export interface TradeChartProps {
  symbol: string;
  bars: MarketBar[] | undefined;
  fills: ChartFill[];
  loading?: boolean;
  error?: boolean;
  errorMessage?: string;
  height?: number;
  targetPrice?: number | null;
  stopPrice?: number | null;
  entryPrice?: number | null;
  interval: BarInterval;
  onIntervalChange?: (interval: BarInterval) => void;
  className?: string;
  empty?: boolean;
  /** When true, hide interval chips on empty (non-chartable symbols). */
  hideIntervalWhenEmpty?: boolean;
  /** Opens an expanded modal. Omit when already expanded. */
  onExpand?: () => void;
  /** Hide the CHART label + expand row chrome (modal embeds its own title). */
  hideHeaderLabel?: boolean;
  /**
   * Replay cursor — exclusive end in unix seconds (UTC). Bars opening at or
   * after it are painted transparent and their fill markers hidden, so the
   * time axis stays full-width while candles reveal progressively.
   */
  replayUpTo?: number | null;
  /** Toggles replay mode; renders a play/exit button in the header. */
  onToggleReplay?: () => void;
  replayActive?: boolean;
  /** Enables local chart drawing tools. Drawings are saved per symbol and interval in this browser. */
  drawingTools?: boolean;
}

export function TradeChart({
  symbol: _symbol,
  bars,
  fills,
  loading = false,
  error = false,
  errorMessage,
  height = 280,
  targetPrice,
  stopPrice,
  entryPrice,
  interval,
  onIntervalChange,
  className,
  empty = false,
  hideIntervalWhenEmpty = false,
  onExpand,
  hideHeaderLabel = false,
  replayUpTo = null,
  onToggleReplay,
  replayActive = false,
  drawingTools = false,
}: TradeChartProps) {
  const symbol = _symbol.trim().toUpperCase();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<ReturnType<typeof createSeriesMarkers<Time>> | null>(null);
  const fitKeyRef = useRef<string | null>(null);
  // Price range of the bars revealed so far; null when not replaying.
  const replayRangeRef = useRef<{ lo: number; hi: number } | null>(null);
  const drawingButtonGroupId = useId();
  const [ready, setReady] = useState(false);
  const [activeTool, setActiveTool] = useState<DrawingTool>("select");
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [draft, setDraft] = useState<DraftDrawing | null>(null);

  const showInterval = Boolean(onIntervalChange) && !(hideIntervalWhenEmpty && empty);
  const overlayMessage = loading
    ? null
    : error
      ? (errorMessage ?? "Chart data unavailable.")
      : empty
        ? (errorMessage ?? "No chart data.")
        : bars && bars.length === 0
          ? "No bars for this window."
          : null;
  const canDraw = drawingTools && ready && !loading && !overlayMessage;
  const drawingKey = useMemo(() => drawingStorageKey(symbol, interval), [symbol, interval]);

  useEffect(() => {
    if (!drawingTools) return;
    try {
      const parsed = JSON.parse(localStorage.getItem(drawingKey) ?? "[]") as unknown;
      setDrawings(Array.isArray(parsed) ? parsed.filter(isChartDrawing) : []);
    } catch {
      setDrawings([]);
    }
    setDraft(null);
  }, [drawingKey, drawingTools]);

  useEffect(() => {
    if (!drawingTools) return;
    try {
      localStorage.setItem(drawingKey, JSON.stringify(drawings));
    } catch {
      // Local drawing persistence is best-effort.
    }
  }, [drawingKey, drawingTools, drawings]);

  function eventToPoint(e: PointerEvent<HTMLDivElement>): DrawingPoint | null {
    const el = containerRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!el || !chart || !series) return null;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const time = chart.timeScale().coordinateToTime(x);
    const price = series.coordinateToPrice(y);
    if (time == null || price == null) return null;
    return { time: Number(time), price };
  }

  function drawingPointToXY(point: DrawingPoint) {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const x = chart?.timeScale().timeToCoordinate(point.time as Time);
    const y = series?.priceToCoordinate(point.price);
    if (x == null || y == null) return null;
    return { x, y };
  }

  function priceToY(price: number) {
    return seriesRef.current?.priceToCoordinate(price) ?? null;
  }

  function timeToX(time: number) {
    return chartRef.current?.timeScale().timeToCoordinate(time as Time) ?? null;
  }

  function handleDrawingPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!canDraw || activeTool === "select") return;
    const point = eventToPoint(e);
    if (!point) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (activeTool === "horizontal") {
      setDrawings((prev) => [
        ...prev,
        { id: makeDrawingId(), type: "horizontal", price: point.price },
      ]);
      return;
    }
    if (activeTool === "vertical") {
      setDrawings((prev) => [...prev, { id: makeDrawingId(), type: "vertical", time: point.time }]);
      return;
    }
    setDraft({ type: activeTool, from: point, to: point });
  }

  function handleDrawingPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!canDraw || !draft) return;
    const point = eventToPoint(e);
    if (!point) return;
    setDraft((cur) => (cur ? { ...cur, to: point } : null));
  }

  function handleDrawingPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!canDraw || !draft) return;
    const point = eventToPoint(e);
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (!point) {
      setDraft(null);
      return;
    }
    const done = { ...draft, id: makeDrawingId(), to: point } as ChartDrawing;
    setDrawings((prev) => [...prev, done]);
    setDraft(null);
  }

  function undoDrawing() {
    setDrawings((prev) => prev.slice(0, -1));
    setDraft(null);
  }

  function clearDrawings() {
    setDrawings([]);
    setDraft(null);
  }

  function renderDrawing(drawing: ChartDrawing | DraftDrawing, key: string) {
    if (drawing.type === "horizontal") {
      const y = priceToY(drawing.price);
      if (y == null) return null;
      return <line key={key} x1={0} x2="100%" y1={y} y2={y} stroke={DRAWING_COLOR} strokeWidth={1.5} />;
    }
    if (drawing.type === "vertical") {
      const x = timeToX(drawing.time);
      if (x == null) return null;
      return <line key={key} x1={x} x2={x} y1={0} y2="100%" stroke={DRAWING_COLOR} strokeWidth={1.5} />;
    }
    const from = drawingPointToXY(drawing.from);
    const to = drawingPointToXY(drawing.to);
    if (!from || !to) return null;
    if (drawing.type === "rectangle") {
      const x = Math.min(from.x, to.x);
      const y = Math.min(from.y, to.y);
      return (
        <rect
          key={key}
          x={x}
          y={y}
          width={Math.abs(to.x - from.x)}
          height={Math.abs(to.y - from.y)}
          fill={DRAWING_FILL}
          stroke={DRAWING_COLOR}
          strokeWidth={1.5}
        />
      );
    }
    return (
      <line
        key={key}
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={DRAWING_COLOR}
        strokeWidth={1.8}
      />
    );
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: tradeChartTheme.background },
        textColor: tradeChartTheme.text,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: tradeChartTheme.grid },
        horzLines: { color: tradeChartTheme.grid },
      },
      rightPriceScale: { borderColor: tradeChartTheme.border },
      timeScale: { borderColor: tradeChartTheme.border, timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { labelVisible: true }, horzLine: { labelVisible: true } },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: tradeChartTheme.up,
      downColor: tradeChartTheme.down,
      borderUpColor: tradeChartTheme.up,
      borderDownColor: tradeChartTheme.down,
      wickUpColor: tradeChartTheme.up,
      wickDownColor: tradeChartTheme.down,
      // During replay, scale to the revealed bars only — the full-series
      // default would leak the not-yet-shown price range.
      autoscaleInfoProvider: (
        base: () => { priceRange: { minValue: number; maxValue: number } } | null,
      ) => {
        const r = replayRangeRef.current;
        if (!r) return base();
        return { priceRange: { minValue: r.lo, maxValue: r.hi } };
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;
    fitKeyRef.current = null;
    setReady(true);

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) chart.applyOptions({ width: w });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      setReady(false);
    };
  }, [height]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!ready || !series || !chart) return;

    if (!bars || bars.length === 0) {
      series.setData([]);
      return;
    }

    let points = barsToCandlestickData(bars, interval);
    let visibleFills = fills;
    if (replayUpTo != null) {
      // Hide not-yet-reached bars by painting them transparent. Lightweight
      // Charts drops trailing whitespace points, so swapping them for
      // whitespace would collapse the time axis instead of holding it steady.
      const cut = utcSecToChartTime(replayUpTo) as number;
      const hidden = "rgba(0,0,0,0)";
      points = points.map((p) =>
        "open" in p && (p.time as number) >= cut
          ? { ...p, color: hidden, borderColor: hidden, wickColor: hidden }
          : p,
      );
      visibleFills = fills.filter(
        (f) => Math.floor(new Date(f.executed_at).getTime() / 1000) < replayUpTo,
      );
      let lo = Number.POSITIVE_INFINITY;
      let hi = Number.NEGATIVE_INFINITY;
      for (const b of bars) {
        if (b.time < replayUpTo) {
          lo = Math.min(lo, b.low);
          hi = Math.max(hi, b.high);
        }
      }
      replayRangeRef.current = lo <= hi ? { lo, hi } : null;
    } else {
      replayRangeRef.current = null;
    }
    // The last-value label and price line track the final bar's close, which
    // would spoil the replay ending.
    series.applyOptions({
      lastValueVisible: replayUpTo == null,
      priceLineVisible: replayUpTo == null,
    });
    series.setData(points);

    for (const line of series.priceLines()) {
      series.removePriceLine(line);
    }
    if (entryPrice != null) {
      series.createPriceLine({
        price: entryPrice,
        color: tradeChartTheme.entryLine,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "Entry",
      });
    }
    if (targetPrice != null) {
      series.createPriceLine({
        price: targetPrice,
        color: tradeChartTheme.targetLine,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "Target",
      });
    }
    if (stopPrice != null) {
      series.createPriceLine({
        price: stopPrice,
        color: tradeChartTheme.stopLine,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "Stop",
      });
    }

    if (visibleFills.length > 0) {
      const markers = fillMarkers(visibleFills);
      if (markersRef.current) {
        markersRef.current.setMarkers(markers);
      } else {
        markersRef.current = createSeriesMarkers(series, markers);
      }
    } else {
      markersRef.current?.setMarkers([]);
    }

    // Fit only when the bar set changes, not on every replay tick — the
    // whitespaced series keeps the axis full-width, so refitting mid-replay
    // would only clobber the user's zoom.
    const fitKey = `${interval}:${bars.length}:${bars[0]!.time}:${bars.at(-1)!.time}`;
    if (fitKeyRef.current !== fitKey) {
      fitKeyRef.current = fitKey;
      chart.timeScale().fitContent();
    }
  }, [ready, bars, fills, interval, targetPrice, stopPrice, entryPrice, replayUpTo]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!hideHeaderLabel && <span className={sectionLabelClass}>Chart</span>}
        <div
          className={cn("flex items-center gap-1.5", hideHeaderLabel && "w-full justify-between")}
        >
          {showInterval && (
            <SegmentedControl
              value={interval}
              onChange={(v) => onIntervalChange?.(v as BarInterval)}
              options={BAR_INTERVALS}
            />
          )}
          {drawingTools && (
            <div
              className="flex items-center gap-1 rounded-md bg-muted/70 p-1"
              role="group"
              aria-labelledby={drawingButtonGroupId}
            >
              <span id={drawingButtonGroupId} className="sr-only">
                Chart drawing tools
              </span>
              {(
                [
                  ["select", MousePointer2, "Select or pan chart"],
                  ["trendline", Slash, "Draw trendline"],
                  ["horizontal", MoveHorizontal, "Draw horizontal level"],
                  ["vertical", MoveVertical, "Draw vertical marker"],
                  ["rectangle", Square, "Draw rectangle"],
                ] as const
              ).map(([tool, Icon, label]) => {
                return (
                  <Button
                    key={tool}
                    type="button"
                    variant={activeTool === tool ? "secondary" : "ghost"}
                    size="icon"
                    aria-label={label}
                    title={label}
                    onClick={() => isDrawingTool(tool) && setActiveTool(tool)}
                  >
                    <Icon size={14} strokeWidth={1.5} aria-hidden />
                  </Button>
                );
              })}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Undo last drawing"
                title="Undo last drawing"
                disabled={drawings.length === 0}
                onClick={undoDrawing}
              >
                <Undo2 size={14} strokeWidth={1.5} aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Clear drawings"
                title="Clear drawings"
                disabled={drawings.length === 0}
                onClick={clearDrawings}
              >
                <Trash2 size={14} strokeWidth={1.5} aria-hidden />
              </Button>
            </div>
          )}
          {onToggleReplay && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={replayActive ? "Exit replay" : "Replay trade"}
              onClick={onToggleReplay}
            >
              {replayActive ? (
                <X size={14} strokeWidth={1.5} aria-hidden />
              ) : (
                <Play size={14} strokeWidth={1.5} aria-hidden />
              )}
            </Button>
          )}
          {onExpand && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Expand chart"
              onClick={onExpand}
            >
              <Maximize2 size={14} strokeWidth={1.5} aria-hidden />
            </Button>
          )}
        </div>
      </div>
      <div className="relative overflow-hidden rounded-md bg-muted" style={{ height }}>
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/80">
            <Skeleton height={`${height - 24}px`} className="mx-3 w-[calc(100%-1.5rem)]" />
          </div>
        )}
        {!loading && overlayMessage && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4">
            <div className="flex flex-col items-center gap-2 rounded-md bg-muted px-4 py-8">
              <ChartCandlestick
                size={18}
                strokeWidth={1.5}
                className="text-muted-foreground"
                role="img"
                aria-label="No chart data"
              />
              <p className="m-0 text-center text-xs text-muted-foreground">{overlayMessage}</p>
            </div>
          </div>
        )}
        <div ref={containerRef} className="h-full w-full" />
        {drawingTools && (
          <div
            className={cn(
              "absolute inset-0 z-20",
              canDraw && activeTool !== "select" ? "cursor-crosshair" : "pointer-events-none",
            )}
            onPointerDown={handleDrawingPointerDown}
            onPointerMove={handleDrawingPointerMove}
            onPointerUp={handleDrawingPointerUp}
            onPointerCancel={() => setDraft(null)}
          >
            <svg className="h-full w-full overflow-visible">
              {drawings.map((d) => renderDrawing(d, d.id))}
              {draft && renderDrawing(draft, "draft")}
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
