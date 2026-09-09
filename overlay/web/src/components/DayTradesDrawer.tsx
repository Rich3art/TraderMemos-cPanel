import { ExternalLink, FileText, Plus, X } from "lucide-react";
import type { EconomicEvent } from "@/lib/api/economicEvents";
import type { JournalNote, Trade } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { usePrivacyMode } from "@/lib/displayPrefs";
import { fmtSignedMoney, fmtTime } from "@/lib/format";
import { intlLocale } from "@/lib/locale";
import { noteExcerpt } from "@/components/editor/markdown";
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "./Drawer";
import { EmptyState } from "./EmptyState";
import { ItemGroup } from "./Item";
import { Button } from "./ui/button";
import { Skeleton } from "./Skeleton";
import { pnlColor } from "./theme-tokens";
import { TradeListItem } from "./TradeListItem";
import { WinLossRecord } from "./WinLossRecord";

function formatDayTitle(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(intlLocale(), {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function summarizeDayTrades(trades: Trade[]): {
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
} {
  let pnl = 0;
  let wins = 0;
  let losses = 0;
  for (const t of trades) {
    const net = t.net_pnl;
    if (net == null || Number.isNaN(net)) continue;
    pnl += net;
    if (net > 0) wins += 1;
    else if (net < 0) losses += 1;
  }
  const decided = wins + losses;
  return {
    pnl: Math.round(pnl * 100) / 100,
    trades: trades.length,
    wins,
    losses,
    winRate: decided > 0 ? wins / decided : null,
  };
}

function DaySummary({
  trades,
  currency,
  fxRate = 1,
}: {
  trades: Trade[];
  currency: string;
  fxRate?: number;
}) {
  usePrivacyMode();
  const locale = intlLocale();
  const summary = summarizeDayTrades(trades);
  const winRateLabel = summary.winRate != null ? `${(summary.winRate * 100).toFixed(1)}%` : null;

  return (
    <div className="px-4 pb-3 pt-1">
      <p
        className={cn(
          "text-[22px] font-semibold tabular-nums tracking-tight",
          pnlColor(summary.pnl),
        )}
      >
        {fmtSignedMoney(summary.pnl * fxRate, currency, locale)}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] tabular-nums text-muted-foreground">
        <span>
          {summary.trades} {summary.trades === 1 ? "trade" : "trades"}
        </span>
        {(summary.wins > 0 || summary.losses > 0) && (
          <>
            <span className="text-muted-foreground" aria-hidden>
              ·
            </span>
            <WinLossRecord wins={summary.wins} losses={summary.losses} />
            {winRateLabel ? <span className="text-muted-foreground">· {winRateLabel}</span> : null}
          </>
        )}
      </div>
    </div>
  );
}

export interface DayTradesDrawerProps {
  selectedDay: string | null;
  onClose: () => void;
  dayTrades: Trade[];
  dayTradesLoading: boolean;
  dayTradesError: boolean;
  dayNotes?: JournalNote[];
  dayNotesLoading?: boolean;
  dayNotesError?: boolean;
  dayEvents?: EconomicEvent[];
  dayEventsLoading?: boolean;
  dayEventsError?: boolean;
  currency: string;
  fxRate?: number;
  onSelectTrade: (t: Trade) => void;
  /** Navigates to the full-page day review when provided. */
  onOpenDayReview?: (day: string) => void;
  onNewTrade?: () => void;
  onNewNote?: () => void;
}

export function DayTradesDrawer({
  selectedDay,
  onClose,
  dayTrades,
  dayTradesLoading,
  dayTradesError,
  dayNotes = [],
  dayNotesLoading = false,
  dayNotesError = false,
  dayEvents = [],
  dayEventsLoading = false,
  dayEventsError = false,
  currency,
  fxRate = 1,
  onSelectTrade,
  onOpenDayReview,
  onNewTrade,
  onNewNote,
}: DayTradesDrawerProps) {
  const open = Boolean(selectedDay);
  const locale = intlLocale();
  const title = selectedDay ? formatDayTitle(selectedDay) : "Day preview";

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      modal="trap-focus"
      swipeDirection="left"
    >
      <DrawerContent className="[--drawer-content-width:min(380px,calc(100vw-2*var(--drawer-inset)))]">
        <DrawerHeader className="px-4 py-3">
          <div className="min-w-0">
            <DrawerTitle>{title}</DrawerTitle>
            <p className="m-0 mt-0.5 text-xs text-muted-foreground">Day snapshot</p>
          </div>
          <DrawerClose
            aria-label="Close"
            className="ml-auto flex cursor-pointer rounded-md border-none bg-transparent p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X size={18} strokeWidth={1.5} />
          </DrawerClose>
        </DrawerHeader>
        <DrawerBody className="gap-0 p-0">
          <div className="flex gap-2 px-4 pt-1 pb-3">
            {onOpenDayReview && selectedDay ? (
              <Button
                type="button"
                variant="soft"
                size="sm"
                className="flex-1"
                onClick={() => onOpenDayReview(selectedDay)}
              >
                Full day
              </Button>
            ) : null}
            {onNewTrade ? (
              <Button type="button" variant="outline" size="sm" onClick={onNewTrade}>
                <Plus size={14} strokeWidth={1.7} />
                Trade
              </Button>
            ) : null}
            {onNewNote ? (
              <Button type="button" variant="outline" size="sm" onClick={onNewNote}>
                <FileText size={14} strokeWidth={1.7} />
                Note
              </Button>
            ) : null}
          </div>
          {dayTradesLoading ? (
            <Skeleton height="160px" className="m-4" />
          ) : dayTradesError ? (
            <p className="p-4 text-xs text-destructive">Failed to load trades.</p>
          ) : dayTrades.length === 0 ? (
            <div className="px-4 py-3">
              <EmptyState title="No trades on this day" />
            </div>
          ) : (
            <>
              <DaySummary trades={dayTrades} currency={currency} fxRate={fxRate} />
              <ItemGroup className="gap-2 px-4 pb-4">
                {dayTrades.map((trade) => (
                  <TradeListItem
                    key={trade.id}
                    trade={trade}
                    currency={currency}
                    fxRate={fxRate}
                    onSelect={onSelectTrade}
                  />
                ))}
              </ItemGroup>
            </>
          )}
          <section className="border-t border-border px-4 py-3">
            <h3 className="m-0 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Journal
            </h3>
            {dayNotesLoading ? (
              <Skeleton height="72px" className="mt-3" />
            ) : dayNotesError ? (
              <p className="m-0 mt-3 text-xs text-destructive">Failed to load notes.</p>
            ) : dayNotes.length === 0 ? (
              <p className="m-0 mt-3 text-[13px] text-muted-foreground">No notes yet.</p>
            ) : (
              <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
                {dayNotes.slice(0, 3).map((note) => (
                  <li key={note.id} className="rounded-md bg-muted/45 px-3 py-2">
                    <p className="m-0 truncate text-[13px] font-medium text-foreground">
                      {note.title || (note.type === "daily_log" ? "Daily log" : "Note")}
                    </p>
                    <p className="m-0 mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {noteExcerpt(note.body, 110)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="border-t border-border px-4 py-3">
            <h3 className="m-0 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Economic events
            </h3>
            {dayEventsLoading ? (
              <Skeleton height="88px" className="mt-3" />
            ) : dayEventsError ? (
              <p className="m-0 mt-3 text-xs text-destructive">Failed to load events.</p>
            ) : dayEvents.length === 0 ? (
              <p className="m-0 mt-3 text-[13px] text-muted-foreground">No events found.</p>
            ) : (
              <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
                {dayEvents.slice(0, 5).map((event) => (
                  <li key={event.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
                    <span className="pt-0.5 text-xs tabular-nums text-muted-foreground">
                      {fmtTime(event.time, locale)}
                    </span>
                    <div className="min-w-0">
                      <p className="m-0 truncate text-[13px] font-medium text-foreground">
                        {event.title}
                      </p>
                      <p className="m-0 mt-0.5 truncate text-xs text-muted-foreground">
                        {event.country || "Global"} · {event.impact}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {selectedDay ? (
              <button
                type="button"
                className="mt-3 inline-flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-xs font-medium text-primary hover:underline"
                onClick={() => onOpenDayReview?.(selectedDay)}
              >
                See complete day <ExternalLink size={12} strokeWidth={1.7} />
              </button>
            ) : null}
          </section>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
