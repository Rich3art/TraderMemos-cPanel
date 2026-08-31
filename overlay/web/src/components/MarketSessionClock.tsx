import { ChevronUp, Clock3, Radio } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { intlLocale } from "@/lib/locale";
import { marketSessionSnapshot } from "@/lib/marketSessions";
import { Menu, MenuPopup, MenuTrigger } from "./ui/menu";

function utcClock(now: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
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
  const snapshot = useMemo(() => marketSessionSnapshot(now, locale), [now, locale]);
  const next = snapshot.nextTransition?.nextTransitionLabel ?? "";

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
      <MenuPopup side="bottom" align="end" sideOffset={8} className="w-78 p-0">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className={cn(
                "mt-1 flex size-9 shrink-0 items-center justify-center rounded-full border",
                snapshot.anyOpen
                  ? "border-profit/25 bg-profit/10 text-profit"
                  : "border-border bg-muted text-muted-foreground",
              )}
            >
              <Radio size={15} strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="m-0 text-[15px] font-semibold text-foreground">{snapshot.label}</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{next}</p>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/25 p-3">
            <div className="mb-3 flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
              <span>00</span>
              <span>06</span>
              <span>12</span>
              <span>18</span>
              <span>24</span>
            </div>
            <div className="flex flex-col gap-3">
              {snapshot.sessions.map((session) => (
                <div
                  key={session.id}
                  className="grid grid-cols-[4.75rem_minmax(0,1fr)_3.25rem] items-center gap-3"
                >
                  <span className="truncate text-[12px] text-muted-foreground">
                    {session.label}
                  </span>
                  <span className="relative h-2 overflow-hidden rounded-full bg-accent">
                    <span
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full",
                        session.open ? "bg-profit/70" : "bg-muted-foreground/25",
                      )}
                      style={{ width: `${session.open ? Math.max(session.progress * 100, 8) : 18}%` }}
                    />
                  </span>
                  <span className="text-right text-[12px] tabular-nums text-muted-foreground">
                    {session.localTime}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </MenuPopup>
    </Menu>
  );
}
