import { Link, useRouterState } from "@tanstack/react-router";
import { PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useAppUpdate } from "@/lib/appUpdate";
import { useFlexSyncAttention } from "@/lib/hooks/useFlexSync";
import { cn } from "@/lib/cn";
import { useDisplayPrefs } from "@/lib/displayPrefs";
import { navLabel } from "@/lib/locale";
import { isRouteActive, MAIN_ROUTES, PRIMARY_NAV, SECONDARY_NAV } from "@/lib/navItems";
import { useUI } from "@/lib/ui";
import { useLocale } from "@/i18n";
import { AppLogo } from "./AppLogo";
import { CreateMenu } from "./CreateMenu";
import { RailTooltip } from "./RailTooltip";
import { ToolsPopover } from "./ToolsPopover";

function RailLink({
  to,
  label,
  icon: Icon,
  active,
  dot,
  dotTone = "primary",
  itemRef,
  collapsed,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  /** Quiet attention dot (e.g. an update is available — detail lives on the page). */
  dot?: boolean;
  /** destructive marks something broken (a failing sync), primary something new. */
  dotTone?: "primary" | "destructive";
  itemRef?: (el: HTMLAnchorElement | null) => void;
  collapsed: boolean;
}) {
  return (
    <Link
      ref={itemRef}
      to={to}
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-9 items-center rounded-md no-underline",
        collapsed ? "w-9 justify-center pointer-coarse:size-11" : "w-full justify-start gap-3 px-3",
        "transition-[background-color,color,transform] duration-150 ease-out",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "motion-reduce:transition-none",
        // Active carries no fill — the left pip and the primary icon color mark
        // the route; hover stays a surface change on every item alike.
        active
          ? "text-primary hover:bg-accent"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon
        size={20}
        strokeWidth={1.75}
        className={cn(
          "transition-transform duration-150 ease-out motion-reduce:transition-none",
          active ? "scale-105" : "group-hover:scale-105",
        )}
      />
      {!collapsed ? (
        <span className="min-w-0 truncate text-[13px] font-medium">{label}</span>
      ) : null}
      {dot ? (
        <span
          aria-hidden
          className={cn(
            "absolute top-1.5 right-1.5 size-1.5 rounded-full",
            dotTone === "destructive" ? "bg-destructive" : "bg-primary",
          )}
        />
      ) : null}
      {collapsed ? <RailTooltip label={label} /> : null}
    </Link>
  );
}

export function AppNav() {
  const { locale } = useLocale();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const label = (key: Parameters<typeof navLabel>[1]) => navLabel(locale, key);
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const toggleSidebar = useUI((s) => s.toggleSidebar);

  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [pip, setPip] = useState({ top: 0, ready: false });

  const activeMain = MAIN_ROUTES.find((r) => isRouteActive(pathname, r.to));
  const settingsActive = isRouteActive(pathname, "/settings");
  // Non-actionable update states (web/API behind a release, deployment
  // mismatch) don't toast — they show as a quiet dot here; Settings → About
  // carries the detail. The waiting-SW reload keeps the toast.
  const updateAttention = useAppUpdate(
    (s) => s.swReady || s.webBehind || s.apiBehind || s.versionMismatch,
  );
  const updateNotices = useDisplayPrefs((s) => s.updateNotices);
  // A failing broker sync is otherwise invisible until someone opens the right
  // modal — a silently dead sync looks identical to a quiet trading week.
  const syncAttention = useFlexSyncAttention();

  useLayoutEffect(() => {
    const list = listRef.current;
    const activeEl = activeMain ? itemRefs.current.get(activeMain.to) : null;
    if (!list || !activeEl) {
      setPip((p) => ({ ...p, ready: false }));
      return;
    }

    const measure = () => {
      setPip({
        top: activeEl.offsetTop + activeEl.offsetHeight / 2 - 6,
        ready: true,
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    ro.observe(activeEl);
    return () => ro.disconnect();
  }, [activeMain, pathname]);

  return (
    <nav
      aria-label="Main navigation"
      data-collapsed={collapsed}
      className={cn(
        "relative z-[2] hidden h-full shrink-0 flex-col border-r border-border/60 bg-background md:flex",
        "transition-[width] duration-200 ease-out motion-reduce:transition-none",
        collapsed ? "w-[52px]" : "w-[212px]",
      )}
    >
      {/* Logo band — same 52px + border as HeaderBar */}
      <div
        className={cn(
          "flex h-[52px] w-full shrink-0 items-center bg-background px-2",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        <AppLogo
          size={24}
          className="transition-transform duration-150 ease-out hover:scale-105 motion-reduce:transition-none"
        />
        {!collapsed ? (
          <span className="min-w-0 flex-1 truncate px-3 text-[13px] font-semibold text-foreground">
            TraderMemos
          </span>
        ) : null}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? "Expand sidebar" : "Minimise sidebar"}
          title={collapsed ? "Expand sidebar" : "Minimise sidebar"}
          className={cn(
            "group relative flex size-9 items-center justify-center rounded-md text-muted-foreground",
            "transition-colors hover:bg-accent hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            collapsed ? "absolute top-2 right-[-2.25rem] border border-border bg-background shadow-sm" : "",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen size={18} strokeWidth={1.75} aria-hidden />
          ) : (
            <PanelLeftClose size={18} strokeWidth={1.75} aria-hidden />
          )}
          {collapsed ? <RailTooltip label="Expand sidebar" /> : null}
        </button>
      </div>

      <div
        ref={listRef}
        className={cn(
          "relative flex flex-1 flex-col gap-0.5 py-2",
          collapsed ? "items-center" : "items-stretch px-2",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute left-0 h-3 w-0.5 rounded-full bg-primary",
            "shadow-[0_0_8px_color-mix(in oklch, var(--primary) 35%, transparent)]",
            "transition-[top,opacity] duration-[220ms] ease-out",
            "motion-reduce:transition-none",
            pip.ready ? "opacity-100" : "opacity-0",
          )}
          style={{ top: pip.top }}
        />

        {PRIMARY_NAV.map((item) => (
          <RailLink
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={label(item.labelKey)}
            active={isRouteActive(pathname, item.to)}
            collapsed={collapsed}
            itemRef={(el) => {
              if (el) itemRefs.current.set(item.to, el);
              else itemRefs.current.delete(item.to);
            }}
          />
        ))}

        <div
          className={cn(
            "my-2 h-px origin-center scale-x-100 bg-border transition-transform duration-150",
            collapsed ? "w-4" : "w-full",
          )}
          aria-hidden
        />

        {SECONDARY_NAV.map((item) => (
          <RailLink
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={label(item.labelKey)}
            active={isRouteActive(pathname, item.to)}
            collapsed={collapsed}
            itemRef={(el) => {
              if (el) itemRefs.current.set(item.to, el);
              else itemRefs.current.delete(item.to);
            }}
          />
        ))}
      </div>

      <div className={cn("flex w-full flex-col gap-0.5 py-2", collapsed ? "items-center" : "px-2")}>
        {/* Quick-add anchors the bottom cluster: the one action among the
            rail's destinations, kept off the scrolling route list. */}
        <CreateMenu variant="rail" />
        <div className={cn("my-1 h-px bg-border", collapsed ? "w-4" : "w-full")} aria-hidden />

        <ToolsPopover variant="rail" />

        <div className="relative">
          {settingsActive && (
            <span
              aria-hidden
              className="absolute top-1/2 left-[-6px] h-3 w-0.5 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_8px_color-mix(in oklch, var(--primary) 35%, transparent)]"
            />
          )}
          <RailLink
            to="/settings"
            label={label("settings")}
            icon={Settings}
            active={settingsActive}
            dot={syncAttention || (updateNotices && updateAttention)}
            dotTone={syncAttention ? "destructive" : "primary"}
            collapsed={collapsed}
          />
        </div>
      </div>
    </nav>
  );
}
