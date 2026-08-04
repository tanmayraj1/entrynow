import * as React from "react";
import { cn } from "@/lib/cn";

/** Inputs use the 11–13px radius band from the design tokens. */
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full bg-surface text-ink placeholder:text-ink-muted",
        "border rounded-[var(--radius-input)] px-3.5 py-2.5 text-[13.5px] font-semibold",
        "transition-colors outline-none",
        invalid
          ? "border-danger focus:border-danger"
          : "border-border focus:border-primary",
        className,
      )}
      {...props}
    />
  );
});

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[12px] font-bold text-body-soft">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {error ? (
        <span className="text-[11.5px] font-semibold text-danger">{error}</span>
      ) : hint ? (
        <span className="text-[11.5px] font-semibold text-ink-muted">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
