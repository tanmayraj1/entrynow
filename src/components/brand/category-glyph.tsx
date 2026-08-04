import type { SVGProps } from "react";

/**
 * Category glyphs — drawn for Entry Now, one per catalogue category.
 *
 * All 48×48, all stroke-first on `currentColor` at a single weight, so a rail
 * of twelve reads as one family rather than twelve borrowed icons. They sit on
 * the category gradients, where the parent sets `text-white`.
 *
 * Keyed by the category's `slug`, with a ticket fallback — a category added by
 * an admin tomorrow renders something sane rather than a hole.
 */

type GlyphProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 48, children, ...rest }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Crossed dandiya sticks inside the garba circle. */
function Garba(p: GlyphProps) {
  return (
    <Svg {...p}>
      <circle cx="24" cy="24" r="17" strokeDasharray="2.5 5.5" opacity=".55" />
      <path d="M17 31 31 17" />
      <path d="M17 17l14 14" />
      <circle cx="15.6" cy="32.4" r="2.6" fill="currentColor" stroke="none" />
      <circle cx="32.4" cy="15.6" r="2.6" fill="currentColor" stroke="none" />
      <circle cx="15.6" cy="15.6" r="2.6" fill="currentColor" stroke="none" />
      <circle cx="32.4" cy="32.4" r="2.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** A diya, its flame, and the light coming off it. */
function Diya(p: GlyphProps) {
  return (
    <Svg {...p}>
      <path d="M10 30h28c0 5-6.3 8.5-14 8.5S10 35 10 30Z" />
      <path d="M24 30v-3" />
      <path d="M24 26c-3 0-4.6-2.2-4.6-4.6 0-3.2 3-5.2 4.6-9.4 1.6 4.2 4.6 6.2 4.6 9.4 0 2.4-1.6 4.6-4.6 4.6Z" fill="currentColor" fillOpacity=".22" />
      <path d="M8 22.5 5 21M40 22.5 43 21M12.5 15 10.5 12.5M35.5 15l2-2.5" opacity=".65" />
    </Svg>
  );
}

/** Mic on a stand, with the room responding. */
function Concert(p: GlyphProps) {
  return (
    <Svg {...p}>
      <rect x="19" y="6" width="10" height="18" rx="5" />
      <path d="M14 21a10 10 0 0 0 20 0" />
      <path d="M24 31v9M18 40h12" />
      <path d="M8.5 15.5a9 9 0 0 0 0 10M39.5 15.5a9 9 0 0 1 0 10" opacity=".6" />
    </Svg>
  );
}

/** A thali — the ring of katoris is the whole idea. */
function Food(p: GlyphProps) {
  return (
    <Svg {...p}>
      <circle cx="24" cy="27" r="15" />
      <circle cx="17.5" cy="22" r="3.6" />
      <circle cx="30.5" cy="22" r="3.6" />
      <circle cx="24" cy="33.5" r="4.4" />
      <path d="M20 10c0-1.8 1.8-2.4 1.8-4.2M27 10c0-1.8 1.8-2.4 1.8-4.2" opacity=".65" />
    </Svg>
  );
}

/** Handheld mic with the laugh coming back at it. */
function Comedy(p: GlyphProps) {
  return (
    <Svg {...p}>
      <path d="M27.5 12.5a5.5 5.5 0 0 1 7.8 7.8L23.6 32a3 3 0 0 1-1.5.8l-6 1.2 1.2-6a3 3 0 0 1 .8-1.5l9.4-13.9Z" />
      <path d="m28.5 14.5 5 5" />
      <path d="M12 38h13" />
      <path d="M36 27a12 12 0 0 1-4 8M40.5 30a17 17 0 0 1-5 10" opacity=".6" />
    </Svg>
  );
}

/** Colour thrown into the air. */
function Holi(p: GlyphProps) {
  return (
    <Svg {...p}>
      <path d="M11 37c0-9 7-17 17-19" />
      <circle cx="31" cy="15" r="3.4" fill="currentColor" stroke="none" />
      <circle cx="38" cy="20" r="2.4" fill="currentColor" stroke="none" opacity=".8" />
      <circle cx="35" cy="9" r="2" fill="currentColor" stroke="none" opacity=".7" />
      <circle cx="42" cy="12" r="1.6" fill="currentColor" stroke="none" opacity=".55" />
      <circle cx="24" cy="9" r="1.8" fill="currentColor" stroke="none" opacity=".6" />
      <path d="M8 40h10" />
    </Svg>
  );
}

/** A patang and its string. */
function Kite(p: GlyphProps) {
  return (
    <Svg {...p}>
      <path d="M26 5 40 19 26 33 12 19 26 5Z" />
      <path d="M26 5v28M12 19h28" opacity=".55" />
      <path d="M26 33c0 4-4 4-4 7s3 3 3 3" />
    </Svg>
  );
}

/** Idea meeting hand — a workshop is a thing you leave knowing. */
function Workshop(p: GlyphProps) {
  return (
    <Svg {...p}>
      <path d="M24 7a11 11 0 0 1 6.5 19.9c-1 .7-1.5 1.8-1.5 3v.6h-10v-.6c0-1.2-.5-2.3-1.5-3A11 11 0 0 1 24 7Z" />
      <path d="M19 35h10M21 40h6" />
      <path d="M24 18v8" opacity=".65" />
    </Svg>
  );
}

/** The two masks. Comedy leads, tragedy behind. */
function Theatre(p: GlyphProps) {
  return (
    <Svg {...p}>
      <path d="M28 9h11v11c0 5-3.6 9-8 9-1.2 0-2.3-.3-3.3-.8" opacity=".6" />
      <path d="M9 13h20v12c0 6-4.5 11-10 11S9 31 9 25V13Z" />
      <path d="M15 21.5h.02M23 21.5h.02" strokeWidth="3" />
      <path d="M15.5 28c1.4 1.6 3.2 2.4 5.5 2.4s4.1-.8 5.5-2.4" />
    </Svg>
  );
}

/** Ball and the ground it moves over. */
function Sports(p: GlyphProps) {
  return (
    <Svg {...p}>
      <circle cx="25" cy="22" r="13" />
      <path d="m25 14 6.5 4.8-2.5 7.7h-8L18.5 18.8 25 14Z" />
      <path d="M25 9v5M12.6 18.3l5.9.5M37.4 18.3l-5.9.5M17.2 33.5l3.8-4.9M32.8 33.5 29 28.6" opacity=".6" />
      <path d="M6 41h30" opacity=".7" />
    </Svg>
  );
}

/** Mirror ball and what falls off it. */
function Party(p: GlyphProps) {
  return (
    <Svg {...p}>
      <path d="M24 5v5" />
      <circle cx="24" cy="21" r="11" />
      <path d="M13 21h22M24 10v22M16.2 13.2c3 3.6 3 12 0 15.6M31.8 13.2c-3 3.6-3 12 0 15.6" opacity=".55" />
      <path d="m10 37 1.5 3M24 39v3.5M38 37l-1.5 3M31.5 40.5l.8 2M16.5 40.5l-.8 2" opacity=".75" />
    </Svg>
  );
}

/** Framed work on a wall. */
function Exhibition(p: GlyphProps) {
  return (
    <Svg {...p}>
      <rect x="8" y="8" width="32" height="24" rx="3" />
      <path d="m13 27 6.5-7.5 5 5.4 4.5-5 8 7.1" />
      <circle cx="30" cy="15.5" r="2.4" fill="currentColor" stroke="none" />
      <path d="M24 32v8M17 42l7-2 7 2" opacity=".7" />
    </Svg>
  );
}

/** Fallback — a ticket, which every category ultimately is. */
function TicketGlyph(p: GlyphProps) {
  return (
    <Svg {...p}>
      <path d="M8 15h32a2 2 0 0 1 2 2v5.5a3.5 3.5 0 0 0 0 7V35a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-5.5a3.5 3.5 0 0 0 0-7V17a2 2 0 0 1 2-2Z" />
      <path d="M28 15v22" strokeDasharray="3 4" opacity=".7" />
    </Svg>
  );
}

const GLYPHS: Record<string, (p: GlyphProps) => React.ReactElement> = {
  "garba-navratri": Garba,
  diwali: Diya,
  concerts: Concert,
  "food-festivals": Food,
  comedy: Comedy,
  holi: Holi,
  uttarayan: Kite,
  workshops: Workshop,
  theatre: Theatre,
  sports: Sports,
  parties: Party,
  exhibitions: Exhibition,
};

export function CategoryGlyph({
  slug,
  size = 48,
  className,
  strokeWidth,
}: {
  slug: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const Glyph = GLYPHS[slug] ?? TicketGlyph;
  return <Glyph size={size} className={className} strokeWidth={strokeWidth} />;
}

export const CATEGORY_GLYPH_SLUGS = Object.keys(GLYPHS);

// ---------------------------------------------------------------------------
// Category accents
// ---------------------------------------------------------------------------

/**
 * Three flat colours, no gradients.
 *
 * A gradient per category turned a twelve-item rail into a paint chart, and
 * the brand gradient stopped meaning "act on this" because it was everywhere.
 * It is now reserved for the logo, primary CTAs, price pins and the ticket
 * foil; categories get one of three solids, distributed so no two neighbours
 * in `sortOrder` repeat (D-019).
 */
export const ACCENTS = {
  navy: "#16264c",
  orange: "#ff6b2b",
  rose: "#ed2c63",
} as const;

export type AccentName = keyof typeof ACCENTS;

const CATEGORY_ACCENT: Record<string, AccentName> = {
  "garba-navratri": "rose",
  diwali: "orange",
  concerts: "navy",
  "food-festivals": "orange",
  comedy: "navy",
  theatre: "rose",
  parties: "rose",
  sports: "navy",
  holi: "orange",
  uttarayan: "navy",
  exhibitions: "orange",
  workshops: "navy",
};

/** Deterministic even for a category an admin adds tomorrow. */
export function categoryAccentName(slug: string): AccentName {
  const known = CATEGORY_ACCENT[slug];
  if (known) return known;
  const names = Object.keys(ACCENTS) as AccentName[];
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return names[h % names.length];
}

export function categoryAccent(slug: string): string {
  return ACCENTS[categoryAccentName(slug)];
}
