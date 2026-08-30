import "server-only";

import type { EventDetail } from "@/lib/queries/event";
import { toRupees } from "@/lib/money";
import {
  absoluteUrl,
  SITE_DESCRIPTION,
  SITE_NAME,
  siteUrl,
  SUPPORT_EMAIL,
} from "@/lib/site";

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

/**
 * The site itself — emitted once per page, on `/` and on each city home.
 *
 * The `@id` values are stable absolute URIs rather than page-local ids, so the
 * Organization declared on the home page and the one referenced as an event's
 * `organizer` publisher are understood as the same entity across the whole
 * site. That single graph is what a knowledge panel is built from; a fresh
 * anonymous Organization on every page is not.
 */
export function websiteJsonLd(citySlug: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl()}#organization`,
        name: SITE_NAME,
        alternateName: "EntryNow",
        url: siteUrl(),
        description: SITE_DESCRIPTION,
        // A square mark, which is what Google wants for a logo — the wordmark
        // lockup gets cropped. `icon.svg` is the same artwork the tab uses.
        logo: {
          "@type": "ImageObject",
          url: absoluteUrl("/apple-icon.png"),
          width: 180,
          height: 180,
        },
        email: SUPPORT_EMAIL,
        areaServed: { "@type": "Country", name: "India" },
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: SUPPORT_EMAIL,
          areaServed: "IN",
          availableLanguage: ["en", "hi", "gu"],
        },
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl()}#website`,
        name: SITE_NAME,
        url: siteUrl(),
        inLanguage: "en-IN",
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
 * The trail Google draws in place of the raw URL under a result.
 *
 * Worth more here than on most sites, because these paths are deep and
 * meaningful — `entrynow.in › ahmedabad › events › rangilo-re-garba…` becomes
 * "Entry Now › Ahmedabad › Events › Rangilo Re Garba Mahotsav". The `position`
 * values must start at 1 and be contiguous, and every `item` must be an
 * absolute URL that resolves, or Google drops the whole block silently.
 */
export function breadcrumbJsonLd(
  trail: { name: string; path: string }[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: absoluteUrl(t.path),
    })),
  };
}

/**
 * A listing, as an ordered list of the things on it.
 *
 * This is what lets a listing page be understood as a set of events rather
 * than as one document that happens to mention several. Each entry is a URL
 * reference, not an inlined Event — the full description lives on the event's
 * own page, and duplicating it here would put two competing copies of the same
 * entity in the graph.
 */
export function itemListJsonLd(
  name: string,
  items: { name: string; path: string }[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      url: absoluteUrl(it.path),
    })),
  };
}

/**
 * Questions and answers, both on the page and in the markup.
 *
 * The rule Google enforces and that is easy to break: every question and
 * answer in this block must be **visible on the page**. Marking up an answer
 * that only exists in the JSON is a structured-data violation, so the caller
 * passes the same array it renders.
 */
export function faqJsonLd(
  qa: { q: string; a: string }[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qa.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
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
