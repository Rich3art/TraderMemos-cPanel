export interface MarketSessionDef {
  id: "tokyo" | "london" | "new-york";
  label: string;
  timeZone: string;
  openUtcHour: number;
  closeUtcHour: number;
}

export interface MarketSessionState extends MarketSessionDef {
  localTime: string;
  open: boolean;
  progress: number;
  nextTransitionAt: Date;
  nextTransitionLabel: string;
}

export const MARKET_SESSIONS: MarketSessionDef[] = [
  { id: "tokyo", label: "Tokyo", timeZone: "Asia/Tokyo", openUtcHour: 0, closeUtcHour: 9 },
  { id: "london", label: "London", timeZone: "Europe/London", openUtcHour: 8, closeUtcHour: 17 },
  {
    id: "new-york",
    label: "New York",
    timeZone: "America/New_York",
    openUtcHour: 13,
    closeUtcHour: 22,
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function utcDayStart(at: Date): number {
  return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
}

function sessionInstant(at: Date, hour: number, dayOffset = 0): Date {
  return new Date(utcDayStart(at) + dayOffset * DAY_MS + hour * HOUR_MS);
}

function isTradingDay(at: Date): boolean {
  const day = at.getUTCDay();
  return day >= 1 && day <= 5;
}

function nextTradingOpen(at: Date, hour: number): Date {
  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = sessionInstant(at, hour, offset);
    if (candidate <= at || !isTradingDay(candidate)) continue;
    return candidate;
  }
  return sessionInstant(at, hour, 1);
}

export function formatDurationUntil(to: Date, from: Date): string {
  const totalMinutes = Math.max(0, Math.ceil((to.getTime() - from.getTime()) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function sessionState(
  def: MarketSessionDef,
  now: Date,
  locale = "en-US",
): MarketSessionState {
  const openToday = sessionInstant(now, def.openUtcHour);
  const closeToday = sessionInstant(now, def.closeUtcHour);
  const open = isTradingDay(now) && now >= openToday && now < closeToday;
  const nextOpen = nextTradingOpen(now, def.openUtcHour);
  const nextTransitionAt = open ? closeToday : nextOpen;
  const progress = open
    ? (now.getTime() - openToday.getTime()) / (closeToday.getTime() - openToday.getTime())
    : 0;

  return {
    ...def,
    localTime: new Intl.DateTimeFormat(locale, {
      timeZone: def.timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now),
    open,
    progress: Math.min(Math.max(progress, 0), 1),
    nextTransitionAt,
    nextTransitionLabel: `${def.label} ${open ? "closes" : "opens"} in ${formatDurationUntil(nextTransitionAt, now)}`,
  };
}

export function marketSessionSnapshot(now: Date = new Date(), locale = "en-US") {
  const sessions = MARKET_SESSIONS.map((def) => sessionState(def, now, locale));
  const openSessions = sessions.filter((s) => s.open);
  const nextTransition = [...sessions].sort(
    (a, b) => a.nextTransitionAt.getTime() - b.nextTransitionAt.getTime(),
  )[0];

  return {
    sessions,
    openSessions,
    anyOpen: openSessions.length > 0,
    label:
      openSessions.length > 0
        ? `${openSessions.map((s) => s.label).join(" / ")} open`
        : "Markets closed",
    nextTransition,
  };
}
