import "server-only";

import type { EventDetail } from "@/lib/queries/event";
import { toRupees } from "@/lib/money";
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/site";

/**
 * schema.org payloads.
 *
 * Two audiences, one format. Google reads `Event` to build the rich result
 * that shows a date, a venue and a price directly in search; the same block is
 * what lets an assistant answer "what's on in Ahmedabad this weekend" without
 * a human reading the page.
 *
 * Everything here is derived from data already fetched by the page. None of
 * these functions query.
 */

/** The site itself — emitted once, on the city home. */
export function websiteJsonLd(citySlug: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl()}#organization`,
        name: SITE_NAME,
        url: siteUrl(),
        description: SITE_DESCRIPTION,
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl()}#website`,
        name: SITE_NAME,
        url: siteUrl(),
        publisher: { "@id": `${siteUrl()}#organization` },
        // Declares the search endpoint so a search box can appear under the
        // result. It points at the real listing route with the real param —
        // `parseFilters` reads `q` — because a sitelinks searchbox that 404s
        // is worse than none.
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: absoluteUrl(`/${citySlug}/events?q={search_term_string}`),
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

/**
 * One event.
 *
 * Two details Google is strict about and that are easy to get wrong here:
 *
 *   - **`startDate` must carry an offset.** A bare local time is read as UTC,
 *     which moves an 8 PM Garba session to 1:30 AM the next day in every
 *     search result. The sessions are stored UTC (I7) and `toISOString()`
 *     emits the `Z`, so the instant is unambiguous.
 *   - **`endDate` matters as much.** A Garba night that runs 8 PM–1 AM belongs
 *     to its start date but is still on until it ends (D-012); without an end
 *     the result disappears from "happening now" at midnight.
 */
export function eventJsonLd(
  event: EventDetail,
  citySlug: string,
): Record<string, unknown> {
  const url = absoluteUrl(`/${citySlug}/events/${event.slug}`);
  const session = event.upcomingSessions[0] ?? event.sessions[0];

  const offers = event.tiers
    .filter((t) => t.isActive)
    .map((t) => ({
      "@type": "Offer",
      name: t.name,
      url,
      price: toRupees(t.pricePaise).toFixed(2),
      priceCurrency: "INR",
      availability: t.onSale
        ? t.remaining > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/SoldOut"
        : "https://schema.org/PreOrder",
      ...(t.saleStartsAt ? { validFrom: t.saleStartsAt.toISOString() } : {}),
    }));

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    url,
    description: event.summary ?? event.description ?? undefined,
    ...(event.coverImageUrl
      ? {
          image: [
            event.coverImageUrl.startsWith("http")
              ? event.coverImageUrl
              : absoluteUrl(event.coverImageUrl),
          ],
        }
      : {}),
    ...(session
      ? {
          startDate: session.startsAt.toISOString(),
          endDate: session.endsAt.toISOString(),
        }
      : {}),
    eventStatus:
      event.status === "PAUSED"
        ? "https://schema.org/EventPostponed"
        : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    ...(event.venue
      ? {
          location: {
            "@type": "Place",
            name: event.venue.name,
            address: {
              "@type": "PostalAddress",
              streetAddress: event.venue.addressLine,
              addressLocality: event.venue.locality?.name ?? event.city.name,
              addressRegion: event.city.state,
              postalCode: event.venue.pincode ?? undefined,
              addressCountry: "IN",
            },
            geo: {
              "@type": "GeoCoordinates",
              latitude: Number(event.venue.lat),
              longitude: Number(event.venue.lng),
            },
          },
        }
      : {}),
    organizer: {
      "@type": "Organization",
      name: event.organizer.name,
      url: absoluteUrl(`/${citySlug}/organizers/${event.organizer.slug}`),
    },
    ...(offers.length ? { offers } : {}),
    // Only when there are real ratings. Google rejects — and can penalise — an
    // aggregateRating with a zero count, and the seeded default is 0.
    ...(event.ratingCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: event.ratingAvg.toFixed(1),
            reviewCount: event.ratingCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    inLanguage: event.languages,
  };
}
