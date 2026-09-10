import type { Me } from "./api/auth";

const MENU_PERMISSIONS: Record<string, string> = {
  "/home": "menu.home",
  "/trades": "menu.trades",
  "/calendar": "menu.calendar",
  "/reports": "menu.reports",
  "/events": "menu.events",
  "/news": "menu.news",
  "/get-funded": "menu.get_funded",
  "/resources": "menu.resources",
  "/notes": "menu.notes",
  "/feedback": "menu.feedback",
  "/playbook": "menu.playbook",
  "/calculator": "menu.calculator",
  "/import": "menu.import",
  "/settings": "menu.settings",
};

export function can(me: Me | null | undefined, permission: string): boolean {
  if (!me) return true;
  if (me.is_admin) return true;
  const permissions = me.permissions ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function canOpenRoute(me: Me | null | undefined, route: string): boolean {
  const permission = MENU_PERMISSIONS[route];
  return permission ? can(me, permission) : true;
}
