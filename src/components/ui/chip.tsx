import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Pill chip — filter facets, category tags, interest multiselect.
 * Transcribed from the design: 11.5px / weight 700 / padding 7px 13px /
 * radius 999, tinted when unselected, solid primary when selected.
 */
export interface ChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  as?: "button" | "span";
}

export function Chip({
  className,
  selected,
  as = "button",
  children,
  ...props
}: ChipProps) {
  const classes = cn(
    "inline-flex items-center gap-1.5 rounded-full whitespace-nowrap",
    "text-[11.5px] font-bold px-3.5 py-[7px] transition-colors duration-150",
    selected
      ? "bg-primary text-white"
      : "bg-primary-tint text-primary-dark hover:bg-selected-bg",
    className,
  );

  if (as === "span") {
    return <span className={classes}>{children}</span>;
  }
  return (
    <button
      type="button"
      data-hit
      aria-pressed={selected}
      className={cn(classes, "cursor-pointer")}
      {...props}
    >
      {children}
    </button>
  );
}
