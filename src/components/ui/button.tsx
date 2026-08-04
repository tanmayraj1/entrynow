import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Buttons are pills (radius 999) in every surface. Colour comes from the
 * themed `--color-primary`, so the same component renders teal in the
 * marketplace, pink in the dashboards and mint in the scanner.
 */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-white shadow-[var(--shadow-cta-themed)] hover:bg-primary-dark",
  secondary:
    "bg-primary-tint text-primary-dark hover:bg-selected-bg border border-transparent",
  outline:
    "bg-surface text-ink border border-border-strong hover:border-primary hover:text-primary",
  ghost: "bg-transparent text-ink-muted hover:text-ink hover:bg-primary-tint",
  danger: "bg-danger text-white hover:bg-danger-dark",
};

const sizes: Record<Size, string> = {
  sm: "text-[12.5px] px-3.5 py-2 gap-1.5",
  md: "text-[13.5px] px-5 py-2.5 gap-2",
  lg: "text-[14px] px-8 py-3.5 gap-2",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = "primary",
      size = "md",
      loading,
      fullWidth,
      disabled,
      children,
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        data-hit
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center rounded-full font-extrabold",
          "transition-colors duration-150 cursor-pointer",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          variants[variant],
          sizes[size],
          fullWidth && "w-full",
          className,
        )}
        {...props}
      >
        {loading && (
          <span
            aria-hidden
            className="size-3.5 rounded-full border-2 border-current border-t-transparent"
            style={{ animation: "se-spin .6s linear infinite" }}
          />
        )}
        {children}
      </button>
    );
  },
);
