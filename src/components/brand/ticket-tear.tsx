import { cn } from "@/lib/cn";

/**
 * The loading state: a ticket tearing along its perforation.
 *
 * It is the one gesture this whole product is about — the stub comes away and
 * you are in — so it is worth more than a spinner, which says only "something
 * is happening" and could belong to any site on the internet.
 *
 * Drawn as inline SVG with CSS keyframes rather than a Lottie or a GIF: it is
 * about 2 KB, it renders on the server with no hydration, it stays crisp at
 * every size, and it takes its colours from the theme so the same component
 * works on the marketplace's light background and the scanner's dark one.
 *
 * **Motion honours `prefers-reduced-motion`.** The global rule in `globals.css`
 * collapses every animation to a single 0.001ms pass, which leaves both halves
 * at their `100%` keyframe — joined. So a reader with motion off sees a whole,
 * still ticket rather than a blank box or a frozen half-torn one.
 *
 * The SVG is sized in CSS rather than by `width`/`height` attributes so it can
 * step up at `md`. The tear animates by `translateX` in *user units* inside the
 * viewBox, so the gesture scales with the artwork instead of getting relatively
 * smaller as the ticket grows.
 */
export function TicketTear({
  label = "Loading",
  className,
}: {
  /** Announced to screen readers; also the visible caption. */
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col items-center gap-3.5 md:gap-4", className)}
      role="status"
      aria-live="polite"
    >
      <svg
        viewBox="0 0 132 82"
        fill="none"
        aria-hidden
        data-motion="ticket-tear"
        className="w-[148px] md:w-[212px] h-auto overflow-visible"
      >
        <defs>
          <linearGradient id="tt-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff7a1f" />
            <stop offset="52%" stopColor="#f2454e" />
            <stop offset="100%" stopColor="#ed2c63" />
          </linearGradient>
        </defs>

        {/* Left half — the part you keep. */}
        <g style={{ animation: "en-tear-left 1.9s ease-in-out infinite" }}>
          <path
            d="M4 14a6 6 0 0 1 6-6h52v10a5 5 0 0 0 0 10v10a5 5 0 0 0 0 10v10a5 5 0 0 0 0 10v6H10a6 6 0 0 1-6-6V14Z"
            fill="url(#tt-grad)"
          />
          <rect x="16" y="26" width="30" height="5" rx="2.5" fill="#fff" opacity=".92" />
          <rect x="16" y="38" width="20" height="5" rx="2.5" fill="#fff" opacity=".6" />
          <rect x="16" y="50" width="26" height="5" rx="2.5" fill="#fff" opacity=".38" />
        </g>

        {/* Right half — the stub the gate keeps. */}
        <g style={{ animation: "en-tear-right 1.9s ease-in-out infinite" }}>
          <path
            d="M70 8h52a6 6 0 0 1 6 6v54a6 6 0 0 1-6 6H70v-6a5 5 0 0 0 0-10V48a5 5 0 0 0 0-10V28a5 5 0 0 0 0-10V8Z"
            fill="#16264c"
          />
          <circle cx="99" cy="41" r="13" stroke="#fff" strokeOpacity=".22" strokeWidth="2" />
          <path
            d="m93 41 4.5 4.5L106 37"
            stroke="#2bd4a7"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>

      <span className="text-[13px] md:text-[15px] font-bold text-ink-muted text-center">
        {label}
      </span>
      <span className="sr-only">{label}, please wait</span>
    </div>
  );
}

/**
 * Full-bleed variant for a route-level `loading.tsx`.
 *
 * Centres in the viewport rather than in the content flow, because at this
 * moment there *is* no content to centre against — the page is what we are
 * waiting for. `100svh` (not `100vh`) is the small viewport height, so mobile
 * Safari's collapsing address bar cannot push the ticket below the fold and
 * introduce a scrollbar on a screen with nothing to scroll.
 *
 * `--tear-chrome` is how much room the surrounding shell already takes; it is
 * declared per shell in `globals.css` and defaults to 0 when the fallback has
 * replaced the whole page and there is no shell to sit under.
 */
export function TicketTearScreen({ label }: { label?: string }) {
  return (
    <div className="grid place-items-center px-6 py-16 min-h-[calc(100svh-var(--tear-chrome,0px))]">
      <TicketTear label={label} />
    </div>
  );
}
