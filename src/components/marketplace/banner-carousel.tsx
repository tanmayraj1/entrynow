"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export interface BannerSlide {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  gradient: string | null;
  href: string | null;
}

/**
 * The promotional banner carousel — now the first thing on the home page.
 *
 * It replaced a photo hero carrying a headline and a search card; search moved
 * into the header, so promoted content leads instead of decoration.
 *
 * Structured the way `reveal.tsx` taught us to build enhancements: **the
 * markup works with no JavaScript at all.** The slides are a plain
 * `overflow-x-auto` strip with scroll-snap, so a dead chunk leaves a swipeable
 * row of banners rather than a blank band. The effect adds what genuinely
 * needs JS: dots, arrows, and auto-advance.
 *
 * Auto-advance is the one sanctioned exception to the house "motion is
 * entrance-only" rule — the owner asked for a rotating banner explicitly.
 * The exception is fenced in four ways: it never runs with a single slide,
 * it pauses while the pointer is over or down on the strip, it pauses while
 * the tab is hidden, and it is disabled outright under
 * `prefers-reduced-motion` (swipe, dots and arrows still work — the *content*
 * is never gated, only the unrequested motion).
 *
 * Scroll position is the single source of truth. The dots derive from a
 * scroll listener rather than from the autoplay index, so a hand-swipe and an
 * auto-advance can never disagree about which slide is active.
 */
export function BannerCarousel({
  banners,
  citySlug,
}: {
  banners: BannerSlide[];
  citySlug: string;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [enhanced, setEnhanced] = useState(false);
  // Refs, not state: pause flags change on pointer events and must not
  // re-render the strip or re-arm the interval.
  const paused = useRef(false);

  const count = banners.length;

  // Dots + arrows only exist once JS has proven it is running. Behind a
  // frame so the no-JS markup and the first client paint agree (and to keep
  // the set out of the effect body per the hooks lint).
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEnhanced(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Which slide is on screen — derived from scroll, the one source of truth.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const onScroll = () => {
      const w = strip.clientWidth;
      if (w > 0) setActive(Math.round(strip.scrollLeft / w));
    };
    strip.addEventListener("scroll", onScroll, { passive: true });
    return () => strip.removeEventListener("scroll", onScroll);
  }, []);

  const goTo = (i: number) => {
    const strip = stripRef.current;
    if (!strip) return;
    const next = ((i % count) + count) % count;
    strip.scrollTo({ left: next * strip.clientWidth, behavior: "smooth" });
  };

  // Auto-advance, with all four fences.
  useEffect(() => {
    if (count <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const tick = setInterval(() => {
      if (paused.current || document.hidden) return;
      const strip = stripRef.current;
      if (!strip) return;
      const w = strip.clientWidth;
      if (w === 0) return;
      const current = Math.round(strip.scrollLeft / w);
      strip.scrollTo({
        left: ((current + 1) % count) * w,
        behavior: "smooth",
      });
    }, 5000);
    return () => clearInterval(tick);
  }, [count]);

  if (count === 0) return null;

  return (
    <section
      aria-label="Offers and announcements"
      // Full-bleed on a phone, guttered from `md`. A 32px gutter costs a
      // narrow screen ~8% of the banner's width and makes the page's lead
      // element read as a widget; edge-to-edge is what makes it a hero.
      className="relative px-0 md:px-6 lg:px-12 mt-0 md:mt-5"
      onPointerEnter={() => (paused.current = true)}
      onPointerLeave={() => (paused.current = false)}
      onPointerDown={() => (paused.current = true)}
      onPointerUp={() => (paused.current = false)}
    >
      <div
        ref={stripRef}
        className={cn(
          "flex overflow-x-auto snap-x snap-mandatory",
          // Square corners while full-bleed: a rounded corner against the
          // screen edge shows a sliver of page background and reads as a
          // rendering fault rather than a radius.
          "rounded-none md:rounded-[20px]",
          // Scrollbar hidden only once JS is live — without JS it is the
          // only affordance that the strip scrolls.
          enhanced && "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {banners.map((b) => {
          // Same rule as the old Offers grid: a stored path is relative to
          // the current city, so a banner can never navigate a visitor into
          // another city; absolute URLs pass through.
          const href = !b.href
            ? `/${citySlug}/events`
            : b.href.startsWith("http")
              ? b.href
              : `/${citySlug}/${b.href.replace(/^\//, "")}`;
          return (
            <Link
              key={b.id}
              href={href}
              className={cn(
                "relative w-full shrink-0 snap-center overflow-hidden text-white",
                // Sized by ratio, not fixed heights, so promo artwork crops
                // predictably at every width. 2:1 on a phone — squarer than
                // the desktop band because a narrow screen has the vertical
                // room to spare and none of the horizontal — widening to 3:1
                // on a desktop where a tall band would push the page's actual
                // content off-screen. Artwork should be authored at 1800×600.
                "aspect-[2/1] md:aspect-[1000/320] lg:aspect-[3/1]",
                "max-h-[420px]",
              )}
              style={
                b.imageUrl
                  ? undefined
                  : { background: `var(--gradient-${b.gradient ?? "navratri"})` }
              }
            >
              {b.imageUrl && (
                <>
                  <Image
                    src={b.imageUrl}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 1200px"
                    className="object-cover"
                  />
                  {/* Title and subtitle sit on an unknown photograph, so they
                      bring their own contrast. */}
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,18,38,.72)_0%,rgba(10,18,38,.35)_55%,rgba(10,18,38,.08)_100%)]"
                  />
                </>
              )}
              <div className="relative h-full flex flex-col justify-center gap-1.5 px-7 md:px-10 max-w-[560px]">
                <span className="text-[11px] md:text-[12px] font-extrabold uppercase tracking-[0.1em] opacity-90">
                  {b.title}
                </span>
                <span className="text-[20px] md:text-[28px] font-extrabold leading-tight tracking-[-0.4px]">
                  {b.subtitle ?? b.title}
                </span>
                <span className="mt-1.5 inline-flex self-start items-center text-[12.5px] font-bold bg-white/[.16] border border-white/35 rounded-full px-3.5 py-1.5 backdrop-blur-[4px]">
                  Grab the offer →
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {enhanced && count > 1 && (
        <>
          {/* Chevrons — desktop only; on touch the strip itself swipes. */}
          <button
            type="button"
            aria-label="Previous banner"
            onClick={() => goTo(active - 1)}
            className="hidden md:grid place-items-center absolute left-8 lg:left-14 top-1/2 -translate-y-1/2 size-9 rounded-full bg-white/90 text-ink shadow-[var(--shadow-e2)] hover:bg-white cursor-pointer"
          >
            <ChevronLeft size={18} strokeWidth={2.6} />
          </button>
          <button
            type="button"
            aria-label="Next banner"
            onClick={() => goTo(active + 1)}
            className="hidden md:grid place-items-center absolute right-8 lg:right-14 top-1/2 -translate-y-1/2 size-9 rounded-full bg-white/90 text-ink shadow-[var(--shadow-e2)] hover:bg-white cursor-pointer"
          >
            <ChevronRight size={18} strokeWidth={2.6} />
          </button>

          {/* Bottom-*right*, not centred, and each dot is a transparent 44px
              box around a small pill.

              Two constraints shape this. Globals give every `button` a 44px
              floor on a coarse pointer, and `min-height` beats a utility's
              `height` — so a `h-1.5` dot silently inflated into a 44px white
              disc on every phone. Painting the pill on an inner span keeps the
              touch target honest and the mark small.

              That 44px box is invisible and sits over the banner, which is one
              big link, so it has to go where nothing is: the copy and the
              "Grab the offer" chip live at the left, so the dots take the far
              corner rather than the centre they would otherwise swallow. */}
          <div className="absolute bottom-0 right-1 md:right-8 lg:right-14 flex">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={`Go to banner ${i + 1}`}
                aria-current={i === active}
                onClick={() => goTo(i)}
                className={cn(
                  "grid place-items-center h-11 w-6 cursor-pointer",
                  // The 44px floor also applies to *width*, which would space
                  // the pills 44px apart and stop them reading as one control.
                  // Overlapping the boxes pulls the pitch back to 26px while
                  // every target stays 44px tall and 44px wide; the overlap is
                  // 9px of a neighbour's edge, never its pill.
                  "[@media(pointer:coarse)]:-mx-[9px]",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === active
                      ? "w-5 bg-white"
                      : "w-1.5 bg-white/60 ring-1 ring-black/10",
                  )}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
