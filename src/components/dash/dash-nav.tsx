"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  BarChart3,
  Banknote,
  Calendar,
  FileClock,
  LayoutDashboard,
  LifeBuoy,
  MapPin,
  Megaphone,
  ScanLine,
  Settings,
  Settings2,
  ShieldAlert,
  Tag,
  Ticket,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Icons are named, not passed.
 *
 * A lucide icon is a *function*, and functions cannot cross the server →
 * client boundary — React throws "Functions cannot be passed directly to
 * Client Components". Both portal layouts are server components building this
 * nav, so the icon travels as a string key and is resolved here, inside the
 * client bundle.
 *
 * This is a compile-time-safe map: `DashNavItem.icon` is typed as its keys, so
 * a typo does not silently render a blank square.
 */
const ICONS = {
  approvals: BadgeCheck,
  announcements: Megaphone,
  audit: FileClock,
  config: Settings2,
  content: ShieldAlert,
  dashboard: BarChart3,
  disputes: LifeBuoy,
  events: Calendar,
  money: Banknote,
  overview: LayoutDashboard,
  promos: Tag,
  scanner: ScanLine,
  venue: MapPin,
  settings: Settings,
  ticket: Ticket,
  users: Users,
  wallet: Wallet,
} satisfies Record<string, LucideIcon>;

export type DashIconName = keyof typeof ICONS;

/**
 * The portal sidebar's link list.
 *
 * A client component only because it reads `usePathname` to mark the active
 * item; everything around it in `DashShell` stays a server component, so the
 * shell can await the session and the badge counts without shipping them.
 *
 * The admin rail paints on deep navy (`--color-sidebar`), the organizer rail on
 * white — one component, because both take their colours from
 * `--color-sidebar-ink` rather than hardcoding either.
 */

export interface DashNavItem {
  href: string;
  label: string;
  /** A key of `ICONS` above — a string, because a function cannot cross the
   *  server → client boundary. */
  icon: DashIconName;
  /** Match only this exact path. Used for a section root like `/admin`, which
   *  would otherwise light up on every child route. */
  exact?: boolean;
  /** A queue length. `0` renders nothing — a zero badge reads as a bug. */
  badge?: number;
}

export interface DashNavGroup {
  label?: string;
  items: DashNavItem[];
}

export function DashNav({
  groups,
  onDark = false,
}: {
  groups: DashNavGroup[];
  onDark?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-5" aria-label="Portal sections">
      {groups.map((group, gi) => (
        <div key={group.label ?? gi} className="flex flex-col gap-0.5">
          {group.label && (
            <p
              className={cn(
                "px-3 pb-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.08em]",
                onDark ? "text-white/45" : "text-ink-muted",
              )}
            >
              {group.label}
            </p>
          )}
          {group.items.map(({ href, label, icon, exact, badge }) => {
            const Icon = ICONS[icon];
            const active = exact
              ? pathname === href
              : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-[11px]",
                  "text-[13px] font-bold transition-colors",
                  onDark
                    ? active
                      ? "bg-white/12 text-white"
                      : "text-white/62 hover:bg-white/8 hover:text-white"
                    : active
                      ? "bg-primary-tint text-primary-dark"
                      : "text-body-soft hover:bg-divider hover:text-ink",
                )}
              >
                <Icon size={15} strokeWidth={2.2} className="shrink-0" />
                <span className="flex-1 truncate">{label}</span>
                {badge !== undefined && badge > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-extrabold tabular",
                      onDark
                        ? "bg-accent text-white"
                        : "bg-primary text-white",
                    )}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
