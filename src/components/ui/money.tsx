import { inr } from "@/lib/money";
import { cn } from "@/lib/cn";

/**
 * Renders a paise amount as ₹ with Indian digit grouping.
 *
 * Always use this instead of interpolating `inr()` inline — it attaches the
 * `.tabular` numerals the design requires in tables, and keeps a single place
 * to change if the currency ever varies by city.
 */
export function Money({
  paise,
  className,
  forceDecimals,
}: {
  paise: number;
  className?: string;
  forceDecimals?: boolean;
}) {
  return (
    <span className={cn("tabular", className)}>
      {inr(paise, { forceDecimals })}
    </span>
  );
}
