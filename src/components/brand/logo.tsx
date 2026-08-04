import { cn } from "@/lib/cn";

/**
 * Entry Now — the brand lockup.
 *
 * Drawn as inline SVG rather than shipped as a raster: it stays crisp at every
 * size, costs no extra request, and the two brand colours come from the CSS
 * custom properties so a single definition serves the header, the dark footer
 * and the scanner. It deliberately does NOT use `--color-primary`, which
 * changes per theme — a logo that turns navy inside the admin portal is not a
 * logo.
 *
 * Three lockups, because a horizontal wordmark cannot serve every slot:
 *   horizontal — the default. Header, footer, e-mail, invoices.
 *   mark       — square ticket only. Mobile header, favicon, avatar slots.
 *   stacked    — mark over wordmark. Auth screens, splash, print.
 */

export type LogoVariant = "horizontal" | "mark" | "stacked";

const SIZES = {
  sm: { mark: 26, word: 15, gap: "gap-2" },
  md: { mark: 32, word: 18, gap: "gap-2.5" },
  lg: { mark: 44, word: 25, gap: "gap-3" },
} as const;

export function Logo({
  variant = "horizontal",
  size = "md",
  /** On navy or photographic backgrounds the navy half must go white. */
  onDark = false,
  className,
}: {
  variant?: LogoVariant;
  size?: keyof typeof SIZES;
  onDark?: boolean;
  className?: string;
}) {
  const s = SIZES[size];

  if (variant === "mark") {
    return (
      <span className={cn("inline-flex", className)}>
        <TicketMark size={s.mark} onDark={onDark} />
        <span className="sr-only">Entry Now</span>
      </span>
    );
  }

  if (variant === "stacked") {
    return (
      <span className={cn("inline-flex flex-col items-center gap-2", className)}>
        <TicketMark size={s.mark * 1.6} onDark={onDark} />
        <Wordmark size={s.word} onDark={onDark} />
        <span className="sr-only">Entry Now</span>
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center", s.gap, className)}>
      <TicketMark size={s.mark} onDark={onDark} />
      <Wordmark size={s.word} onDark={onDark} />
      <span className="sr-only">Entry Now</span>
    </span>
  );
}

/**
 * The mark: a ticket torn down the middle, navy on the left holding a white
 * lowercase "e", gradient on the right holding a star stub. Motion streaks
 * trail off the left edge — the "now" in Entry Now.
 */
function TicketMark({ size, onDark }: { size: number; onDark: boolean }) {
  // Unique per instance so two marks on one page cannot share a <defs> id and
  // silently repaint each other.
  const gid = `en-grad-${onDark ? "d" : "l"}`;
  const navy = onDark ? "#ffffff" : "var(--brand-navy, #16264c)";
  const counter = onDark ? "var(--brand-navy, #16264c)" : "#ffffff";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      focusable="false"
      className="shrink-0 overflow-visible"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff7a1f" />
          <stop offset="55%" stopColor="#f2454e" />
          <stop offset="100%" stopColor="#ed2c63" />
        </linearGradient>
      </defs>

      {/* Motion streaks, shortest to longest — speed reading left. */}
      <g fill={`url(#${gid})`}>
        <rect x="1" y="41.5" width="7" height="3.6" rx="1.8" opacity=".55" />
        <rect x="0" y="33.5" width="13" height="3.6" rx="1.8" opacity=".8" />
        <rect x="4" y="25.5" width="10" height="3.6" rx="1.8" opacity=".65" />
      </g>

      {/* Left half — navy, holding the "e". */}
      <path
        d="M17.5 22.5a6 6 0 0 1 6-6h11.2v31H23.5a6 6 0 0 1-6-6V22.5Z"
        fill={navy}
      />
      {/* The "e" is set, not drawn: at 26px in the header a hand-built bowl
          closes up and reads as a blob, where a real glyph stays open. Italic
          leans it into the motion streaks. */}
      <text
        x="26.6"
        y="41"
        textAnchor="middle"
        fontSize="26"
        fontWeight="800"
        fontStyle="italic"
        fill={counter}
        style={{ fontFamily: "var(--font-sans, system-ui), sans-serif" }}
      >
        e
      </text>

      {/* Right half — gradient, with the notch the tear leaves. */}
      <path
        d="M36.5 16.5h14A6 6 0 0 1 56.5 22.5v6.2a4.4 4.4 0 0 0 0 6.6v6.2a6 6 0 0 1-6 6h-14v-31Z"
        fill={`url(#${gid})`}
      />

      {/* Perforation — the tear line. */}
      <g fill={counter}>
        {[19.5, 24.5, 29.5, 34.5, 39.5, 44.5].map((cy) => (
          <circle key={cy} cx="35.6" cy={cy} r="1.5" />
        ))}
      </g>

      {/* Star stub on the gradient half. */}
      <g stroke={counter} strokeWidth="1.6" strokeLinejoin="round" fill="none">
        <path d="M41.4 27.6h9.4a1.7 1.7 0 0 1 1.7 1.7 1.6 1.6 0 0 0 0 3.2 1.7 1.7 0 0 1-1.7 1.7h-9.4a1.7 1.7 0 0 1-1.7-1.7 1.6 1.6 0 0 0 0-3.2 1.7 1.7 0 0 1 1.7-1.7Z" />
      </g>
      <path
        d="m46.1 28.9 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3 1-2Z"
        fill={counter}
      />
    </svg>
  );
}

/** "entry" in navy, "now" in the gradient — the logo's split, in type. */
function Wordmark({ size, onDark }: { size: number; onDark: boolean }) {
  return (
    <span
      aria-hidden
      className="font-extrabold tracking-[-0.035em] leading-none whitespace-nowrap"
      style={{ fontSize: size }}
    >
      <span style={{ color: onDark ? "#ffffff" : "var(--brand-navy, #16264c)" }}>
        entry
      </span>
      <span
        // Gradient text: the fill is clipped to the glyphs. `color:
        // transparent` is what makes the clip visible.
        style={{
          background: "var(--brand-gradient)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        now
      </span>
    </span>
  );
}
