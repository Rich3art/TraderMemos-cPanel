import {
  BookOpen,
  Check,
  CalendarDays,
  Eye,
  EyeOff,
  ImageIcon,
  ListFilter,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ItemActions, ItemGroup } from "@/components/Item";
import { Page } from "@/components/Page";
import { Pill } from "@/components/Pill";
import { RichTextEditor } from "@/components/RichTextEditor";
import { ListSkeleton } from "@/components/skeletons/list-skeleton";
import { pnlColor } from "@/components/theme-tokens";
import { Button } from "@/components/ui/button";
import { chartAnnotationsApi } from "@/lib/api/chartAnnotations";
import { setupsApi } from "@/lib/api/setups";
import type { BarInterval } from "@/lib/api/market";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { BreakGroup, Setup, Trade } from "@/lib/api/types";
import type { ChartDrawing } from "@/components/charts/TradeChart";
import { cn } from "@/lib/cn";
import { usePrivacyMode } from "@/lib/displayPrefs";
import { fmtPct, fmtSignedMoney } from "@/lib/format";
import { useMoneyFx } from "@/lib/hooks/useMoneyFx";
import { useAuthedAttachmentUrls } from "@/lib/hooks/useAuthedAttachmentUrls";
import { useCreateNote, useNotes, useUpdateNote } from "@/lib/hooks/useNotes";
import { useTrades } from "@/lib/hooks/useTrades";
import { intlLocale } from "@/lib/locale";
import { useUI, type SetupDraft } from "@/lib/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlaybookViewProps {
  setups: Setup[];
  setupsLoading: boolean;
  setupsError: boolean;
  breakdown: BreakGroup[];
  breakdownLoading: boolean;
  currency: string;
  initialTab?: PlaybookTab;
  initialDate?: string;
  onDelete: (id: string) => Promise<void>;
}

type SortKey = "name" | "trades" | "winRate" | "pf" | "exp" | "pnl";
type SortDir = "asc" | "desc";
type PlaybookTab = "daily-review" | "trading-notes" | "session-plan" | "setup-library";

interface SetupRowModel {
  setup: Setup;
  group?: BreakGroup;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  pf: number;
  exp: number;
  hasData: boolean;
}

const METRIC_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "trades", label: "Trades" },
  { key: "winRate", label: "Win rate" },
  { key: "pf", label: "Profit factor" },
  { key: "exp", label: "Expectancy" },
  { key: "pnl", label: "Net P&L" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  ...METRIC_COLUMNS,
];

const SESSION_CHECKLIST = [
  "Reviewed economic calendar",
  "Defined key levels",
  "Confirmed setup rules",
  "Risk limits checked",
  "Execution alerts ready",
];
const SETUP_CHART_INTERVAL: BarInterval = "240";

type PreviewPoint = { time: number; price: number };

/** Metric sorts read best high-to-low; names read A→Z. */
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  trades: "desc",
  winRate: "desc",
  pf: "desc",
  exp: "desc",
  pnl: "desc",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSetupDraft(setup: Setup): SetupDraft {
  return {
    id: setup.id,
    name: setup.name,
    thesis: setup.thesis || setup.description || "",
    symbol: setup.symbol || "",
    direction:
      setup.direction === "short"
        ? "short"
        : setup.direction === "long"
          ? "long"
          : "unknown",
    target: setup.target_price != null ? String(setup.target_price) : "",
    stop: setup.stop_price != null ? String(setup.stop_price) : "",
    checklistText: (setup.checklist ?? []).join("\n"),
    attachments: setup.attachments ?? [],
  };
}

function buildRows(setups: Setup[], breakdown: BreakGroup[]): SetupRowModel[] {
  const summaries = new Map(breakdown.map((g) => [g.key, g.summary]));
  const groups = new Map(breakdown.map((g) => [g.key, g]));
  return setups.map((setup) => {
    const sum = summaries.get(setup.name);
    const trades = sum?.total_trades ?? 0;
    return {
      setup,
      group: groups.get(setup.name),
      trades,
      wins: sum?.wins ?? 0,
      losses: sum?.losses ?? 0,
      winRate: sum?.win_rate ?? 0,
      netPnl: sum?.net_pnl ?? 0,
      pf: sum?.profit_factor ?? 0,
      exp: sum?.expectancy ?? 0,
      hasData: trades > 0,
    };
  });
}

const SORT_VALUE: Record<SortKey, (row: SetupRowModel) => number | string> = {
  name: (r) => r.setup.name.toLowerCase(),
  trades: (r) => r.trades,
  winRate: (r) => r.winRate,
  pf: (r) => r.pf,
  exp: (r) => r.exp,
  pnl: (r) => r.netPnl,
};

function sortRows(rows: SetupRowModel[], key: SortKey, dir: SortDir): SetupRowModel[] {
  const read = SORT_VALUE[key];
  return [...rows].sort((a, b) => {
    const av = read(a);
    const bv = read(b);
    const primary = typeof av === "string" ? av.localeCompare(bv as string) : av - (bv as number);
    if (primary !== 0) return dir === "asc" ? primary : -primary;
    return a.setup.name.localeCompare(b.setup.name);
  });
}

/** Levels and checklist size — the plan detail worth showing when space allows. */
function planBits(setup: Setup): string[] {
  const checks = setup.checklist ?? [];
  return [
    setup.target_price != null ? `T ${setup.target_price}` : null,
    setup.stop_price != null ? `S ${setup.stop_price}` : null,
    checks.length > 0 ? `${checks.length} check${checks.length === 1 ? "" : "s"}` : null,
  ].filter((bit): bit is string => bit != null);
}

function setupSubline(setup: Setup): string {
  return setup.thesis || setup.description || planBits(setup).join(" · ");
}

function formatSetupDate(setup: Setup): string {
  const date = new Date(setup.created_at);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function todayInputDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function dayBounds(date: string): { from: string; to: string } {
  return { from: date, to: date };
}

function sameDatePrefix(value: string | null | undefined, date: string): boolean {
  return Boolean(value && value.slice(0, 10) === date);
}

function tradeIsForDate(trade: Trade, date: string): boolean {
  return sameDatePrefix(trade.closed_at, date) || sameDatePrefix(trade.opened_at, date);
}

function planSetupList(body: string): string[] {
  const match = body.match(/<!-- planned-setups:([\s\S]*?) -->/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function stripPlanMeta(body: string): string {
  return body.replace(/\n?\s*<!-- planned-setups:[\s\S]*? -->\s*/g, "").trim();
}

function withPlanMeta(body: string, setupIds: string[]): string {
  const clean = stripPlanMeta(body);
  const meta = `<!-- planned-setups:${JSON.stringify(setupIds)} -->`;
  return clean ? `${clean}\n\n${meta}` : meta;
}

function SessionPlanTab({
  setups,
  currency,
  fxRate,
  initialDate,
}: {
  setups: Setup[];
  currency: string;
  fxRate: number;
  initialDate?: string;
}) {
  const locale = intlLocale();
  const [date, setDate] = useState(initialDate || todayInputDate);
  const [body, setBody] = useState("");
  const [selectedSetups, setSelectedSetups] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [dirty, setDirty] = useState(false);
  const notesQ = useNotes(dayBounds(date));
  const tradesQ = useTrades(dayBounds(date));
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();

  const plan = useMemo(
    () => (notesQ.data ?? []).find((note) => note.type === "session_plan"),
    [notesQ.data],
  );
  const trades = useMemo(
    () => (tradesQ.data ?? []).filter((trade) => tradeIsForDate(trade, date)),
    [tradesQ.data, date],
  );
  const planned = useMemo(
    () => setups.filter((setup) => selectedSetups.includes(setup.id)),
    [setups, selectedSetups],
  );
  const symbols = useMemo(() => {
    const values = new Set<string>();
    for (const setup of setups) {
      if (setup.symbol) values.add(setup.symbol.toUpperCase());
    }
    for (const trade of trades) {
      if (trade.symbol) values.add(trade.symbol.toUpperCase());
    }
    return [...values].sort();
  }, [setups, trades]);

  useEffect(() => {
    if (initialDate) setDate(initialDate);
  }, [initialDate]);

  useEffect(() => {
    if (!plan) {
      setBody("");
      setSelectedSetups([]);
      setDirty(false);
      return;
    }
    setBody(stripPlanMeta(plan.body));
    setSelectedSetups(planSetupList(plan.body));
    setDirty(false);
  }, [plan?.id, plan?.body, date]);

  useEffect(() => {
    if (!selectedSymbol && symbols.length > 0) setSelectedSymbol(symbols[0]);
  }, [selectedSymbol, symbols]);

  const stats = useMemo(() => {
    const closed = trades.filter((trade) => trade.net_pnl != null);
    const wins = closed.filter((trade) => (trade.net_pnl ?? 0) > 0).length;
    const net = closed.reduce((sum, trade) => sum + (trade.net_pnl ?? 0), 0);
    return {
      trades: closed.length,
      wins,
      winRate: closed.length > 0 ? wins / closed.length : 0,
      net,
    };
  }, [trades]);

  const toggleSetup = (id: string) => {
    setSelectedSetups((cur) =>
      cur.includes(id) ? cur.filter((value) => value !== id) : [...cur, id],
    );
    setDirty(true);
  };

  const save = async () => {
    const payload = {
      type: "session_plan" as const,
      occurred_at: date,
      title: `Session plan ${date}`,
      body: withPlanMeta(body, selectedSetups),
      symbols: [],
    };
    if (plan) {
      await updateNote.mutateAsync({ id: plan.id, body: payload });
    } else {
      await createNote.mutateAsync(payload);
    }
    setDirty(false);
  };

  const saving = createNote.isPending || updateNote.isPending;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,0.9fr)]">
      <div className="space-y-4">
        <Card className="space-y-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Session date
          </label>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="h-9 rounded-md border border-border bg-muted px-3 text-sm text-foreground outline-none focus-visible:outline-2 focus-visible:outline-ring"
          />
        </Card>

        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                Chart
              </h3>
              <p className="text-[11px] text-muted-foreground">Plan the instrument you want to focus on.</p>
            </div>
            <div className="flex items-center gap-2">
              <NativeSelect
                size="sm"
                value={selectedSymbol}
                onChange={(event) => setSelectedSymbol(event.target.value)}
                aria-label="Session plan symbol"
                className="min-w-[9rem]"
              >
                {symbols.length === 0 ? (
                  <NativeSelectOption value="">No symbols</NativeSelectOption>
                ) : (
                  symbols.map((symbol) => (
                    <NativeSelectOption key={symbol} value={symbol}>
                      {symbol}
                    </NativeSelectOption>
                  ))
                )}
              </NativeSelect>
              <Button type="button" size="sm" variant="outline">
                Load
              </Button>
            </div>
          </div>
          <div className="flex aspect-[16/7] min-h-[14rem] items-center justify-center rounded-md border border-border bg-background text-sm text-muted-foreground">
            {selectedSymbol ? `${selectedSymbol} planning chart` : "Choose a symbol to load a chart"}
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                Game plan
              </h3>
              <p className="text-[11px] text-muted-foreground">Write the plan before the session starts.</p>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {dirty ? "Unsaved changes" : "No changes"}
            </span>
          </div>
          <RichTextEditor
            key={plan?.id ?? `new-${date}`}
            value={body}
            onChange={(value) => {
              setBody(value);
              setDirty(true);
            }}
            placeholder="Bias, key levels, invalidation, execution rules..."
            minHeight={180}
            showTemplates
          />
          <Button type="button" onClick={save} disabled={saving || (!dirty && Boolean(plan))}>
            <Save size={14} strokeWidth={1.75} />
            {saving ? "Saving..." : "Save session plan"}
          </Button>
        </Card>

        <Card className="space-y-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Planned setups
          </h3>
          <div className="flex flex-wrap gap-2">
            {setups.length === 0 ? (
              <span className="text-sm text-muted-foreground">No setups in the library yet.</span>
            ) : (
              setups.map((setup) => (
                <button
                  key={setup.id}
                  type="button"
                  onClick={() => toggleSetup(setup.id)}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-[12px] transition-colors",
                    selectedSetups.includes(setup.id)
                      ? "border-ring bg-ring/10 text-foreground"
                      : "border-border bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {setup.name}
                </button>
              ))
            )}
          </div>
        </Card>

        <Card className="space-y-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Pre-session checklist
          </h3>
          <div className="space-y-2">
            {SESSION_CHECKLIST.map((item) => (
              <label key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" className="size-4 rounded border-border bg-muted" />
                {item}
              </label>
            ))}
          </div>
        </Card>
      </div>

      <aside className="space-y-4">
        <Card className="space-y-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            That day's execution
          </h3>
          <div className="space-y-3">
            <SummaryStat label="Trades" value={String(stats.trades)} />
            <SummaryStat label="Win rate" value={fmtPct(stats.winRate, locale)} />
            <SummaryStat
              label="Net P&L"
              value={fmtSignedMoney(stats.net * fxRate, currency, locale)}
              valueClass={pnlColor(stats.net)}
            />
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Plan adherence
            </p>
            {planned.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {planned.map((setup) => (
                  <Pill key={setup.id}>{setup.name}</Pill>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No setups selected.</p>
            )}
          </div>
        </Card>
        <Card className="space-y-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Trading notes
          </h3>
          {plan ? (
            <p className="line-clamp-6 whitespace-pre-wrap text-sm text-muted-foreground">
              {stripPlanMeta(plan.body) || "No notes yet."}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No session plan saved for this day.</p>
          )}
        </Card>
      </aside>
    </div>
  );
}

function PlayExamples({ setup, compact = false }: { setup: Setup; compact?: boolean }) {
  const attachments = setup.attachments ?? [];
  const preview = attachments.slice(0, compact ? 2 : 3);
  const urls = useAuthedAttachmentUrls(
    preview.map((att) => att.id),
    setupsApi.attachmentFileUrl,
  );
  if (attachments.length === 0) return null;

  return (
    <div
      className={cn("mt-2 flex items-center gap-1.5", compact && "mt-1")}
                aria-label={`${attachments.length} setup example screenshot${attachments.length === 1 ? "" : "s"}`}
    >
      {preview.map((att) => {
        const src = urls.get(att.id);
        return (
          <span
            key={att.id}
            className={cn(
              "flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted",
              compact ? "size-7" : "size-10",
            )}
            title={att.filename}
          >
            {src ? (
              <img src={src} alt={att.filename} className="h-full w-full object-cover" />
            ) : (
              <ImageIcon size={compact ? 13 : 16} strokeWidth={1.5} aria-hidden />
            )}
          </span>
        );
      })}
      {attachments.length > preview.length ? (
        <span className="text-[11px] tabular-nums text-muted-foreground">
          +{attachments.length - preview.length}
        </span>
      ) : null}
    </div>
  );
}

function collectDrawingPoints(drawings: ChartDrawing[]): PreviewPoint[] {
  const points: PreviewPoint[] = [];
  for (const drawing of drawings) {
    if (drawing.type === "horizontal") {
      points.push({ time: 0, price: drawing.price });
    } else if (drawing.type === "vertical") {
      points.push({ time: drawing.time, price: 0 });
    } else {
      points.push(drawing.from, drawing.to);
    }
  }
  return points;
}

function annotationPreviewBounds(drawings: ChartDrawing[]) {
  const points = collectDrawingPoints(drawings);
  const times = points.map((p) => p.time).filter((v) => Number.isFinite(v));
  const prices = points.map((p) => p.price).filter((v) => Number.isFinite(v));
  const minTime = Math.min(...times, 0);
  const maxTime = Math.max(...times, 1);
  const minPrice = Math.min(...prices, 0);
  const maxPrice = Math.max(...prices, 1);
  return {
    minTime,
    maxTime: maxTime === minTime ? minTime + 1 : maxTime,
    minPrice,
    maxPrice: maxPrice === minPrice ? minPrice + 1 : maxPrice,
  };
}

function AnnotationPreviewOverlay({ drawings }: { drawings: ChartDrawing[] }) {
  const markerId = useMemo(
    () => `setup-preview-arrow-${drawings[0]?.id.replace(/[^a-zA-Z0-9_-]/g, "") ?? "empty"}`,
    [drawings],
  );
  if (drawings.length === 0) return null;
  const bounds = annotationPreviewBounds(drawings);
  const x = (time: number) => 28 + ((time - bounds.minTime) / (bounds.maxTime - bounds.minTime)) * 344;
  const y = (price: number) => 156 - ((price - bounds.minPrice) / (bounds.maxPrice - bounds.minPrice)) * 132;
  const lineColor = "rgb(56, 189, 248)";

  return (
    <svg viewBox="0 0 400 180" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 z" fill={lineColor} />
        </marker>
      </defs>
      {drawings.slice(0, 12).map((drawing) => {
        if (drawing.type === "horizontal") {
          const yy = y(drawing.price);
          return <line key={drawing.id} x1="16" x2="384" y1={yy} y2={yy} stroke={lineColor} strokeWidth="2" />;
        }
        if (drawing.type === "vertical") {
          const xx = x(drawing.time);
          return <line key={drawing.id} x1={xx} x2={xx} y1="16" y2="164" stroke={lineColor} strokeWidth="2" />;
        }
        const x1 = x(drawing.from.time);
        const y1 = y(drawing.from.price);
        const x2 = x(drawing.to.time);
        const y2 = y(drawing.to.price);
        if (drawing.type === "rectangle") {
          return (
            <rect
              key={drawing.id}
              x={Math.min(x1, x2)}
              y={Math.min(y1, y2)}
              width={Math.abs(x2 - x1)}
              height={Math.abs(y2 - y1)}
              fill="rgba(56, 189, 248, 0.14)"
              stroke={lineColor}
              strokeWidth="2"
            />
          );
        }
        if (drawing.type === "curved-arrow") {
          const cx = (x1 + x2) / 2;
          const cy = Math.min(y1, y2) - 22;
          return (
            <path
              key={drawing.id}
              d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
              fill="none"
              stroke={lineColor}
              strokeWidth="2"
              markerEnd={`url(#${markerId})`}
            />
          );
        }
        if (drawing.type === "fib-projection") {
          const projection = drawing.to.price - drawing.from.price;
          return (
            <g key={drawing.id}>
              {[0, 0.618, 1, 1.272, 1.618].map((level) => {
                const yy = y(drawing.to.price + projection * level);
                return (
                  <line
                    key={level}
                    x1="16"
                    x2="384"
                    y1={yy}
                    y2={yy}
                    stroke={lineColor}
                    strokeWidth="1.5"
                    strokeOpacity={level === 0 || level === 1 ? 0.95 : 0.65}
                  />
                );
              })}
            </g>
          );
        }
        return (
          <line
            key={drawing.id}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={lineColor}
            strokeWidth="2"
            markerEnd={drawing.type === "arrow" ? `url(#${markerId})` : undefined}
          />
        );
      })}
    </svg>
  );
}

function SetupChartPreview({ setup }: { setup: Setup }) {
  const first = setup.attachments?.[0];
  const urls = useAuthedAttachmentUrls(
    first ? [first.id] : [],
    setupsApi.attachmentFileUrl,
  );
  const src = first ? urls.get(first.id) : undefined;
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!setup.symbol) {
      setDrawings([]);
      return;
    }
    chartAnnotationsApi
      .get<ChartDrawing>(
        { entityType: "setup", entityId: setup.id },
        setup.symbol,
        SETUP_CHART_INTERVAL,
      )
      .then((record) => {
        const savedDrawings = Array.isArray(record.drawings) ? record.drawings : [];
        if (!cancelled && savedDrawings.length > 0) setDrawings(savedDrawings);
      });
    return () => {
      cancelled = true;
    };
  }, [setup.id, setup.symbol]);

  return (
    <div className="relative aspect-[16/9] overflow-hidden rounded-t-lg border-b border-border bg-muted">
      {src ? (
        <img src={src} alt={first?.filename ?? setup.name} className="h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:14.28%_20%] opacity-45" />
      )}
      {!src ? (
        <svg
          viewBox="0 0 400 180"
          className="absolute inset-0 h-full w-full text-primary/75"
          preserveAspectRatio="none"
          aria-hidden
        >
          <polyline
            points="0,95 34,86 70,110 104,62 138,75 174,42 212,96 246,83 282,120 318,101 356,132 400,118"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <line x1="0" y1="118" x2="400" y2="118" stroke="currentColor" strokeDasharray="3 3" opacity="0.45" />
        </svg>
      ) : null}
      <AnnotationPreviewOverlay drawings={drawings} />
      <div className="absolute top-3 left-3 rounded-md border border-border bg-background/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground backdrop-blur">
        Setup
      </div>
      {drawings.length > 0 ? (
        <div className="absolute right-3 bottom-3 rounded-md border border-primary/35 bg-background/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary backdrop-blur">
          {drawings.length} annotation{drawings.length === 1 ? "" : "s"}
        </div>
      ) : null}
    </div>
  );
}

function formatR(value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}R`;
}

function sampleLabel(trades: number): string {
  if (trades >= 30) return "Reliable sample";
  if (trades >= 10) return "Building sample";
  return "Small sample";
}

function performanceScore(row: SetupRowModel): number {
  const r = row.group?.r_summary;
  const sample = Math.min(row.trades / 20, 1);
  const pf = Math.min(row.pf || 0, 5) / 5;
  const expectancy = Math.tanh(row.exp / 100);
  const avgR = r ? Math.tanh(r.avg_r) : 0;
  const drawdownPenalty = row.group?.max_drawdown ? Math.min(row.group.max_drawdown / 1000, 1) : 0;
  return sample * (row.winRate * 0.2 + pf * 0.25 + expectancy * 0.25 + avgR * 0.3) - drawdownPenalty * 0.15;
}

function pickBest(
  rows: SetupRowModel[],
  read: (row: SetupRowModel) => number | undefined,
): SetupRowModel | null {
  return rows.reduce<SetupRowModel | null>((best, row) => {
    const value = read(row);
    if (value == null || Number.isNaN(value)) return best;
    if (best == null) return row;
    const bestValue = read(best);
    return bestValue == null || value > bestValue ? row : best;
  }, null);
}

// ---------------------------------------------------------------------------
// Row pieces
// ---------------------------------------------------------------------------

interface RowActions {
  onEdit: (setup: Setup) => void;
  onDelete: (setup: Setup) => void;
  onConvert: (setup: Setup) => void;
}

interface SetupActionsProps extends RowActions {
  setup: Setup;
}

/**
 * Trade, edit and delete stay visible on every setup. Delete swaps in a compact
 * ✓/✕ confirm in place so the cluster keeps its width. Renders bare buttons —
 * the caller supplies the container (`ItemActions` on chips, the grid's last
 * column on traded rows).
 */
function SetupActions({ setup, onEdit, onDelete, onConvert }: SetupActionsProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        aria-label={`Log trade from ${setup.name}`}
        onClick={() => onConvert(setup)}
        className="text-muted-foreground hover:text-foreground"
      >
        Trade
      </Button>
      {confirmDelete ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Confirm delete ${setup.name}`}
            onClick={() => {
              setConfirmDelete(false);
              onDelete(setup);
            }}
            className="text-destructive hover:text-destructive"
          >
            <Check size={13} strokeWidth={2} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Cancel delete"
            onClick={() => setConfirmDelete(false)}
            className="text-muted-foreground"
          >
            <X size={13} strokeWidth={2} />
          </Button>
        </>
      ) : (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Edit ${setup.name}`}
            onClick={() => onEdit(setup)}
            className="text-muted-foreground hover:text-primary"
          >
            <Pencil size={13} strokeWidth={1.5} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Delete ${setup.name}`}
            onClick={() => setConfirmDelete(true)}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 size={13} strokeWidth={1.5} />
          </Button>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

interface PlayRowProps extends RowActions {
  row: SetupRowModel;
  currency: string;
  fxRate: number;
}

function SetupLibraryCard({
  row,
  currency,
  fxRate,
  rangeStatus,
  ...actions
}: PlayRowProps & { rangeStatus: "traded" | "unused" }) {
  const locale = intlLocale();
  const { setup, trades, winRate, netPnl, pf } = row;
  const subline = setupSubline(setup);
  const money = (v: number) => fmtSignedMoney(v * fxRate, currency, locale);
  const directionLabel =
    setup.direction === "short" ? "SHORT" : setup.direction === "long" ? "LONG" : "?";
  const date = formatSetupDate(setup);
  const entryValidation = setup.thesis || setup.description || "No entry validation saved.";
  const exitValidation =
    planBits(setup).join(" · ") || "No exit or invalidation notes saved.";
  const notes = setup.checklist?.length
    ? setup.checklist.join(" · ")
    : trades > 0
      ? `${trades} trade${trades === 1 ? "" : "s"} in this range · ${fmtPct(winRate, locale)} WR`
      : "No notes saved yet.";

  return (
    <div
      role="listitem"
      onClick={(e) => {
        // Whole-row click opens the editor; inner buttons keep their own actions.
        if ((e.target as HTMLElement).closest("button")) return;
        actions.onEdit(setup);
      }}
      className={cn(
        "group/setup flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-lg border border-border bg-card",
        "transition-[border-color,background-color,transform] duration-150 hover:border-primary/40 hover:bg-accent/30 motion-reduce:transition-none",
      )}
    >
      <SetupChartPreview setup={setup} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => actions.onEdit(setup)}
                className={cn(
                  "cursor-pointer truncate rounded-sm text-left text-[15px] font-semibold tracking-tight text-foreground",
                  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                {setup.name}
              </button>
              <Pill tone={rangeStatus === "traded" ? "pos" : "accent"} className="px-1.5 py-0 text-[10px]">
                {rangeStatus === "traded" ? "Traded" : "Not traded"}
              </Pill>
            </div>
            {date ? (
              <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <CalendarDays size={12} strokeWidth={1.75} aria-hidden />
                {date}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {setup.symbol ? (
              <Pill tone="accent" className="px-1.5 py-0 text-[10px]">
                {setup.symbol}
              </Pill>
            ) : null}
            <Pill tone="muted" className="px-1.5 py-0 text-[10px]">
              {directionLabel}
            </Pill>
          </div>
        </div>

        <div className="grid gap-3 text-[12px] leading-relaxed">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Entry triggers
            </div>
            <p className="line-clamp-2 text-foreground">{entryValidation}</p>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Exit & invalidation
            </div>
            <p className="line-clamp-2 text-foreground">{exitValidation}</p>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Notes
            </div>
            <p className="line-clamp-2 text-muted-foreground">{notes}</p>
          </div>
        </div>

        {subline ? <PlayExamples setup={setup} compact /> : null}

        {rangeStatus === "traded" ? (
          <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-[11px] tabular-nums text-muted-foreground sm:grid-cols-4">
            <span>{trades} trade{trades === 1 ? "" : "s"}</span>
            <span>{fmtPct(winRate, locale)} WR</span>
            <span>PF {pf > 0 ? pf.toFixed(2) : "—"}</span>
            <span className={cn("font-semibold", pnlColor(netPnl))}>{money(netPnl)}</span>
          </div>
        ) : null}
      </div>

      <ItemActions className="border-t border-border px-3 py-2">
        <SetupActions setup={setup} {...actions} />
      </ItemActions>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header pieces
// ---------------------------------------------------------------------------

function SummaryStat({
  label,
  value,
  valueClass,
  sub,
}: {
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </span>
      <span
        className={cn(
          "truncate text-[17px] leading-none font-semibold tracking-tight tabular-nums text-foreground",
          valueClass,
        )}
      >
        {value}
      </span>
      {sub ? <span className="truncate text-[11px] text-muted-foreground">{sub}</span> : null}
    </div>
  );
}

function PerformanceStat({
  label,
  row,
  value,
  sub,
  valueClass,
}: {
  label: string;
  row: SetupRowModel | null;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-card px-3 py-3">
      <span className="text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </span>
      <div className="mt-2 flex min-w-0 items-baseline justify-between gap-3">
        <span className="truncate text-[13px] font-semibold text-foreground">
          {row?.setup.name ?? "—"}
        </span>
        <span className={cn("shrink-0 text-[13px] font-semibold tabular-nums", valueClass)}>
          {value}
        </span>
      </div>
      {sub ? <p className="mt-1 truncate text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function PlaybookPerformancePanel({
  rows,
  currency,
  fxRate,
}: {
  rows: SetupRowModel[];
  currency: string;
  fxRate: number;
}) {
  const locale = intlLocale();
  const money = (v: number) => fmtSignedMoney(v * fxRate, currency, locale);
  const ranked = [...rows].sort((a, b) => performanceScore(b) - performanceScore(a));
  const bestOverall = ranked[0] ?? null;
  const mostProfitable = pickBest(rows, (row) => row.netPnl);
  const bestExpectancy = pickBest(rows, (row) => row.exp);
  const bestR = pickBest(rows, (row) => row.group?.r_summary?.avg_r);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
            Setup Library performance
          </h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Ranking combines profitability, expectancy, R stats, drawdown, and sample size.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PerformanceStat
          label="Best performer"
          row={bestOverall}
          value={bestOverall ? `${Math.round(performanceScore(bestOverall) * 100)}` : "—"}
          sub={bestOverall ? sampleLabel(bestOverall.trades) : undefined}
        />
        <PerformanceStat
          label="Most profitable"
          row={mostProfitable}
          value={mostProfitable ? money(mostProfitable.netPnl) : "—"}
          valueClass={mostProfitable ? pnlColor(mostProfitable.netPnl) : undefined}
          sub={mostProfitable ? `${mostProfitable.trades} trades` : undefined}
        />
        <PerformanceStat
          label="Best expectancy"
          row={bestExpectancy}
          value={bestExpectancy ? money(bestExpectancy.exp) : "—"}
          valueClass={bestExpectancy ? pnlColor(bestExpectancy.exp) : undefined}
          sub={bestExpectancy ? `${fmtPct(bestExpectancy.winRate, locale)} win rate` : undefined}
        />
        <PerformanceStat
          label="Best average R"
          row={bestR}
          value={bestR ? formatR(bestR.group?.r_summary?.avg_r) : "—"}
          valueClass={bestR ? pnlColor(bestR.group?.r_summary?.avg_r ?? 0) : undefined}
          sub={bestR ? `${bestR.group?.r_summary?.excluded ?? 0} trades missing risk` : undefined}
        />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[46rem] text-left text-[12px]">
          <thead className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
            <tr className="border-b border-border">
              <th className="py-2 pr-3 font-medium">Setup</th>
              <th className="px-3 py-2 text-right font-medium">Sample</th>
              <th className="px-3 py-2 text-right font-medium">Avg R</th>
              <th className="px-3 py-2 text-right font-medium">Total R</th>
              <th className="px-3 py-2 text-right font-medium">Avg win</th>
              <th className="px-3 py-2 text-right font-medium">Avg loss</th>
              <th className="px-3 py-2 text-right font-medium">Drawdown</th>
              <th className="py-2 pl-3 text-right font-medium">Missing risk</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((row) => {
              const r = row.group?.r_summary;
              const drawdown = row.group?.max_drawdown ?? 0;
              return (
                <tr key={row.setup.id} className="border-b border-border/70 last:border-0">
                  <td className="py-2 pr-3 font-medium text-foreground">{row.setup.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {sampleLabel(row.trades)}
                  </td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", pnlColor(r?.avg_r ?? 0))}>
                    {formatR(r?.avg_r)}
                  </td>
                  <td
                    className={cn("px-3 py-2 text-right tabular-nums", pnlColor(r?.net_pnl ?? 0))}
                  >
                    {formatR(r?.net_pnl)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-profit">
                    {money(row.group?.summary.avg_win ?? 0)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-destructive">
                    {money(-(row.group?.summary.avg_loss ?? 0))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {fmtSignedMoney(-drawdown * fxRate, currency, locale)}
                  </td>
                  <td className="py-2 pl-3 text-right tabular-nums text-muted-foreground">
                    {r?.excluded ?? row.trades}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function PlaybookView({
  setups,
  setupsLoading,
  setupsError,
  breakdown,
  currency,
  initialTab = "setup-library",
  initialDate,
  onDelete,
}: PlaybookViewProps) {
  usePrivacyMode();
  const locale = intlLocale();
  const { currency: displayCurrency, rate } = useMoneyFx(currency);
  const fxRate = rate ?? 1;
  const openModal = useUI((s) => s.openModal);
  const openSetupEdit = useUI((s) => s.openSetupEdit);
  const openTradeFromSetup = useUI((s) => s.openTradeFromSetup);
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState<SortDir>("asc");
  const [hideUnused, setHideUnused] = useState(false);
  const [activeTab, setActiveTab] = useState<PlaybookTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const rows = useMemo(() => buildRows(setups, breakdown), [setups, breakdown]);
  const traded = useMemo(
    () =>
      sortRows(
        rows.filter((r) => r.hasData),
        sort,
        dir,
      ),
    [rows, sort, dir],
  );
  const unused = useMemo(
    () =>
      sortRows(
        rows.filter((r) => !r.hasData),
        "name",
        "asc",
      ),
    [rows],
  );

  const totals = useMemo(() => {
    const trades = traded.reduce((n, r) => n + r.trades, 0);
    const wins = traded.reduce((n, r) => n + r.wins, 0);
    const netPnl = traded.reduce((n, r) => n + r.netPnl, 0);
    const best = traded.reduce<SetupRowModel | null>(
      (top, r) => (top == null || r.netPnl > top.netPnl ? r : top),
      null,
    );
    return { trades, wins, netPnl, winRate: trades > 0 ? wins / trades : 0, best };
  }, [traded]);

  function convertSetup(setup: Setup) {
    let side: "long" | "short" | undefined =
      setup.direction === "short" ? "short" : setup.direction === "long" ? "long" : undefined;
    if (!side) {
      const answer = window.prompt(
        `Choose direction for "${setup.name}" before creating the trade: long or short`,
        "",
      );
      const normalized = answer?.trim().toLowerCase();
      if (normalized !== "long" && normalized !== "short") return;
      side = normalized;
    }
    openTradeFromSetup({
      setupId: setup.id,
      symbol: setup.symbol || undefined,
      side,
      target: setup.target_price != null ? String(setup.target_price) : undefined,
      stop: setup.stop_price != null ? String(setup.stop_price) : undefined,
      notes: setup.thesis || setup.description || undefined,
    });
  }

  const rowActions = {
    onEdit: (s: Setup) => openSetupEdit(toSetupDraft(s)),
    onConvert: convertSetup,
    onDelete: async (s: Setup) => {
      await onDelete(s.id);
    },
  };

  const subtitle = () => {
    if (setups.length === 0) return "Define your setups once, then log trades straight from them.";
    const setupCount = `${setups.length} setup${setups.length === 1 ? "" : "s"}`;
    if (traded.length === 0) return `${setupCount} · none traded in this range`;
    return `${setupCount} · ${traded.length} traded in this range`;
  };

  const playbookTabs: { id: PlaybookTab; label: string; count: number | null }[] = [
    { id: "daily-review", label: "Daily Review", count: null },
    { id: "trading-notes", label: "Trading Notes", count: null },
    { id: "session-plan", label: "Session Plan", count: null },
    { id: "setup-library", label: "Setup Library", count: setups.length },
  ];

  const playbookHeader = (
    <header className="border-b border-border pb-4">
      <div>
        <h1 className="text-[15px] font-semibold uppercase tracking-wide text-foreground">
          The Playbook
        </h1>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          Review your trading days and turn repeatable patterns into setups.
        </p>
      </div>
      <div
        role="tablist"
        aria-label="Playbook sections"
        className="mt-5 flex gap-2 overflow-x-auto pb-1"
      >
        {playbookTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-[12px] font-medium transition-colors",
              activeTab === tab.id
                ? "border-border bg-surface text-foreground shadow-sm"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.count != null ? (
              <span className="rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                {tab.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </header>
  );

  const setupLibraryHeader = (
    <section className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Setup Library</h2>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{subtitle()}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {traded.length > 0 ? (
          <span className="relative inline-flex items-center xl:hidden">
            <ListFilter
              size={14}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-2.5 z-10 text-muted-foreground"
              aria-hidden
            />
            <NativeSelect
              size="sm"
              aria-label="Sort setups"
              value={sort}
              onChange={(e) => {
                const key = e.target.value as SortKey;
                setSort(key);
                setDir(DEFAULT_DIR[key]);
              }}
              className="h-8 min-w-[8.25rem] pr-7 pl-8 text-[12px]"
            >
              {SORT_OPTIONS.map((opt) => (
                <NativeSelectOption key={opt.key} value={opt.key}>
                  {opt.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </span>
        ) : null}
        {unused.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setHideUnused((v) => !v)}
            aria-pressed={hideUnused}
            className={cn(
              "text-muted-foreground hover:text-foreground",
              hideUnused && "text-foreground",
            )}
          >
            {hideUnused ? (
              <Eye size={14} strokeWidth={1.75} />
            ) : (
              <EyeOff size={14} strokeWidth={1.75} />
            )}
            {hideUnused ? "Show unused" : "Hide unused"}
            <span className="tabular-nums opacity-70">{unused.length}</span>
          </Button>
        ) : null}
        <Button type="button" onClick={() => openModal("new-setup")}>
          <Plus size={14} strokeWidth={1.75} />
          New setup
        </Button>
      </div>
    </section>
  );

  const summaryCard = (
    <Card>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryStat
          label="Plays traded"
          value={`${traded.length}/${setups.length}`}
          sub={unused.length > 0 ? `${unused.length} idle` : "All setups in use"}
        />
        <SummaryStat label="Trades" value={String(totals.trades)} />
        <SummaryStat
          label="Win rate"
          value={fmtPct(totals.winRate, locale)}
          sub={`${totals.wins} of ${totals.trades} won`}
        />
        <SummaryStat
          label="Net"
          value={fmtSignedMoney(totals.netPnl * fxRate, currency, locale)}
          valueClass={pnlColor(totals.netPnl)}
        />
        {totals.best ? (
          <SummaryStat
            label="Top setup"
            value={totals.best.setup.name}
            valueClass="tracking-tight"
            sub={fmtSignedMoney(totals.best.netPnl * fxRate, currency, locale)}
          />
        ) : null}
      </div>
    </Card>
  );

  const tradedCard = (
    <Card flush className="pt-3 pb-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4">
        <h3 className="text-xs font-medium text-muted-foreground">Traded in this range</h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {traded.length} setup{traded.length === 1 ? "" : "s"}
        </span>
      </div>

      <ItemGroup className="mt-3 grid gap-4 px-4 sm:grid-cols-2 xl:grid-cols-3">
        {traded.map((row) => (
          <SetupLibraryCard
            key={row.setup.id}
            row={row}
            currency={displayCurrency}
            fxRate={fxRate}
            rangeStatus="traded"
            {...rowActions}
          />
        ))}
      </ItemGroup>
    </Card>
  );

  const unusedCard = (
    <Card flush className="pt-3 pb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4">
        <h3 className="text-xs font-medium text-muted-foreground">Not traded in this range</h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {unused.length} setup{unused.length === 1 ? "" : "s"}
        </span>
      </div>
      <ItemGroup className="mt-3 grid gap-4 px-4 sm:grid-cols-2 xl:grid-cols-3">
        {unused.map((row) => (
          <SetupLibraryCard
            key={row.setup.id}
            row={row}
            currency={displayCurrency}
            fxRate={fxRate}
            rangeStatus="unused"
            {...rowActions}
          />
        ))}
      </ItemGroup>
    </Card>
  );

  const renderContent = () => {
    if (setupsLoading) return <ListSkeleton rows={4} />;

    if (setupsError) {
      return <EmptyState title="Could not load setups" hint="Try refreshing the page." />;
    }

    if (setups.length === 0) {
      return (
        <EmptyState
          title="No setups yet"
          hint="Define your edge — thesis, levels, and checklist — then log trades from each setup."
          icon={<BookOpen size={28} strokeWidth={1.5} />}
          actions={
            <Button type="button" onClick={() => openModal("new-setup")}>
              <Plus size={14} strokeWidth={1.75} />
              New setup
            </Button>
          }
        />
      );
    }

    if (traded.length === 0 && hideUnused) {
      return (
        <EmptyState
          title="No traded setups"
          hint="Every setup is still unused in this date range. Log a trade or show unused setups."
          icon={<BookOpen size={28} strokeWidth={1.5} />}
          actions={
            <Button type="button" variant="outline" onClick={() => setHideUnused(false)}>
              Show unused
            </Button>
          }
        />
      );
    }

    return (
      <>
        {traded.length > 0 ? summaryCard : null}
        {traded.length > 0 ? (
          <PlaybookPerformancePanel rows={traded} currency={displayCurrency} fxRate={fxRate} />
        ) : null}
        {traded.length > 0 ? tradedCard : null}
        {unused.length > 0 && !hideUnused ? unusedCard : null}
      </>
    );
  };

  return (
    <Page>
      {playbookHeader}
      {activeTab === "session-plan" ? (
        <SessionPlanTab
          setups={setups}
          currency={displayCurrency}
          fxRate={fxRate}
          initialDate={initialDate}
        />
      ) : activeTab === "setup-library" ? (
        <>
          {setupLibraryHeader}
          {renderContent()}
        </>
      ) : (
        <EmptyState
          title="Coming next"
          hint="This Playbook section is reserved for the next workflow task."
          icon={<BookOpen size={28} strokeWidth={1.5} />}
        />
      )}
    </Page>
  );
}
