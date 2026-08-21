import { ImageResponse } from "next/og";
import {
  OgCard,
  OG_SIZE,
  OG_CONTENT_TYPE,
  OG_CACHE_HEADERS,
  ogFonts,
} from "@/lib/og/card";
import { getCityBySlug, getCityStats } from "@/lib/queries/marketplace";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

/**
 * The city home's share card — "Ahmedabad's festivals, one ticket away", over
 * the live counts.
 *
 * The numbers are the point. A generic card says the product exists; "312
 * events live" says it is being used, which is the question anyone opening a
 * shared link is actually asking.
 */

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city: citySlug } = await params;
  const city = await getCityBySlug(citySlug);

  // An unknown city still gets a card. `opengraph-image` has no `notFound()`
  // path worth taking: the page itself already 404s, and a crawler that
  // followed a stale link should see the brand rather than a broken image.
  if (!city) {
    return new ImageResponse(<OgCard title={SITE_TAGLINE} />, {
      ...size,
      fonts: ogFonts,
    });
  }

  const stats = await getCityStats(city.id);

  return new ImageResponse(
    (
      <OgCard
        eyebrow={`${city.name}${city.state ? ` · ${city.state}` : ""}`}
        title={`${city.name}'s festivals, one ticket away`}
        subtitle="Garba nights, melas, concerts and comedy — booked in a minute."
        meta={[
          `${stats.liveEvents} events live`,
          `${stats.organizers} verified organizers`,
        ]}
      />
    ),
    { ...size, fonts: ogFonts, headers: OG_CACHE_HEADERS },
  );
}
