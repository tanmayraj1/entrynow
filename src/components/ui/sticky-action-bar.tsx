"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * A bar that pins the page's primary action to the bottom of the screen —
 * but only while the real button is off-screen.
 *
 * ## Why "only when off-screen"
 *
 * The obvious version is a bar that is always there on mobile. The event page
 * shipped that, and it spent most of its life showing "0 tickets · ₹0" behind a
 * disabled button while eating 76px of a phone screen. A permanent bar is also
 * redundant the moment the real CTA scrolls into view — two identical buttons,
 * and the sticky one covering content for no reason.
 *
 * So the bar watches the inline button with an `IntersectionObserver` and
 * appears exactly when it leaves the viewport. The two are never on screen at
 * once, and on a short page the bar never appears at all.
 *
 * ## Why the inline button still has to exist
 *
 * Same reasoning as `src/components/brand/reveal.tsx`: **the real control ships
 * in the markup and works without JavaScript.** This bar is added by an effect,
 * so a chunk that 404s costs an enhancement rather than the ability to buy a
 * ticket. That rules out the tempting inversion — rendering *only* the sticky
 * bar and dropping the inline one.
 *
 * ## Geometry
 *
 * `bottom: var(--dock-h)`, never a hardcoded 56px. The mobile dock is
 * `content-box` plus `env(safe-area-inset-bottom)`, so on a notched phone it
 * stands ~34px taller than its nominal height; a fixed offset slid the old bar
 * underneath it and cut the button in half. `z-50` puts this above the dock's
 * `z-40` — if they ever overlap again, losing the top edge of the tab bar beats
 * losing the only way to pay.
 */
export function StickyActionBar({
  /** Ref to the inline CTA this bar mirrors. The bar shows when it is out of view. */
  watch,
  /** Suppresses the bar entirely — e.g. nothing selected yet. */
  active = true,
  left,
  children,
  className,
}: {
  watch: React.RefObject<HTMLElement | null>;
  active?: boolean;
  /** Context on the left — usually a count and a total. */
  left?: React.ReactNode;
  /** The action itself. */
  children: React.ReactNode;
  className?: string;
}) {
  const [anchorVisible, setAnchorVisible] = useState(true);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = watch.current;
    // No anchor to watch means we cannot tell whether the CTA is on screen, and
    // guessing "show it" would put a bar over a page that already has a visible
    // button. Stay hidden.
    if (!el) return;

    // How much of the bottom of the viewport is unusable: the sticky dock, plus
    // the height this bar would occupy if it appeared.
    //
    // Measured, not guessed. `--dock-h` is a `calc()` carrying
    // `env(safe-area-inset-bottom)`, so it cannot be parsed out of a string —
    // a throwaway element is the only way to make the browser resolve it. The
    // last time this offset was a hardcoded number the CTA ended up behind the
    // dock on notched phones.
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:absolute;top:0;left:0;height:var(--dock-h);visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);
    const dockPx = probe.getBoundingClientRect().height;
    probe.remove();
    // The bar's own height. A CTA sitting where the bar would be is not
    // "visible" in any useful sense — it is about to be covered.
    const BAR_PX = 76;
    const deadZone = Math.round(dockPx + BAR_PX);

    const io = new IntersectionObserver(
      ([entry]) => {
        // An anchor with no box is `display: none`, and a display-none element
        // never "intersects" — which would otherwise show the bar for an
        // instance that is not on screen at all.
        //
        // That is not hypothetical: the event page mounts the ticket picker
        // twice, `lg:hidden` for phones and `hidden lg:block` for the desktop
        // rail. At 1440 the phone copy is display-none, so its anchor read as
        // off-screen and it rendered a second, stray bar over a page whose
        // real CTA was sitting visible in the rail.
        const { width, height } = entry.boundingClientRect;
        const hasBox = width > 0 || height > 0;
        setAnchorVisible(!hasBox || entry.isIntersecting);
      },
      { rootMargin: `0px 0px -${deadZone}px 0px`, threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [watch]);

  const shown = active && !anchorVisible;

  // Entrance only, and skipped entirely under reduced motion — the bar simply
  // is or is not there, which is the honest version of the same information.
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }],
      { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
  }, [shown]);

  if (!shown) return null;

  return (
    <div
      ref={barRef}
      className={cn(
        "fixed bottom-[var(--dock-h)] inset-x-0 z-50",
        "bg-surface border-t border-border shadow-[0_-6px_20px_rgba(14,26,56,.10)]",
        "px-4 py-3 flex items-center justify-between gap-3",
        className,
      )}
    >
      {left ? <div className="min-w-0">{left}</div> : <span />}
      <div className="shrink-0">{children}</div>
    </div>
  );
}
