import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Checkbox and Toggle.
 *
 * Both keep a real `<input>` in the DOM and hide it visually rather than
 * replacing it with a `role="checkbox"` div. That single decision buys the
 * label click target, the focus ring, the form value on submit, and every
 * assistive technology's native handling — none of which is worth
 * reimplementing for a tick mark.
 *
 * `peer` + `peer-checked:` drives the painted box off the real input's state,
 * so the visual and the form value cannot drift apart.
 */

export const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
    label?: React.ReactNode;
    hint?: string;
  }
>(function Checkbox({ className, label, hint, disabled, ...props }, ref) {
  return (
    <label
      className={cn(
        "flex items-start gap-2.5 cursor-pointer select-none",
        disabled && "opacity-60 cursor-not-allowed",
        className,
      )}
    >
      <span className="relative flex shrink-0 mt-px">
        <input
          ref={ref}
          type="checkbox"
          disabled={disabled}
          className="peer sr-only"
          {...props}
        />
        <span
          aria-hidden
          className={cn(
            "size-[17px] rounded-[5px] border-2 border-border-strong bg-surface",
            "grid place-items-center transition-colors",
            "peer-checked:bg-primary peer-checked:border-primary",
            "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
            "peer-focus-visible:outline-primary",
            // The tick is a DESCENDANT of this span, not a sibling of the
            // input, so a bare `peer-checked:opacity-100` on it would compile
            // to `.peer:checked ~ .tick` and never match. Reach down from the
            // sibling that does match.
            "peer-checked:[&>svg]:opacity-100",
          )}
        >
          <Check
            size={11}
            strokeWidth={3.4}
            className="text-white opacity-0 transition-opacity"
          />
        </span>
      </span>
      {(label || hint) && (
        <span className="flex flex-col gap-0.5 leading-tight">
          {label && (
            <span className="text-[13px] font-bold text-ink">{label}</span>
          )}
          {hint && (
            <span className="text-[11.5px] font-semibold text-ink-muted">
              {hint}
            </span>
          )}
        </span>
      )}
    </label>
  );
});

/**
 * A checkbox that reads as a switch.
 *
 * `role="switch"` on the input, not on a wrapper — a screen reader announces
 * "on/off" instead of "checked", which is what the control actually means for
 * settings like "transfers allowed".
 */
export const Toggle = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
    label?: React.ReactNode;
    hint?: string;
  }
>(function Toggle({ className, label, hint, disabled, ...props }, ref) {
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-4 cursor-pointer select-none",
        disabled && "opacity-60 cursor-not-allowed",
        className,
      )}
    >
      {(label || hint) && (
        <span className="flex flex-col gap-0.5 leading-tight">
          {label && (
            <span className="text-[13px] font-bold text-ink">{label}</span>
          )}
          {hint && (
            <span className="text-[11.5px] font-semibold text-ink-muted">
              {hint}
            </span>
          )}
        </span>
      )}
      <span className="relative flex shrink-0">
        <input
          ref={ref}
          type="checkbox"
          role="switch"
          disabled={disabled}
          className="peer sr-only"
          {...props}
        />
        <span
          aria-hidden
          className={cn(
            "block w-[38px] h-[22px] rounded-full bg-border-strong",
            "transition-colors peer-checked:bg-primary",
            "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
            "peer-focus-visible:outline-primary",
          )}
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute left-[3px] top-[3px]",
            "size-4 rounded-full bg-white shadow-[var(--shadow-e1)]",
            "transition-transform duration-150 peer-checked:translate-x-4",
          )}
        />
      </span>
    </label>
  );
});
