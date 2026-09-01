export interface MarketSessionDef {
  id: "sydney" | "tokyo" | "london" | "new-york";
  label: string;
  timeZone: string;
  openLocalHour: number;
  closeLocalHour: number;
}

export interface MarketSessionState extends MarketSessionDef {
  localTime: string;
  open: boolean;
  progress: number;
  nextTransitionAt: Date;
  nextTransitionLabel: string;
}

export const MARKET_SESSIONS: MarketSessionDef[] = [
  {
    id: "sydney",
    label: "Sydney",
    timeZone: "Australia/Sydney",
    openLocalHour: 7,
    closeLocalHour: 16,
  },
  { id: "tokyo", label: "Tokyo", timeZone: "Asia/Tokyo", openLocalHour: 9, closeLocalHour: 18 },
  {
    id: "london",
    label: "London",
    timeZone: "Europe/London",
    openLocalHour: 8,
    closeLocalHour: 17,
  },
  {
    id: "new-york",
    label: "New York",
    timeZone: "America/New_York",
    openLocalHour: 8,
    closeLocalHour: 17,
  },
];

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
}

function zonedParts(at: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(at);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(part("year")),
    month: Number(part("month")),
    day: Number(part("day")),
    hour: Number(part("hour")),
    minute: Number(part("minute")),
    weekday: part("weekday"),
  };
}

function localTimestamp(parts: Omit<ZonedParts, "weekday">): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

function zonedInstant(
  timeZone: string,
  date: Pick<ZonedParts, "year" | "month" | "day">,
  hour: number,
): Date {
  let guess = new Date(Date.UTC(date.year, date.month - 1, date.day, hour));
  const target = Date.UTC(date.year, date.month - 1, date.day, hour);
  for (let i = 0; i < 3; i += 1) {
    const actual = zonedParts(guess, timeZone);
    const delta = target - localTimestamp(actual);
    if (delta === 0) break;
    guess = new Date(guess.getTime() + delta);
  }
  return guess;
}

function addLocalDays(date: Pick<ZonedParts, "year" | "month" | "day">, days: number) {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

function isTradingWeekday(weekday: string): boolean {
  return weekday !== "Sat" && weekday !== "Sun";
}

function nextTradingOpen(def: MarketSessionDef, at: Date, today: ZonedParts): Date {
  for (let offset = 0; offset < 8; offset += 1) {
    const date = addLocalDays(today, offset);
    const candidate = zonedInstant(def.timeZone, date, def.openLocalHour);
    if (candidate <= at || !isTradingWeekday(zonedParts(candidate, def.timeZone).weekday)) continue;
    return candidate;
  }
  return zonedInstant(def.timeZone, addLocalDays(today, 1), def.openLocalHour);
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
  const today = zonedParts(now, def.timeZone);
  const openToday = zonedInstant(def.timeZone, today, def.openLocalHour);
  const closeToday = zonedInstant(def.timeZone, today, def.closeLocalHour);
  const open = isTradingWeekday(today.weekday) && now >= openToday && now < closeToday;
  const nextOpen = nextTradingOpen(def, now, today);
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
