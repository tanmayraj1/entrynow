import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Tabs, as links.
 *
 * The portal's tabs switch what the *server* queried — Bookings vs Attendees,
 * OPEN vs RESOLVED disputes — so each one is a URL, not client state. That
 * makes them shareable, back-button-correct, and renderable without shipping
 * any JavaScript.
 *
 * `aria-current="page"` rather than `role="tab"`: this is navigation, and
 * claiming the tab pattern would promise arrow-key roving focus and a
 * `tabpanel` relationship that a page navigation cannot honour.
 */

export interface TabItem {
  href: string;
  label: string;
  /** Rendered as a trailing count bubble. `0` still renders — an empty queue
   *  is information, and hiding it makes the tab look broken. */
  count?: number;
  active?: boolean;
}

export function Tabs({
  items,
  ariaLabel = "Sections",
  className,
}: {
  items: TabItem[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        // Scrolls itself on a phone rather than making the page scroll
        // sideways — six status tabs do not fit in 390px.
        "flex items-center gap-1 overflow-x-auto no-scrollbar",
        "border-b border-border",
        className,
      )}
    >
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "relative shrink-0 inline-flex items-center gap-2 px-3.5 py-2.5",
            "text-[13px] font-bold whitespace-nowrap transition-colors",
            "border-b-2 -mb-px",
            t.active
              ? "border-primary text-primary"
              : "border-transparent text-ink-muted hover:text-ink",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10.5px] font-extrabold tabular",
                t.active
                  ? "bg-primary-tint text-primary-dark"
                  : "bg-divider text-ink-muted",
              )}
            >
              {t.count}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** Section header used above a tab strip or a table. */
export function SectionHead({
  title,
  sub,
  action,
  className,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-3 mb-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-[19px] font-extrabold leading-tight">{title}</h1>
        {sub && (
          <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
            {sub}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
