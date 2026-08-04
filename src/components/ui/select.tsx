import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Native `<select>`, styled to match `Input`.
 *
 * Native rather than a listbox rebuild: the portals are dense forms, and a
 * native select gets keyboard type-ahead, the platform's own touch picker on a
 * phone, and form submission without JavaScript — all of which a div-based
 * replacement would have to reimplement, badly. The only thing native cannot
 * style is the arrow, so we hide it and draw our own.
 */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <span className="relative block">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "w-full appearance-none bg-surface text-ink",
          "border rounded-[var(--radius-input)] pl-3.5 pr-9 py-2.5",
          "text-[13.5px] font-semibold transition-colors outline-none cursor-pointer",
          "disabled:opacity-60 disabled:cursor-not-allowed",
          invalid
            ? "border-danger focus:border-danger"
            : "border-border focus:border-primary",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={15}
        strokeWidth={2.4}
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
      />
    </span>
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full bg-surface text-ink placeholder:text-ink-muted",
        "border rounded-[var(--radius-input)] px-3.5 py-2.5",
        "text-[13.5px] font-semibold leading-relaxed",
        "transition-colors outline-none resize-y min-h-[80px]",
        invalid
          ? "border-danger focus:border-danger"
          : "border-border focus:border-primary",
        className,
      )}
      {...props}
    />
  );
});
