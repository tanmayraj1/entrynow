import { ImageResponse } from "next/og";
import {
  OgCard,
  OG_SIZE,
  OG_CONTENT_TYPE,
  OG_CACHE_HEADERS,
  fetchImage,
  ogFonts,
} from "@/lib/og/card";
import { getEventShareMeta } from "@/lib/queries/event";
import { formatIstDateRange, formatIstShortDate } from "@/lib/ist";
import { inr } from "@/lib/money";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

/**
 * An event's share card — the poster, the date, the venue and the price.
 *
 * This is the one that matters. Nobody shares a home page; they share "look at
 * this", and the preview has to answer what, when, where and how much before
 * the reader decides whether to tap.
 *
 * Rendered per request rather than at build time, which is what makes the
 * cover photograph possible: `fetchImage` pulls it over HTTP from this same
 * deployment, and at build time there is no server listening to serve it. The
 * route is dynamic anyway — the slug is a route param with no
 * `generateStaticParams` — so this costs nothing extra.
 */

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ city: string; slug: string }>;
}) {
  const { city, slug } = await params;
  const event = await getEventShareMeta(city, slug);

  if (!event) {
    return new ImageResponse(<OgCard title={SITE_TAGLINE} />, {
      ...size,
      fonts: ogFonts,
    });
  }

  const image = event.coverImageUrl
    ? await fetchImage(event.coverImageUrl)
    : undefined;

  const when = event.nextSession
    ? formatIstDateRange(event.nextSession.startsAt, event.nextSession.endsAt)
    : event.sessions[0]
      ? formatIstShortDate(event.sessions[0].startsAt)
      : null;

  const where = event.venue?.locality?.name ?? event.venue?.name ?? event.city.name;

  /**
   * The lowest price someone can actually *buy*, which is not always the
   * lowest number in the tier table.
   *
   * `fromPricePaise` takes a plain minimum, so an event with a ₹0 comp tier —
   * the stadium fixture's "Media Enclosure, accredited press only" is exactly
   * this — advertises "From ₹0" for seats that start at ₹199. On a page that
   * is a wrong-looking label; on a share card it is a promise made to someone
   * who has not seen the tiers yet.
   *
   * So zero-priced tiers are skipped, and "Free entry" is claimed only when
   * there is no priced tier at all.
   */
  const paid = event.tiers
    .map((t) => t.pricePaise)
    .filter((p) => p > 0)
    .sort((a, b) => a - b)[0];
  const price =
    paid !== undefined
      ? `From ${inr(paid)}`
      : event.tiers.length > 0
        ? "Free entry"
        : null;

  return new ImageResponse(
    (
      <OgCard
        eyebrow={`${event.category.name} · ${event.city.name}`}
        title={event.title}
        subtitle={event.summary ?? undefined}
        meta={[when, where, price].filter((m): m is string => Boolean(m))}
        image={image}
      />
    ),
    { ...size, fonts: ogFonts, headers: OG_CACHE_HEADERS },
  );
}
