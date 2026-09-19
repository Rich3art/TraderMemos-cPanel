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
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ItemActions, ItemGroup } from "@/components/Item";
import { Page } from "@/components/Page";
import { Pill } from "@/components/Pill";
import { ListSkeleton } from "@/components/skeletons/list-skeleton";
import { pnlColor } from "@/components/theme-tokens";
import { Button } from "@/components/ui/button";
import { setupsApi } from "@/lib/api/setups";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { BreakGroup, Setup } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { usePrivacyMode } from "@/lib/displayPrefs";
import { fmtPct, fmtSignedMoney } from "@/lib/format";
import { useMoneyFx } from "@/lib/hooks/useMoneyFx";
import { useAuthedAttachmentUrls } from "@/lib/hooks/useAuthedAttachmentUrls";
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
  onDelete: (id: string) => Promise<void>;
}

type SortKey = "name" | "trades" | "winRate" | "pf" | "exp" | "pnl";
type SortDir = "asc" | "desc";

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

function SetupChartPreview({ setup }: { setup: Setup }) {
  const first = setup.attachments?.[0];
  const urls = useAuthedAttachmentUrls(
    first ? [first.id] : [],
    setupsApi.attachmentFileUrl,
  );
  const src = first ? urls.get(first.id) : undefined;

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
      <div className="absolute top-3 left-3 rounded-md border border-border bg-background/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground backdrop-blur">
        Setup
      </div>
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

  const playbookTabs = [
    { label: "Daily Review", count: null, active: false },
    { label: "Trading Notes", count: null, active: false },
    { label: "Session Plan", count: null, active: false },
    { label: "Setup Library", count: setups.length, active: true },
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
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={tab.active}
            disabled={!tab.active}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-[12px] font-medium transition-colors",
              tab.active
                ? "border-border bg-surface text-foreground shadow-sm"
                : "border-transparent text-muted-foreground opacity-70",
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
      {setupLibraryHeader}
      {renderContent()}
    </Page>
  );
}
