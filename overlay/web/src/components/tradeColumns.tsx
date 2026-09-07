import type { ColumnDef, ColumnPinningState } from "@/lib/table";
import type { Trade } from "@/lib/api/types";
import type { ConvertMoney } from "@/lib/currencyConversion";
import { usePrivacyMode } from "@/lib/displayPrefs";
import { fmtDateTime, fmtDuration, fmtMoney, fmtSignedMoney, fmtTradeDay } from "@/lib/format";
import { intlLocale } from "@/lib/locale";
import { resolveTradeDirection } from "@/lib/tradeDirection";
import { DirCell } from "./DirCell";
import { Pill, type PillTone } from "./Pill";
import { pnlColor } from "./theme-tokens";
import { TradeRowMenu, type TradeRowActions } from "./TradeRowMenu";

export type { TradeRowActions };

const MARKET_LABELS: Record<string, string> = {
  stock: "STK",
  etf: "ETF",
  commodity: "COM",
  cfd: "CFD",
  option: "OPT",
  crypto: "CRY",
  future: "FUT",
  futures: "FUT",
  forex: "FX",
};

const MARKET_TITLES: Record<string, string> = {
  stock: "Stock",
  etf: "ETF",
  commodity: "Commodities",
  cfd: "CFD",
  option: "Option",
  crypto: "Crypto",
  future: "Futures",
  futures: "Futures",
  forex: "Forex",
};

export function marketLabel(instrumentType: string): string {
  return MARKET_LABELS[instrumentType] ?? instrumentType.slice(0, 3).toUpperCase();
}

/** Conventional contract size when Trade list payloads omit fill multipliers. */
export function tradeNotionalMultiplier(instrumentType: string): number {
  return instrumentType === "option" ? 100 : 1;
}

export function tradeNotional(qty: number, price: number, instrumentType: string): number {
  return qty * price * tradeNotionalMultiplier(instrumentType);
}

function usesPriceTotal(instrumentType: string): boolean {
  return instrumentType === "forex" || instrumentType === "crypto" || instrumentType === "cfd";
}

export function tradeStatus(t: Trade): {
  label: "WIN" | "LOSS" | "OPEN" | "BE";
  tone: PillTone;
} {
  if (t.status === "open") return { label: "OPEN", tone: "accent" };
  if (t.net_pnl != null && t.net_pnl > 0) return { label: "WIN", tone: "pos" };
  if (t.net_pnl != null && t.net_pnl < 0) return { label: "LOSS", tone: "neg" };
  return { label: "BE", tone: "muted" };
}

/** Net P&L ÷ planned risk when journal initial_risk is set. */
export function tradeRMultiple(t: Trade): number | null {
  if (t.initial_risk == null || t.initial_risk <= 0 || t.net_pnl == null) return null;
  return t.net_pnl / t.initial_risk;
}

function muted(v: string, title?: string) {
  return (
    <span className="text-muted-foreground" title={title}>
      {v}
    </span>
  );
}

function MoneyCell({
  value,
  currency,
  sourceCurrency,
  convert,
}: {
  value: number | null;
  currency: string;
  sourceCurrency?: string;
  convert?: ConvertMoney;
}) {
  usePrivacyMode();
  if (value == null) return muted("-");
  const amount = convert ? convert(value, sourceCurrency) : value;
  const text = fmtMoney(amount, currency, intlLocale());
  return (
    <span className="tabular-nums" title={text}>
      {text}
    </span>
  );
}

function PriceCell({ value }: { value: number | null }) {
  if (value == null) return muted("-");
  const text = value.toLocaleString(intlLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
  return (
    <span className="tabular-nums" title={text}>
      {text}
    </span>
  );
}

function SignedMoneyCell({
  value,
  currency,
  sourceCurrency,
  convert,
}: {
  value: number;
  currency: string;
  sourceCurrency?: string;
  convert?: ConvertMoney;
}) {
  usePrivacyMode();
  const text = fmtSignedMoney(convert ? convert(value, sourceCurrency) : value, currency, intlLocale());
  return (
    <span className={`tabular-nums font-semibold ${pnlColor(value)}`} title={text}>
      {text}
    </span>
  );
}

export function tradeColumns(
  currency: string,
  actions: TradeRowActions,
  fxRateOrConvert: number | ConvertMoney = 1,
): ColumnDef<Trade>[] {
  const convert: ConvertMoney =
    typeof fxRateOrConvert === "function" ? fxRateOrConvert : (value) => value * fxRateOrConvert;
  return [
    {
      accessorKey: "symbol",
      header: "Symbol",
      meta: { label: "Symbol", minWidth: 72 },
      cell: (i) => (
        <span className="font-semibold text-primary" title={i.getValue<string>()}>
          {i.getValue<string>()}
        </span>
      ),
    },
    {
      id: "status",
      accessorFn: (row) => tradeStatus(row).label,
      header: "Status",
      meta: { label: "Status", headerTitle: "Trade result", minWidth: 64 },
      cell: (i) => {
        const s = tradeStatus(i.row.original);
        const titles: Record<typeof s.label, string> = {
          WIN: "Win",
          LOSS: "Loss",
          OPEN: "Open",
          BE: "Break-even",
        };
        return (
          <Pill tone={s.tone} title={titles[s.label]}>
            {s.label}
          </Pill>
        );
      },
    },
    {
      id: "direction",
      accessorFn: (row) =>
        resolveTradeDirection({
          direction: row.direction,
          instrumentType: row.instrument_type,
          symbol: row.symbol,
        }).sortKey,
      header: "Direction",
      meta: {
        label: "Direction",
        headerTitle: "Direction — long/short; LC/LP/SC/SP when option",
        minWidth: 88,
      },
      cell: (i) => {
        const t = i.row.original;
        return (
          <DirCell direction={t.direction} instrumentType={t.instrument_type} symbol={t.symbol} />
        );
      },
    },
    {
      accessorKey: "instrument_type",
      header: "Market",
      meta: { label: "Market", headerTitle: "Instrument type" },
      cell: (i) => (
        <Pill tone="muted" title={MARKET_TITLES[i.getValue<string>()]}>
          {marketLabel(i.getValue<string>())}
        </Pill>
      ),
    },
    {
      accessorKey: "qty_opened",
      header: "Quantity",
      meta: { align: "right", label: "Quantity", headerTitle: "Quantity opened", minWidth: 80 },
      cell: (i) => (
        <span className="tabular-nums" title={String(i.getValue<number>())}>
          {i.getValue<number>().toFixed(2)}
        </span>
      ),
    },
    {
      accessorKey: "avg_entry_price",
      header: "Entry",
      meta: { align: "right", label: "Entry", headerTitle: "Average entry price", minWidth: 80 },
      cell: (i) => <PriceCell value={i.getValue<number>()} />,
    },
    {
      accessorKey: "avg_exit_price",
      header: "Exit",
      meta: { align: "right", label: "Exit", headerTitle: "Average exit price", minWidth: 80 },
      cell: (i) => <PriceCell value={i.getValue<number | null>()} />,
    },
    {
      id: "ent_tot",
      accessorFn: (row) =>
        usesPriceTotal(row.instrument_type)
          ? row.avg_entry_price
          : tradeNotional(row.qty_opened, row.avg_entry_price, row.instrument_type),
      header: "Entry total",
      meta: {
        align: "right",
        label: "Entry total",
        headerTitle: "Entry total — price for FX/CFD/crypto; otherwise quantity × average entry × multiplier",
        minWidth: 96,
      },
      cell: (i) => {
        const t = i.row.original;
        if (usesPriceTotal(t.instrument_type)) return <PriceCell value={t.avg_entry_price} />;
        return (
          <MoneyCell
            value={tradeNotional(t.qty_opened, t.avg_entry_price, t.instrument_type)}
            currency={currency}
            sourceCurrency={t.pnl_currency}
            convert={convert}
          />
        );
      },
    },
    {
      id: "ext_tot",
      accessorFn: (row) =>
        row.avg_exit_price == null
          ? null
          : usesPriceTotal(row.instrument_type)
            ? row.avg_exit_price
            : tradeNotional(row.qty_opened, row.avg_exit_price, row.instrument_type),
      header: "Exit total",
      meta: {
        align: "right",
        label: "Exit total",
        headerTitle: "Exit total — price for FX/CFD/crypto; otherwise quantity × average exit × multiplier",
        minWidth: 96,
      },
      sortFn: (a, b, id) => {
        const av = a.getValue<number | null>(id);
        const bv = b.getValue<number | null>(id);
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return av === bv ? 0 : av < bv ? -1 : 1;
      },
      cell: (i) => {
        const t = i.row.original;
        return t.avg_exit_price == null ? (
          muted("-")
        ) : usesPriceTotal(t.instrument_type) ? (
          <PriceCell value={t.avg_exit_price} />
        ) : (
          <MoneyCell
            value={tradeNotional(t.qty_opened, t.avg_exit_price, t.instrument_type)}
            currency={currency}
            sourceCurrency={t.pnl_currency}
            convert={convert}
          />
        );
      },
    },
    {
      id: "pos",
      accessorFn: (row) => {
        if (row.status !== "open") return null;
        return row.qty_remaining > 0 ? row.qty_remaining : row.qty_opened;
      },
      header: "Position",
      meta: { align: "right", label: "Position", headerTitle: "Position still open", minWidth: 80 },
      sortFn: (a, b, id) => {
        const av = a.getValue<number | null>(id);
        const bv = b.getValue<number | null>(id);
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return av === bv ? 0 : av < bv ? -1 : 1;
      },
      cell: (i) => {
        const t = i.row.original;
        if (t.status !== "open") return muted("-");
        const qty = t.qty_remaining > 0 ? t.qty_remaining : t.qty_opened;
        return (
          <span className="tabular-nums" title={String(qty)}>
            {qty.toFixed(2)}
          </span>
        );
      },
    },
    {
      accessorKey: "time_in_trade_secs",
      header: "Hold",
      meta: { align: "right", label: "Hold", headerTitle: "Time in trade", minWidth: 56 },
      cell: (i) => {
        const v = i.getValue<number | null>();
        return v == null || v <= 0 ? (
          muted("-")
        ) : (
          <span className="tabular-nums text-muted-foreground" title={fmtDuration(v)}>
            {fmtDuration(v)}
          </span>
        );
      },
    },
    {
      accessorKey: "fees_total",
      header: "Fees",
      meta: {
        align: "right",
        label: "Fees",
        headerTitle: "Total fees and commissions",
        minWidth: 72,
      },
      cell: (i) => (
        <MoneyCell
          value={i.getValue<number>()}
          currency={currency}
          sourceCurrency={i.row.original.pnl_currency}
          convert={convert}
        />
      ),
    },
    {
      accessorKey: "net_pnl",
      header: "P&L",
      meta: { align: "right", label: "P&L", headerTitle: "Net P&L", minWidth: 112 },
      cell: (i) => {
        const v = i.getValue<number | null>();
        if (v == null) return muted("-");
        return (
          <SignedMoneyCell
            value={v}
            currency={currency}
            sourceCurrency={i.row.original.pnl_currency}
            convert={convert}
          />
        );
      },
    },
    {
      accessorKey: "return_pct",
      header: "P&L %",
      meta: {
        align: "right",
        label: "P&L %",
        headerTitle: "Directional price change from entry to exit",
        minWidth: 88,
      },
      cell: (i) => {
        const v = i.getValue<number | null>();
        if (v == null) return muted("-");
        return (
          <span className={`tabular-nums ${pnlColor(v)}`} title={`${v.toFixed(2)}%`}>
            {v.toFixed(2)}%
          </span>
        );
      },
    },
    {
      accessorKey: "opened_at",
      header: "Date",
      meta: { label: "Created At", headerTitle: "Date opened", minWidth: 96 },
      cell: (i) => {
        const v = i.getValue<string>();
        return muted(fmtTradeDay(v), fmtDateTime(v));
      },
    },
    {
      accessorKey: "closed_at",
      header: "Close",
      meta: { label: "Close date", headerTitle: "Date closed (last activity)", minWidth: 96 },
      cell: (i) => {
        const v = i.getValue<string | null>();
        return v ? muted(fmtTradeDay(v), fmtDateTime(v)) : muted("-");
      },
    },
    {
      id: "r_multiple",
      accessorFn: (row) => tradeRMultiple(row),
      header: "R",
      meta: {
        align: "right",
        label: "R",
        headerTitle: "Net P&L ÷ planned risk (initial risk)",
        minWidth: 56,
      },
      cell: (i) => {
        const v = i.getValue<number | null>();
        if (v == null) return muted("-");
        const sign = v > 0 ? "+" : "";
        return (
          <span
            className={`tabular-nums font-semibold ${pnlColor(v)}`}
            title={`${sign}${v.toFixed(2)}R — net P&L ÷ planned risk`}
          >
            {sign}
            {v.toFixed(2)}R
          </span>
        );
      },
    },
    {
      id: "tags",
      accessorFn: (row) => row.tags.map((t) => t.name).join(", "),
      header: "Tags",
      enableSorting: false,
      meta: { label: "Tags", headerTitle: "Trade tags", minWidth: 96 },
      cell: (i) => {
        const tags = i.row.original.tags;
        if (tags.length === 0) return muted("-");
        const shown = tags.slice(0, 2);
        const rest = tags.length - shown.length;
        return (
          <div className="flex max-w-[14rem] items-center gap-1">
            {shown.map((t) => (
              <Pill
                key={t.id}
                tone={t.kind === "mistake" ? "neg" : "muted"}
                title={t.name}
                className="max-w-[7rem] overflow-hidden"
              >
                <span className="truncate">{t.name}</span>
              </Pill>
            ))}
            {rest > 0 ? (
              <span
                className="shrink-0 text-muted-foreground"
                title={tags
                  .slice(2)
                  .map((t) => t.name)
                  .join(", ")}
              >
                +{rest}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      meta: { minWidth: 48 },
      cell: (i) => <TradeRowMenu trade={i.row.original} actions={actions} />,
    },
  ];
}

/** Pin the actions column via TanStack `columnPinning` (pass to DataTable). */
export const TRADE_COLUMN_PINNING: ColumnPinningState = { start: [], end: ["actions"] };

/** Sortable trade columns for the tablecn-style Sort button. */
export const TRADE_SORT_COLUMNS: { id: string; label: string }[] = [
  { id: "opened_at", label: "Created At" },
  { id: "closed_at", label: "Close date" },
  { id: "symbol", label: "Symbol" },
  { id: "status", label: "Status" },
  { id: "direction", label: "Direction" },
  { id: "instrument_type", label: "Market" },
  { id: "qty_opened", label: "Qty" },
  { id: "avg_entry_price", label: "Entry" },
  { id: "avg_exit_price", label: "Exit" },
  { id: "ent_tot", label: "Entry total" },
  { id: "ext_tot", label: "Exit total" },
  { id: "pos", label: "Position" },
  { id: "time_in_trade_secs", label: "Hold" },
  { id: "fees_total", label: "Fees" },
  { id: "net_pnl", label: "P&L" },
  { id: "return_pct", label: "P&L %" },
  { id: "r_multiple", label: "R" },
];

/** Hideable trade columns for the tablecn-style View button. */
export const TRADE_VIEW_COLUMNS: { id: string; label: string }[] = [
  { id: "symbol", label: "Symbol" },
  { id: "status", label: "Status" },
  { id: "direction", label: "Direction" },
  { id: "instrument_type", label: "Market" },
  { id: "qty_opened", label: "Qty" },
  { id: "avg_entry_price", label: "Entry" },
  { id: "avg_exit_price", label: "Exit" },
  { id: "ent_tot", label: "Entry total" },
  { id: "ext_tot", label: "Exit total" },
  { id: "pos", label: "Position" },
  { id: "time_in_trade_secs", label: "Hold" },
  { id: "fees_total", label: "Fees" },
  { id: "net_pnl", label: "P&L" },
  { id: "return_pct", label: "P&L %" },
  { id: "opened_at", label: "Created At" },
  { id: "closed_at", label: "Close date" },
  { id: "r_multiple", label: "R" },
  { id: "tags", label: "Tags" },
];
