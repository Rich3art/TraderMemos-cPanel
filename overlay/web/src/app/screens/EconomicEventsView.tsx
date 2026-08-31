import { Activity, CalendarX2, CloudAlert, ExternalLink, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Card } from "@/components/Card";
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/Drawer";
import { EmptyState } from "@/components/EmptyState";
import { FacetedFilter } from "@/components/FacetedFilter";
import { Page } from "@/components/Page";
import { PeriodNav } from "@/components/PeriodNav";
import { Badge } from "@/components/reui/badge";
import { ListSkeleton } from "@/components/skeletons/list-skeleton";
import { Button } from "@/components/ui/button";
import type { EconomicEvent, EconomicImpact } from "@/lib/api/economicEvents";
import { dayKeyInTz } from "@/lib/calendar";
import { cn } from "@/lib/cn";
import { getDisplayTimeOpts } from "@/lib/displayPrefs";
import { fmtTime } from "@/lib/format";
import { intlLocale } from "@/lib/locale";

export const IMPACT_VALUES: EconomicImpact[] = ["high", "medium", "low", "holiday"];

const IMPACT_META: Record<
  EconomicImpact,
  { label: string; variant: "destructive-light" | "warning-light" | "secondary" | "info-light" }
> = {
  high: { label: "High", variant: "destructive-light" },
  medium: { label: "Medium", variant: "warning-light" },
  low: { label: "Low", variant: "secondary" },
  holiday: { label: "Holiday", variant: "info-light" },
};

/** Sunday day-key of the week `offsetWeeks` from today, on the trader's clock. */
export function weekStartKey(offsetWeeks: number, timeZone?: string): string {
  const todayKey = dayKeyInTz(new Date().toISOString(), timeZone);
  const base = new Date(`${todayKey}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() - base.getUTCDay() + offsetWeeks * 7);
  return base.toISOString().slice(0, 10);
}

export function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * "Aug 2 – 8" (or "Jul 26 – Aug 1, 2025" outside the current year) — `formatRange`
 * collapses the shared month/year per locale rules. Formatting the two ends
 * separately and dropping `month` by hand yields garbage in en-US
 * ("2026 (day: 8)"), so let Intl own the range. The year is dropped inside the
 * current year to keep the stepper narrow enough for the mobile toolbar row.
 */
export function formatWeekLabel(weekStart: string, locale: string, todayKey: string): string {
  const start = new Date(`${weekStart}T12:00:00Z`);
  const end = new Date(`${addDaysKey(weekStart, 6)}T12:00:00Z`);
  const currentYear = todayKey.slice(0, 4);
  const showYear =
    weekStart.slice(0, 4) !== currentYear || addDaysKey(weekStart, 6).slice(0, 4) !== currentYear;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(showYear ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  }).formatRange(start, end);
}

function formatDayHeader(dayKey: string, locale: string): string {
  return new Date(`${dayKey}T12:00:00Z`).toLocaleDateString(locale, {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Row template. The time column is sized per locale/preference: a 24h "15:19"
 * fits 3.25rem, while a day period ("05:15 PM", "오후 3:19") needs 4.5rem or it
 * wraps onto a second line and doubles the row height on mobile.
 */
const ROW_GRID_BASE = "grid items-center gap-2 px-4";
const ROW_GRID_COLS = {
  narrow:
    "grid-cols-[3.25rem_2.5rem_4.5rem_minmax(0,1fr)] " +
    "sm:grid-cols-[3.25rem_2.5rem_4.5rem_minmax(0,1fr)_4.5rem_4.5rem]",
  wide:
    "grid-cols-[4.5rem_2.5rem_4.5rem_minmax(0,1fr)] " +
    "sm:grid-cols-[4.5rem_2.5rem_4.5rem_minmax(0,1fr)_4.5rem_4.5rem]",
} as const;

/** True when formatted times carry a day period (12h) and need the wider column. */
function needsWideTimeColumn(locale: string): boolean {
  return fmtTime("2026-01-05T15:19:00Z", locale).length > 5;
}

function providerLabel(provider: string): string {
  if (provider === "faireconomy" || provider === "forexfactory") return "Forex Factory";
  return provider || "Economic calendar";
}

function providerUrl(provider: string): string {
  if (provider === "faireconomy" || provider === "forexfactory") {
    return "https://www.forexfactory.com/calendar";
  }
  return "https://www.forexfactory.com/calendar";
}

function parseNumericFigure(value: string): number | null {
  const cleaned = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned[0]);
  return Number.isFinite(n) ? n : null;
}

function impactAnalysis(ev: EconomicEvent, now: number): string[] {
  const actual = parseNumericFigure(ev.actual);
  const forecast = parseNumericFigure(ev.forecast);
  const previous = parseNumericFigure(ev.previous);
  const released = ev.actual.trim().length > 0 || new Date(ev.time).getTime() < now;
  const direction =
    actual != null && forecast != null
      ? actual > forecast
        ? "above forecast"
        : actual < forecast
          ? "below forecast"
          : "in line with forecast"
      : null;

  const volatility =
    ev.impact === "high"
      ? "High-impact event: expect wider spreads, faster candles, and possible false breaks around the release."
      : ev.impact === "medium"
        ? "Medium-impact event: it can move price if the number surprises or confirms a larger theme."
        : ev.impact === "holiday"
          ? "Holiday: liquidity may be thinner, so price can move unevenly even without a data surprise."
          : "Low-impact event: usually background context unless it clusters with stronger news.";

  const lines = [volatility];
  if (direction) {
    lines.push(
      `${ev.country} result is ${direction}; watch whether ${ev.country}-linked pairs extend in that direction or fade after the first impulse.`,
    );
  } else if (!released) {
    lines.push(
      `No actual result yet. Before entry, treat ${ev.country} exposure as event risk and reduce confidence until the release is absorbed.`,
    );
  } else if (previous != null || forecast != null) {
    lines.push(
      "The feed has forecast/previous context but no actual result yet, so directional impact cannot be confirmed from this calendar row alone.",
    );
  }
  lines.push(
    "Use this as a risk filter, not a signal by itself: confirm with the chart trend, liquidity sweep, and the timeframe you plan to trade.",
  );
  return lines;
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-[13px] font-semibold tabular-nums text-foreground">
        {value || "-"}
      </div>
    </div>
  );
}

export interface EconomicEventsViewProps {
  /** Events already clipped to the visible week, sorted by time. */
  events: EconomicEvent[];
  loading: boolean;
  error: boolean;
  weekStart: string;
  isCurrentWeek: boolean;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onThisWeek: () => void;
  impact?: string[];
  onImpactChange: (next?: string[]) => void;
  currencies?: string[];
  onCurrenciesChange: (next?: string[]) => void;
}

export function EconomicEventsView({
  events,
  loading,
  error,
  weekStart,
  isCurrentWeek,
  onPrevWeek,
  onNextWeek,
  onThisWeek,
  impact,
  onImpactChange,
  currencies,
  onCurrenciesChange,
}: EconomicEventsViewProps) {
  const locale = intlLocale();
  const { timeZone } = getDisplayTimeOpts();
  const todayKey = dayKeyInTz(new Date().toISOString(), timeZone);
  const now = Date.now();
  const [selected, setSelected] = useState<EconomicEvent | null>(null);

  const currencyOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ev of events) counts.set(ev.country, (counts.get(ev.country) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([value, count]) => ({ value, label: value, count }));
  }, [events]);

  const impactSet = impact?.length ? new Set(impact) : null;
  const currencySet = currencies?.length ? new Set(currencies) : null;
  const filtered = events.filter(
    (ev) =>
      (!impactSet || impactSet.has(ev.impact)) && (!currencySet || currencySet.has(ev.country)),
  );

  const byDay = useMemo(() => {
    const groups = new Map<string, EconomicEvent[]>();
    for (const ev of filtered) {
      const key = dayKeyInTz(ev.time, timeZone);
      const list = groups.get(key);
      if (list) list.push(ev);
      else groups.set(key, [ev]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, timeZone]);

  const hasActual = filtered.some((ev) => ev.actual !== "");
  const filtersActive = impactSet != null || currencySet != null;
  const label = formatWeekLabel(weekStart, locale, todayKey);
  const rowGrid = cn(
    ROW_GRID_BASE,
    needsWideTimeColumn(locale) ? ROW_GRID_COLS.wide : ROW_GRID_COLS.narrow,
  );

  function renderContent() {
    if (loading) {
      return <ListSkeleton rows={8} className="px-4 pt-2" />;
    }
    if (error) {
      return (
        <EmptyState
          icon={<CloudAlert size={20} strokeWidth={1.75} />}
          title="Couldn't load events"
          hint="The calendar feed or API is unreachable. Try again in a minute."
        />
      );
    }
    if (byDay.length === 0) {
      return (
        <EmptyState
          icon={<CalendarX2 size={20} strokeWidth={1.75} />}
          title={filtersActive ? "No events match the filters" : "No events this week"}
          hint={
            filtersActive
              ? "Clear the impact or currency filters to see the full week."
              : "Older weeks only show events collected while the server was running."
          }
        />
      );
    }
    return (
      <div className="flex flex-col pb-2" role="table" aria-label="Economic events">
        <div
          role="row"
          className={cn(
            rowGrid,
            "pt-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
          )}
        >
          <span role="columnheader">Time</span>
          <span role="columnheader">Cur</span>
          <span role="columnheader">Impact</span>
          <span role="columnheader">Event</span>
          <span role="columnheader" className="hidden text-right sm:block">
            {hasActual ? "Actual" : "Forecast"}
          </span>
          <span role="columnheader" className="hidden text-right sm:block">
            {hasActual ? "Forecast" : "Previous"}
          </span>
        </div>
        {byDay.map(([dayKey, dayEvents]) => (
          <section key={dayKey} aria-label={formatDayHeader(dayKey, locale)}>
            <h3
              className={cn(
                "flex items-center gap-2 px-4 pt-4 pb-1 text-[11px] font-semibold",
                dayKey === todayKey ? "text-primary" : "text-muted-foreground",
              )}
            >
              {formatDayHeader(dayKey, locale)}
              {dayKey === todayKey ? (
                <Badge variant="primary-light" size="xs" radius="full">
                  Today
                </Badge>
              ) : null}
            </h3>
            {dayEvents.map((ev) => {
              const past = new Date(ev.time).getTime() < now;
              return (
                <button
                  key={ev.id}
                  role="row"
                  type="button"
                  onClick={() => setSelected(ev)}
                  className={cn(
                    rowGrid,
                    "min-h-9 w-full rounded-md py-1.5 text-left transition-colors",
                    "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                  )}
                >
                  <span className="whitespace-nowrap text-[12px] tabular-nums text-muted-foreground">
                    {fmtTime(ev.time, locale)}
                  </span>
                  <span className="text-[12px] font-medium text-foreground">{ev.country}</span>
                  <Badge variant={IMPACT_META[ev.impact]?.variant ?? "secondary"} size="sm">
                    {IMPACT_META[ev.impact]?.label ?? ev.impact}
                  </Badge>
                  <span
                    className={cn(
                      "truncate text-[13px]",
                      past ? "text-muted-foreground" : "text-foreground",
                    )}
                    title={ev.title}
                  >
                    {ev.title}
                  </span>
                  <span className="hidden text-right text-[12px] tabular-nums text-foreground sm:block">
                    {(hasActual ? ev.actual : ev.forecast) || "—"}
                  </span>
                  <span className="hidden text-right text-[12px] tabular-nums text-muted-foreground sm:block">
                    {(hasActual ? ev.forecast : ev.previous) || "—"}
                  </span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
    );
  }

  return (
    <Page>
      {/* Single toolbar row on every width: the week stepper takes the slack and
          truncates, the filters keep their natural size. */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <PeriodNav
          onPrev={onPrevWeek}
          onNext={onNextWeek}
          prevLabel="Previous week"
          nextLabel="Next week"
          className="min-w-0"
        >
          {isCurrentWeek ? (
            <span className="min-w-0 truncate px-1 text-center text-[13px] font-semibold tabular-nums tracking-[-0.01em] text-foreground">
              {label}
            </span>
          ) : (
            // Below `sm` the explicit "This week" button is dropped for row width,
            // so the label itself is the way back to the current week.
            <button
              type="button"
              onClick={onThisWeek}
              title="Back to this week"
              aria-label={`Back to this week (showing ${label})`}
              className={cn(
                "min-w-0 truncate rounded-md px-1 text-center text-[13px] font-semibold tabular-nums",
                "tracking-[-0.01em] text-foreground transition-colors hover:text-primary",
                "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
              )}
            >
              {label}
            </button>
          )}
        </PeriodNav>
        {!isCurrentWeek ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onThisWeek}
            className="hidden h-8 shrink-0 px-2 text-[12px] sm:inline-flex sm:h-7 sm:px-2.5"
          >
            This week
          </Button>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <FacetedFilter
            title="Impact"
            multiple
            options={IMPACT_VALUES.map((v) => ({ value: v, label: IMPACT_META[v].label }))}
            value={impact}
            onChange={(next) =>
              onImpactChange(Array.isArray(next) ? next : next ? [next] : undefined)
            }
            className="px-2 sm:px-3"
          />
          <FacetedFilter
            title="Currency"
            multiple
            options={currencyOptions}
            value={currencies}
            onChange={(next) =>
              onCurrenciesChange(Array.isArray(next) ? next : next ? [next] : undefined)
            }
            className="px-2 sm:px-3"
          />
        </div>
      </div>
      <Card flush>{renderContent()}</Card>
      <EventDetailDrawer
        event={selected}
        now={now}
        locale={locale}
        onClose={() => setSelected(null)}
      />
    </Page>
  );
}

function EventDetailDrawer({
  event,
  now,
  locale,
  onClose,
}: {
  event: EconomicEvent | null;
  now: number;
  locale: string;
  onClose: () => void;
}) {
  const analysis = event ? impactAnalysis(event, now) : [];
  const sourceUrl = event ? providerUrl(event.provider) : "";
  return (
    <Drawer open={event != null} onOpenChange={(open) => !open && onClose()} modal>
      <DrawerContent className="[--drawer-content-width:min(460px,calc(100vw-2*var(--drawer-inset)))]">
        <DrawerHeader>
          <DrawerTitle className="flex min-w-0 flex-col gap-1">
            <span className="truncate">{event?.title ?? "Event details"}</span>
            {event ? (
              <span className="text-xs font-normal text-muted-foreground">
                {event.country} · {formatDayHeader(dayKeyInTz(event.time), locale)} ·{" "}
                {fmtTime(event.time, locale)}
              </span>
            ) : null}
          </DrawerTitle>
          <DrawerClose
            aria-label="Close event details"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X size={16} strokeWidth={1.6} aria-hidden />
          </DrawerClose>
        </DrawerHeader>
        <DrawerBody>
          {event ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={IMPACT_META[event.impact]?.variant ?? "secondary"} size="sm">
                  {IMPACT_META[event.impact]?.label ?? event.impact}
                </Badge>
                <Badge variant="secondary" size="sm">
                  {providerLabel(event.provider)}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Figure label="Actual" value={event.actual} />
                <Figure label="Forecast" value={event.forecast} />
                <Figure label="Previous" value={event.previous} />
              </div>

              <section className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Activity size={14} strokeWidth={1.6} aria-hidden />
                  AI impact analysis
                </div>
                <div className="rounded-md border border-border bg-muted/25 p-3 text-[13px] leading-5 text-foreground">
                  {analysis.map((line) => (
                    <p key={line} className="m-0 mb-2 last:mb-0">
                      {line}
                    </p>
                  ))}
                </div>
              </section>

              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Open source calendar
                <ExternalLink size={14} strokeWidth={1.6} aria-hidden />
              </a>
            </>
          ) : null}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
