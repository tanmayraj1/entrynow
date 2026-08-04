"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Reveal on first view — once, never again.
 *
 * The motion budget for this product is deliberately small: entrance only, no
 * ambient loops. A browse page that keeps moving while someone is reading it
 * competes with the thing they came for, and on a mid-range Android it costs
 * battery for nothing.
 *
 * Implemented by mutating the element's own inline style rather than through
 * React state. Two reasons, both load-bearing:
 *
 *   1. **The markup ships visible.** The hidden state is applied by an effect,
 *      so if the JS never arrives — a chunk 404s, an old browser — the page is
 *      readable rather than a grid of blank rectangles. A state-driven version
 *      has to render hidden first, and that failure mode is silent.
 *   2. No re-render. A rail of twelve of these would otherwise re-render
 *      twelve components twice each to move some pixels.
 *
 * `prefers-reduced-motion` skips the whole thing, and the transition is
 * stripped once it finishes so it can never interfere with hover transforms
 * on the content inside.
 */
export function Reveal({
  children,
  delayMs = 0,
  className,
}: {
  children: React.ReactNode;
  /** Stagger within a rail. Keep the whole rail under ~400ms. */
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const hide = () => {
      el.style.opacity = "0";
      el.style.transform = "translateY(10px) scale(.985)";
    };
    const show = () => {
      el.style.transition =
        "opacity 520ms cubic-bezier(.16,1,.3,1), transform 520ms cubic-bezier(.16,1,.3,1)";
      el.style.transitionDelay = `${delayMs}ms`;
      el.style.opacity = "";
      el.style.transform = "";
      el.addEventListener(
        "transitionend",
        () => {
          el.style.transition = "";
          el.style.transitionDelay = "";
        },
        { once: true },
      );
    };

    // Already on screen at mount — reveal without waiting for a scroll that
    // may never come.
    if (el.getBoundingClientRect().top < window.innerHeight) {
      hide();
      frame = requestAnimationFrame(() => requestAnimationFrame(show));
      return () => cancelAnimationFrame(frame);
    }

    hide();
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        show();
        io.disconnect();
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [delayMs]);

  return (
    <div ref={ref} className={cn("will-change-[opacity,transform]", className)}>
      {children}
    </div>
  );
}
