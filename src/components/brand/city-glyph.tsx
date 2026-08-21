import type { SVGProps } from "react";

/**
 * Line-art landmarks for the city picker.
 *
 * Same rules as `category-glyph.tsx`: SVG, never emoji. An emoji renders in
 * the platform font, so the same picker would look like a different product on
 * a Mac, a Pixel and a Samsung — and there is no flag or building emoji that
 * means "Ahmedabad" anyway.
 *
 * Each city gets the silhouette a resident would name first. Drawn on the same
 * 48×48 grid, 1.6 stroke, currentColor, so they sit together as a set rather
 * than a collection of clip-art. An unknown city falls back to a generic
 * skyline — the picker must never render an empty tile.
 */

type GlyphProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 40, children, ...rest }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
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

/** Ahmedabad — the Sidi Saiyyed jali, the city's own emblem. */
function Ahmedabad(p: GlyphProps) {
  return (
    <Svg {...p}>
      {/* Arched window frame */}
      <path d="M11 41V22a13 13 0 0 1 26 0v19" />
      <path d="M8 41h32" />
      {/* The tree-of-life tracery, abstracted to its trunk and three boughs */}
      <path d="M24 41V26" />
      <path d="M24 30c-3.4-1.4-5.6-4-6.2-7.4M24 30c3.4-1.4 5.6-4 6.2-7.4" opacity=".8" />
      <path d="M24 24c-2.4-1-4-2.9-4.4-5.3M24 24c2.4-1 4-2.9 4.4-5.3" opacity=".55" />
      <path d="M15.5 41V27M32.5 41V27" opacity=".45" />
    </Svg>
  );
}

/** Mumbai — the Gateway of India. */
function Mumbai(p: GlyphProps) {
  return (
    <Svg {...p}>
      <path d="M7 41h34" />
      <path d="M11 41V19h26v22" />
      {/* Central arch */}
      <path d="M19 41V29a5 5 0 0 1 10 0v12" />
      {/* Dome */}
      <path d="M17 19a7 7 0 0 1 14 0" />
      <path d="M24 12v-2.5" />
      {/* Corner turrets */}
      <path d="M11 24H7.5v17M37 24h3.5v17" opacity=".7" />
      <path d="M7.5 24a2 2 0 0 1 4 0M36.5 24a2 2 0 0 1 4 0" opacity=".55" />
    </Svg>
  );
}

/** Surat — the riverfront castle's crenellated gate. */
function Surat(p: GlyphProps) {
  return (
    <Svg {...p}>
      <path d="M7 41h34" />
      <path d="M10 41V17h28v24" />
      {/* Battlements */}
      <path d="M10 17h4v-4h5v4h5v-4h5v4h5v-4h4v4" />
      {/* Gate */}
      <path d="M19 41V30a5 5 0 0 1 10 0v11" />
      <path d="M16 24h4M28 24h4" opacity=".55" />
    </Svg>
  );
}

/** Vadodara — the Laxmi Vilas dome and clock tower. */
function Vadodara(p: GlyphProps) {
  return (
    <Svg {...p}>
      <path d="M7 41h34" />
      <path d="M13 41V25h22v16" />
      {/* Central dome */}
      <path d="M17 25a7 7 0 0 1 14 0" />
      <path d="M24 18v-3" />
      <circle cx="24" cy="13.5" r="1.6" fill="currentColor" stroke="none" />
      {/* Tower */}
      <path d="M35 41V21h5v20" opacity=".8" />
      <path d="M35 21l2.5-4 2.5 4" opacity=".7" />
      {/* Arcade */}
      <path d="M18 41v-6a2.5 2.5 0 0 1 5 0v6M25 41v-6a2.5 2.5 0 0 1 5 0v6" opacity=".6" />
    </Svg>
  );
}

/** Rajkot — the Watson Museum's colonnaded front. */
function Rajkot(p: GlyphProps) {
  return (
    <Svg {...p}>
      <path d="M7 41h34" />
      {/* Pediment */}
      <path d="M10 20 24 11l14 9" />
      <path d="M10 20h28" />
      {/* Columns */}
      <path d="M14 41V23M20.7 41V23M27.3 41V23M34 41V23" />
      <path d="M12 41h24" opacity=".7" />
    </Svg>
  );
}

/** Anywhere we do not have a landmark for — a plain skyline. */
function Generic(p: GlyphProps) {
  return (
    <Svg {...p}>
      <path d="M7 41h34" />
      <path d="M11 41V26h8v15" />
      <path d="M19 41V17h10v24" />
      <path d="M29 41V30h8v11" />
      <path d="M23 24h2M23 30h2M14 32h2M32 35h2" opacity=".6" />
    </Svg>
  );
}

const CITY_GLYPHS: Record<string, (p: GlyphProps) => React.ReactElement> = {
  ahmedabad: Ahmedabad,
  mumbai: Mumbai,
  surat: Surat,
  vadodara: Vadodara,
  rajkot: Rajkot,
};

export function CityGlyph({
  slug,
  size = 40,
  ...rest
}: GlyphProps & { slug: string }) {
  const Glyph = CITY_GLYPHS[slug] ?? Generic;
  return <Glyph size={size} {...rest} />;
}
