import * as React from "react";
import { cn } from "@/lib/cn";
import { EmptyStateArt, GlyphMedallion } from "@/components/brand/illustrations";

/**
 * Data table for the dashboard surfaces (Bookings, Organizers, Ledger,
 * Payouts, Audit log). Numeric cells carry `.tabular` so ₹ amounts with Indian
 * grouping line up column-wise.
 *
 * The wrapper scrolls horizontally on its own so a wide table never makes the
 * page body scroll sideways on mobile.
 */

export function Table({
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn("w-full border-collapse text-[13px]", className)}
        {...props}
      />
    </div>
  );
}

export function Th({
  className,
  numeric,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "text-left font-bold text-[11.5px] uppercase tracking-wide",
        "text-ink-muted px-4 py-3 whitespace-nowrap",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  numeric,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        "px-4 py-3.5 align-middle font-semibold",
        numeric && "text-right tabular",
        className,
      )}
      {...props}
    />
  );
}

export function Tr({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-[var(--color-divider)] last:border-0",
        "hover:bg-[var(--color-divider)] transition-colors",
        className,
      )}
      {...props}
    />
  );
}

/** Never render a dead table. Spec I15's principle, applied everywhere. */
export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
  /** A lucide icon. Omit for the default illustrated stub. */
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12 gap-2.5">
      {icon ? <GlyphMedallion icon={icon} /> : <EmptyStateArt />}
      <p className="text-[15px] font-extrabold">{title}</p>
      {body && (
        <p className="text-[12.5px] text-ink-muted font-semibold max-w-sm">
          {body}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
