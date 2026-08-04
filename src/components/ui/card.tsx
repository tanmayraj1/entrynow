import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Surface container. `hoverable` applies the design's card-hover spec —
 * translateY(-4px) + shadow over 180ms — which `.se-lift` disables under
 * prefers-reduced-motion.
 */
export function Card({
  className,
  hoverable,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { hoverable?: boolean }) {
  return (
    <div
      className={cn(
        "bg-surface border border-border rounded-[var(--radius-card)] overflow-hidden",
        hoverable && "se-lift",
        className,
      )}
      {...props}
    />
  );
}

export function CardBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-[15px] font-extrabold leading-snug", className)}
      {...props}
    />
  );
}

export function CardMeta({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-[11.5px] font-semibold text-ink-muted", className)}
      {...props}
    />
  );
}
