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
 * **Motion is entrance-only and honours `prefers-reduced-motion`.** The
 * reduced-motion rule in `globals.css` collapses every animation globally, and
 * that is the correct outcome here: the two halves settle in their parted
 * position and the ticket still reads as a ticket. Nobody is left staring at a
 * blank box because they turned animation off.
 */
export function TicketTear({
  label = "Loading",
  size = 132,
  className,
}: {
  /** Announced to screen readers; the visible caption is separate. */
  label?: string;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col items-center gap-3", className)}
      role="status"
      aria-live="polite"
    >
      <svg
        width={size}
        height={size * 0.62}
        viewBox="0 0 132 82"
        fill="none"
        aria-hidden
        data-motion="ticket-tear"
        className="overflow-visible"
      >
        <defs>
          <linearGradient id="tt-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff7a1f" />
            <stop offset="52%" stopColor="#f2454e" />
            <stop offset="100%" stopColor="#ed2c63" />
          </linearGradient>
        </defs>

        {/* Left half — the part you keep. Carries the "EN" mark. */}
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

      <span className="text-[12.5px] font-bold text-ink-muted">{label}</span>
      <span className="sr-only">{label}, please wait</span>
    </div>
  );
}

/**
 * Full-bleed variant for a route-level `loading.tsx`.
 *
 * Centres in the viewport minus the header, so the ticket lands where the
 * content will, rather than pinned to the top of the page.
 */
export function TicketTearScreen({ label }: { label?: string }) {
  return (
    <div className="min-h-[60vh] grid place-items-center px-6 py-20">
      <TicketTear label={label} />
    </div>
  );
}
