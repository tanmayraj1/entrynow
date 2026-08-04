import type { LucideIcon } from "lucide-react";
import { inr } from "@/lib/money";
import { cn } from "@/lib/cn";

/**
 * The KPI tile both portals use.
 *
 * Money is formatted through `inr()` — never inline — so a ₹ figure carries
 * Indian digit grouping everywhere and the integer-paise representation never
 * leaks into a template string.
 */
export function StatCard({
  label,
  value,
  paise,
  hint,
  Icon,
  tone = "default",
  className,
}: {
  label: string;
  /** Pre-formatted value. Give `paise` instead for money. */
  value?: string | number;
  paise?: number;
  hint?: string;
  Icon?: LucideIcon;
  tone?: "default" | "positive" | "warning" | "danger";
  className?: string;
}) {
  const tones = {
    default: "text-ink",
    positive: "text-status-success-fg",
    warning: "text-status-warning-fg",
    danger: "text-danger",
  } as const;

  return (
    <div
      className={cn(
        "bg-surface border border-border rounded-[var(--radius-card)] p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11.5px] font-bold text-ink-muted uppercase tracking-wide">
          {label}
        </p>
        {Icon && (
          <Icon size={15} strokeWidth={2.2} className="text-ink-muted shrink-0" />
        )}
      </div>
      <p
        className={cn(
          "mt-1.5 text-[22px] font-extrabold leading-none tabular",
          tones[tone],
        )}
      >
        {paise !== undefined ? inr(paise) : (value ?? "—")}
      </p>
      {hint && (
        <p className="mt-1.5 text-[11.5px] font-semibold text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * A 14-day sales sparkline, drawn as bars.
 *
 * Deliberately not a charting library: this is fourteen numbers, and the
 * smallest chart dependency costs more transferred bytes than the entire
 * portal shell. Pure SVG also means it renders on the server with no
 * hydration.
 */
export function SalesSpark({
  series,
  className,
}: {
  series: { day: string; paise: number }[];
  className?: string;
}) {
  const max = Math.max(1, ...series.map((s) => s.paise));
  return (
    <div className={cn("flex items-end gap-1 h-[68px]", className)}>
      {series.map((s) => {
        const pct = (s.paise / max) * 100;
        return (
          <div
            key={s.day}
            className="flex-1 min-w-0 flex items-end h-full"
            title={`${s.day} — ${inr(s.paise)}`}
          >
            <div
              className={cn(
                "w-full rounded-t-[3px] transition-colors",
                s.paise > 0 ? "bg-primary" : "bg-divider",
              )}
              // A zero-revenue day still gets 3px so the axis reads as a row
              // of days rather than a gap the eye skips.
              style={{ height: `${Math.max(3, pct)}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}
