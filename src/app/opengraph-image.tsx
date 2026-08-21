import { ImageResponse } from "next/og";
import {
  OgCard,
  OG_SIZE,
  OG_CONTENT_TYPE,
  OG_CACHE_HEADERS,
  ogFonts,
} from "@/lib/og/card";
import { SITE_NAME, SITE_PITCH, SITE_TAGLINE } from "@/lib/site";

/**
 * The default share card, inherited by every route that does not define its
 * own — /tickets, /account, /legal/*, /organizer, the auth doors.
 *
 * Static: no params, no data, so it is generated once at build time and served
 * from the CDN thereafter.
 */

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <OgCard
        title={SITE_TAGLINE}
        subtitle={SITE_PITCH}
        meta={["Garba & Navratri", "Concerts", "Comedy"]}
      />
    ),
    { ...size, fonts: ogFonts, headers: OG_CACHE_HEADERS },
  );
}
