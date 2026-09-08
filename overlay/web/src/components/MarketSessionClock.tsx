import { ChevronDown, ChevronUp, Clock3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  formatUtcOffsetPrefix,
  resolveDisplayTimezone,
  timezoneSelectOptions,
  useDisplayPrefs,
  useDisplayTimePrefs,
  type TimezonePref,
} from "@/lib/displayPrefs";
import { intlLocale } from "@/lib/locale";
import { type MarketSessionState, marketSessionSnapshot } from "@/lib/marketSessions";
import { Menu, MenuPopup, MenuTrigger } from "./ui/menu";

const SESSION_FLAGS: Record<MarketSessionState["id"], string> = {
  sydney: "🇦🇺",
  tokyo: "🇯🇵",
  london: "🇬🇧",
  "new-york": "🇺🇸",
};

function utcClock(now: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}

function zoneClock(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}

function nowMarkerPercent(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return ((hour * 60 + minute) / 1440) * 100;
}

function timelineSegments(session: MarketSessionState): { left: number; width: number }[] {
  const start = (session.userOpenMinute / 1440) * 100;
  const end = (session.userCloseMinute / 1440) * 100;
  if (end > start) return [{ left: start, width: end - start }];
  return [
    { left: start, width: 100 - start },
    { left: 0, width: end },
  ];
}

function displayTimezoneLabel(value: TimezonePref, resolvedTimeZone: string, now: Date) {
  const offset = formatUtcOffsetPrefix(resolvedTimeZone, now).replace(/(UTC[+-]\d{2})$/, "$1:00");
  if (value === "local") return `Local (${offset})`;
  if (value === "UTC") return "UTC (UTC+00:00)";
  const option = timezoneSelectOptions(now).find((o) => o.value === value);
  const name = (option?.label ?? value).replace(/^UTC[+-]\d{2}(?::\d{2})?\s*/, "");
  return `${name} (${offset})`;
}

function useMinuteClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function MarketSessionClock() {
  const now = useMinuteClock();
  const locale = intlLocale();
  const { timezone } = useDisplayTimePrefs();
  const setTimezone = useDisplayPrefs((s) => s.setTimezone);
  const userTimeZone = resolveDisplayTimezone(timezone);
  const snapshot = useMemo(
    () => marketSessionSnapshot(now, locale, userTimeZone),
    [now, locale, userTimeZone],
  );
  const next = snapshot.nextTransition?.nextTransitionLabel ?? "";
  const activeSession = snapshot.openSessions[0] ?? snapshot.nextTransition ?? snapshot.sessions[0];
  const marker = nowMarkerPercent(now, userTimeZone);
  const timezoneOptions = useMemo(() => timezoneSelectOptions(now), [now]);
  const timezoneLabel = displayTimezoneLabel(timezone, userTimeZone, now);

  return (
    <Menu>
      <MenuTrigger
        aria-label={`Market sessions: ${snapshot.label}. ${next}`}
        className={cn(
          "group inline-flex h-9 max-w-[9.5rem] cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] font-medium outline-none sm:max-w-none",
          "transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          snapshot.anyOpen ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "relative inline-flex size-2 rounded-full",
            snapshot.anyOpen ? "bg-profit" : "bg-muted-foreground/45",
          )}
        >
          {snapshot.anyOpen ? (
            <span className="absolute inset-0 animate-ping rounded-full bg-profit/45" />
          ) : null}
        </span>
        <Clock3 size={14} strokeWidth={1.75} aria-hidden />
        <span className="hidden max-w-36 truncate lg:inline">{snapshot.label}</span>
        <span className="hidden tabular-nums text-muted-foreground min-[390px]:inline">
          {utcClock(now)} UTC
        </span>
        <ChevronUp
          size={12}
          strokeWidth={1.75}
          aria-hidden
          className="text-muted-foreground transition-transform group-data-[popup-open]:rotate-180"
        />
      </MenuTrigger>
      <MenuPopup
        side="bottom"
        align="end"
        sideOffset={8}
        className="w-[min(35rem,calc(100vw-1rem))] overflow-hidden rounded-lg border-[#1b2d4a] bg-[#071225] p-0 text-slate-100 shadow-2xl"
      >
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="m-0 text-[11px] font-bold tracking-[0.28em] text-slate-300 uppercase">
              Trading Sessions
            </p>
            <span className="rounded-full border border-sky-500/45 bg-sky-500/15 px-3 py-1 text-[12px] font-bold tabular-nums text-sky-300">
              {utcClock(now)} UTC
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-500/40 bg-slate-900 text-[21px]"
            >
              {SESSION_FLAGS[activeSession.id]}
            </span>
            <div className="min-w-0">
              <p className="m-0 truncate text-[14px] font-bold text-slate-100">
                {activeSession.label}
              </p>
              <p className="mt-0.5 text-[12px] tabular-nums text-slate-400">
                {timezone === "UTC" ? "UTC" : timezoneLabel} · {zoneClock(now, userTimeZone)}
              </p>
            </div>
          </div>

          <label className="grid min-h-12 grid-cols-[minmax(0,1fr)_minmax(10rem,1fr)] items-center gap-3 rounded-md border border-slate-700/70 bg-[#0b172d] px-3 py-2">
            <span className="text-[12px] font-semibold text-slate-200">Display timezone</span>
            <span className="relative min-w-0">
              <select
                aria-label="Display timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value as TimezonePref)}
                className="h-8 w-full appearance-none border-0 bg-transparent pr-8 text-right text-[12px] font-semibold text-slate-100 outline-none"
              >
                {timezoneOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {displayTimezoneLabel(option.value, resolveDisplayTimezone(option.value), now)}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                strokeWidth={2}
                aria-hidden
                className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-slate-300"
              />
            </span>
          </label>

          <div className="rounded-md border border-slate-800 bg-[#0a1428] px-3 py-4">
            <div className="relative grid grid-cols-[5.75rem_minmax(0,1fr)] gap-x-3">
              <div
                aria-hidden
                className="pointer-events-none absolute top-[-0.35rem] right-0 bottom-7 left-[6.5rem] z-10"
              >
                <span
                  className="absolute top-0 bottom-0 w-px bg-slate-200/50"
                  style={{ left: `${marker}%` }}
                >
                  <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-slate-100" />
                </span>
              </div>
              {snapshot.sessions.map((session) => {
                const segments = timelineSegments(session);
                return (
                  <div key={session.id} className="contents">
                    <span
                      className={cn(
                        "flex min-w-0 items-center gap-2 py-1.5 text-[12px] font-bold",
                        session.open ? "text-emerald-300" : "text-slate-300",
                      )}
                    >
                      <span className="text-[16px]" aria-hidden>
                        {SESSION_FLAGS[session.id]}
                      </span>
                      <span className="truncate">{session.label}</span>
                    </span>
                    <span className="relative my-2 h-5 overflow-hidden rounded-full bg-slate-800/60">
                      {segments.map((segment, index) => (
                        <span
                          key={`${session.id}-${index}`}
                          className={cn(
                            "absolute top-1/2 h-3 -translate-y-1/2 rounded-full",
                            session.open
                              ? "bg-gradient-to-r from-emerald-200 via-cyan-300 to-sky-500"
                              : "bg-rose-500/20",
                          )}
                          style={{ left: `${segment.left}%`, width: `${segment.width}%` }}
                        />
                      ))}
                    </span>
                  </div>
                );
              })}
              <div className="col-start-2 mt-1 flex justify-between text-[12px] font-bold tabular-nums text-slate-300">
                <span>00</span>
                <span>06</span>
                <span>12</span>
                <span>18</span>
                <span>24</span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3 text-[12px] leading-relaxed text-slate-300">
            <span className="font-bold text-slate-100">
              {snapshot.nextTransition?.nextTransitionLabel ?? "No scheduled transition."}
            </span>
            {snapshot.overlapLabel ? (
              <>
                <span className="text-slate-500"> · </span>
                <span className="text-cyan-300">{snapshot.overlapLabel}</span>
              </>
            ) : null}
          </div>
        </div>
      </MenuPopup>
    </Menu>
  );
}
