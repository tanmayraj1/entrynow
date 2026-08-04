import { cn } from "@/lib/cn";

/**
 * Original illustration set.
 *
 * Every scene here is drawn for Entry Now — nothing is licensed, nothing is
 * borrowed, and no emoji stands in for artwork. They share one construction:
 * flat shapes in the brand gradient over navy, with a single hairline pass for
 * detail, so a page that shows two of them still looks like one product.
 *
 * Gradient ids are suffixed per component. Two SVGs on a page with the same
 * `<defs>` id would silently repaint each other.
 */

/**
 * Marigold torana — the garland strung across a doorway at a Gujarati
 * celebration. Used as a section divider and along the hero's lower edge.
 */
export function OrnamentBand({
  className,
  tone = "gradient",
}: {
  className?: string;
  tone?: "gradient" | "muted";
}) {
  const stroke = tone === "muted" ? "currentColor" : "url(#orn-g)";
  return (
    <svg
      viewBox="0 0 1200 44"
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
      className={cn("w-full h-[26px]", className)}
    >
      <defs>
        <linearGradient id="orn-g" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff7a1f" />
          <stop offset="50%" stopColor="#f2454e" />
          <stop offset="100%" stopColor="#ed2c63" />
        </linearGradient>
      </defs>
      {/* The string. */}
      <path
        d="M0 6q75 22 150 0t150 0q75 22 150 0t150 0q75 22 150 0t150 0q75 22 150 0t150 0"
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        opacity=".85"
      />
      {/* Marigolds and leaf drops at each low point. */}
      {Array.from({ length: 8 }, (_, i) => {
        const x = 75 + i * 150;
        return (
          <g key={x} fill={stroke}>
            <circle cx={x} cy="17" r="6.5" opacity=".9" />
            <circle cx={x} cy="17" r="2.6" fill="#fff" opacity=".55" />
            <path
              d={`M${x} 25v7`}
              stroke={stroke}
              strokeWidth="1.6"
              fill="none"
              opacity=".7"
            />
            <ellipse cx={x} cy="35" rx="3.2" ry="5" opacity=".55" />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Empty-state scene — a ticket stub being searched for. Replaces the diya
 * emoji that used to stand in for artwork on every empty rail.
 */
export function EmptyStateArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 120"
      aria-hidden
      focusable="false"
      className={cn("w-[160px] h-[120px]", className)}
    >
      <defs>
        <linearGradient id="esa-g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff7a1f" />
          <stop offset="100%" stopColor="#ed2c63" />
        </linearGradient>
      </defs>

      {/* Ground shadow, so the stub sits rather than floats. */}
      <ellipse cx="80" cy="104" rx="46" ry="7" fill="#16264c" opacity=".08" />

      {/* Back stub, rotated — depth by overlap. */}
      <g transform="rotate(-9 76 58)" opacity=".38">
        <path
          d="M26 40h84a5 5 0 0 1 5 5v8a7 7 0 0 0 0 14v8a5 5 0 0 1-5 5H26a5 5 0 0 1-5-5v-8a7 7 0 0 0 0-14v-8a5 5 0 0 1 5-5Z"
          fill="url(#esa-g)"
        />
      </g>

      {/* Front stub. */}
      <g transform="rotate(4 80 62)">
        <path
          d="M30 42h82a5 5 0 0 1 5 5v8a7 7 0 0 0 0 14v8a5 5 0 0 1-5 5H30a5 5 0 0 1-5-5v-8a7 7 0 0 0 0-14v-8a5 5 0 0 1 5-5Z"
          fill="#fff"
          stroke="#e4e7f3"
          strokeWidth="1.5"
        />
        <path d="M88 42v40" stroke="#c9cfe4" strokeWidth="1.5" strokeDasharray="3 4" />
        <rect x="36" y="52" width="40" height="4.5" rx="2.25" fill="url(#esa-g)" />
        <rect x="36" y="62" width="26" height="4" rx="2" fill="#c9cfe4" />
        <circle cx="102" cy="62" r="8" fill="url(#esa-g)" opacity=".2" />
        <path
          d="m99 62 2.4 2.4L106 60"
          stroke="url(#esa-g)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* Search lens over the corner. */}
      <g stroke="#16264c" strokeWidth="3" fill="none" strokeLinecap="round">
        <circle cx="120" cy="36" r="15" fill="#fff" fillOpacity=".9" />
        <path d="m131 47 9 9" />
      </g>
      <path
        d="M114 36a6 6 0 0 1 6-6"
        stroke="url(#esa-g)"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Map-search scene — pins clustered over a street fragment. Used as the
 * illustration beside the "Explore on the map" heading and in the map's own
 * zero-results state.
 */
export function MapSearchArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 140 120"
      aria-hidden
      focusable="false"
      className={cn("w-[140px] h-[120px]", className)}
    >
      <defs>
        <linearGradient id="msa-g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff7a1f" />
          <stop offset="100%" stopColor="#ed2c63" />
        </linearGradient>
        <clipPath id="msa-clip">
          <rect x="8" y="22" width="124" height="86" rx="12" />
        </clipPath>
      </defs>

      {/* The map plate. */}
      <rect
        x="8"
        y="22"
        width="124"
        height="86"
        rx="12"
        fill="#f6f7fc"
        stroke="#e4e7f3"
        strokeWidth="1.5"
      />
      <g clipPath="url(#msa-clip)" stroke="#c9cfe4" strokeWidth="2" fill="none">
        {/* Streets — two arterials and a river, the shape of any Indian city. */}
        <path d="M8 62h124M46 22v86M96 22v86" opacity=".7" />
        <path d="M8 40h124" opacity=".35" />
        <path
          d="M20 108C34 84 30 60 46 40s18-14 26-18"
          stroke="#bcd7ef"
          strokeWidth="7"
          opacity=".8"
        />
      </g>

      {/* Blocks, faint. */}
      <g fill="#e4e7f3" clipPath="url(#msa-clip)" opacity=".8">
        <rect x="54" y="70" width="18" height="12" rx="2" />
        <rect x="104" y="30" width="16" height="14" rx="2" />
        <rect x="16" y="28" width="14" height="8" rx="2" />
      </g>

      {/* Price pins. The tall one is the selection. */}
      <Pin x={46} y={62} scale={1.15} />
      <Pin x={96} y={44} scale={0.82} muted />
      <Pin x={72} y={90} scale={0.82} muted />
    </svg>
  );
}

function Pin({
  x,
  y,
  scale = 1,
  muted = false,
}: {
  x: number;
  y: number;
  scale?: number;
  muted?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={muted ? 0.55 : 1}>
      <ellipse cx="0" cy="2" rx="7" ry="2.5" fill="#16264c" opacity=".18" />
      <path
        d="M0 0c-6-8-9-11.5-9-16a9 9 0 1 1 18 0c0 4.5-3 8-9 16Z"
        fill={muted ? "#16264c" : "url(#msa-g)"}
      />
      <circle cx="0" cy="-16" r="3.4" fill="#fff" />
    </g>
  );
}

/**
 * Hero backdrop — the brand mesh with a faint concentric "garba circle"
 * pattern over it. Purely decorative; the hero's contrast comes from the mesh
 * underneath, so this can be dropped without hurting legibility.
 */
export function HeroBackdrop({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1440 560"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      focusable="false"
      className={cn("absolute inset-0 w-full h-full", className)}
    >
      <g stroke="#fff" fill="none" opacity=".10">
        {[70, 130, 200, 280, 370].map((r) => (
          <circle key={r} cx="1180" cy="120" r={r} strokeWidth="1.4" />
        ))}
        {[60, 120, 190].map((r) => (
          <circle key={r} cx="180" cy="470" r={r} strokeWidth="1.4" />
        ))}
      </g>
      {/* Scattered light — the string lights over a Garba ground. */}
      <g fill="#fff" opacity=".5">
        {[
          [230, 90], [420, 60], [610, 110], [800, 70], [990, 130],
          [330, 180], [700, 200], [1080, 60], [150, 140], [1290, 230],
        ].map(([cx, cy], i) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={i % 3 === 0 ? 2.4 : 1.5} />
        ))}
      </g>
    </svg>
  );
}

/**
 * Icon medallion for empty states and section headers.
 *
 * The replacement for the emoji glyphs these primitives used to take: an emoji
 * renders in the platform's own font, so the same empty state looked like a
 * different product on Android, iOS and Windows — and none of them looked like
 * this one.
 */
export function GlyphMedallion({
  icon: Icon,
  size = 64,
  className,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid place-items-center rounded-[20px] ring-1 ring-inset ring-primary/15",
        className,
      )}
      style={{ width: size, height: size, background: "var(--brand-gradient-soft)" }}
    >
      <Icon size={Math.round(size * 0.44)} strokeWidth={1.9} className="text-primary" />
    </span>
  );
}

/** Numbered step medallion for "How it works" — gradient ring, navy numeral. */
export function StepMedallion({
  n,
  className,
}: {
  n: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 56 56"
      aria-hidden
      focusable="false"
      className={cn("size-14", className)}
    >
      <defs>
        <linearGradient id={`sm-${n}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff7a1f" />
          <stop offset="100%" stopColor="#ed2c63" />
        </linearGradient>
      </defs>
      <circle cx="28" cy="28" r="26" fill={`url(#sm-${n})`} opacity=".12" />
      <circle
        cx="28"
        cy="28"
        r="21"
        fill="none"
        stroke={`url(#sm-${n})`}
        strokeWidth="2.5"
        strokeDasharray="103 132"
        strokeLinecap="round"
        transform="rotate(-90 28 28)"
      />
      <text
        x="28"
        y="35.5"
        textAnchor="middle"
        fontSize="20"
        fontWeight="800"
        fill="#16264c"
      >
        {n}
      </text>
    </svg>
  );
}
