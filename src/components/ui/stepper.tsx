"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Quantity stepper — the tier picker on the event page and booking step 1.
 *
 * `max` is the server's remaining availability for the tier, already reduced by
 * the per-user limit. The control never lets the user compose a request the
 * server would reject, but the server still re-validates (invariant I4) — this
 * is affordance, not enforcement.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 10,
  disabled,
  className,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  const canDec = !disabled && value > min;
  const canInc = !disabled && value < max;

  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <button
        type="button"
        data-hit
        disabled={!canDec}
        onClick={() => onChange(value - 1)}
        aria-label={label ? `Remove one ${label}` : "Decrease quantity"}
        className={cn(
          "size-7 rounded-full border flex items-center justify-center transition-colors",
          canDec
            ? "border-border-strong bg-surface text-ink hover:border-primary hover:text-primary cursor-pointer"
            : "border-border text-ink-muted opacity-40 cursor-not-allowed",
        )}
      >
        <Minus size={14} strokeWidth={2.4} />
      </button>

      <b className="tabular min-w-5 text-center text-[14px]" aria-live="polite">
        {value}
      </b>

      <button
        type="button"
        data-hit
        disabled={!canInc}
        onClick={() => onChange(value + 1)}
        aria-label={label ? `Add one ${label}` : "Increase quantity"}
        className={cn(
          "size-7 rounded-full flex items-center justify-center transition-colors",
          canInc
            ? "bg-primary text-white hover:bg-primary-dark cursor-pointer"
            : "bg-border text-ink-muted opacity-40 cursor-not-allowed",
        )}
      >
        <Plus size={14} strokeWidth={2.4} />
      </button>
    </div>
  );
}
