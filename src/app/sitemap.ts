import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { absoluteUrl, isIndexable } from "@/lib/site";

/**
 * Every public URL worth crawling — and deliberately not one more.
 *
 * Two rules shape this file, and they pull against each other.
 *
 * **Comprehensive**, because a sitemap is the only complete list of the site
 * Google ever gets. A marketplace's pages are database rows, most of them
 * reachable only through a filter or a rail, so a crawler that follows links
 * alone finds a fraction of them. Everything that renders real content is
 * listed here: the city hubs, the filtered listings that have something in
 * them, the festival pages, every live event with its poster, and every
 * organizer with something on sale.
 *
 * **Never padded**, because an entry is a claim that the page is worth
 * fetching. The first version enumerated the route table — every city, every
 * festival in every city — and 28 of its 74 URLs were blank pages in cities
 * with no events. That is thin content submitted on purpose: it spends crawl
 * budget on pages that cannot rank and drags down the ones that could. So a
 * city, a category, a festival or an organizer appears only once something is
 * actually on sale there, and appears automatically the moment that changes,
 * because all of it is derived from the events rather than from the routes.
 *
 * Two deliberate omissions:
 *
 *   - **anything behind a login** — `/account`, `/tickets`, `/booking`, the
 *     portals, `/scan`. A crawler cannot sign in, so listing them would only
 *     offer Google a set of sign-in walls to index. `robots.ts` disallows the
 *     same set.
 *
 * Regenerated hourly rather than per request: the shape of the marketplace
 * changes when an event goes live, not when someone loads a page.
 */

export const revalidate = 3600;

/** A guard, not a real limit — 50,000 URLs is the format's ceiling. */
const MAX_ROWS = 5000;

const DEFAULT_CITY = process.env.NEXT_PUBLIC_DEFAULT_CITY ?? "ahmedabad";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isIndexable()) return [];

  const [events, festivalPairs, categoryPairs, organizers] = await Promise.all([
    db.event.findMany({
      where: { status: "LIVE" },
      select: {
        slug: true,
        updatedAt: true,
        coverImageUrl: true,
        city: { select: { slug: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_ROWS,
    }),
    // The city/festival combinations that actually have something on. `distinct`
    // does the cross-product filtering in one query rather than five.
    db.event.findMany({
      where: { status: "LIVE", festivalId: { not: null } },
      select: {
        city: { select: { slug: true } },
        festival: { select: { slug: true } },
      },
      distinct: ["cityId", "festivalId"],
    }),
    // Same trick for the filtered listings. All twelve categories are active
    // and visible in the rail — a marketplace says what it sells before it
    // sells it — but an empty one is a page with nothing to index, so only the
    // combinations with live events are submitted.
    db.event.findMany({
      where: { status: "LIVE" },
      select: {
        city: { select: { slug: true } },
        category: { select: { slug: true } },
      },
      distinct: ["cityId", "categoryId"],
    }),
    // A verified organizer with no live events is a profile with an empty
    // shelf — real, but not a search result anyone benefits from.
    db.organizerProfile.findMany({
      where: { status: "VERIFIED", events: { some: { status: "LIVE" } } },
      select: {
        slug: true,
        updatedAt: true,
        city: { select: { slug: true } },
      },
      take: MAX_ROWS,
    }),
  ]);

  const now = new Date();
  const entry = (
    path: string,
    lastModified: Date,
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
    priority: number,
    images?: string[],
  ) => ({
    url: absoluteUrl(path),
    lastModified,
    changeFrequency,
    priority,
    ...(images?.length ? { images } : {}),
  });

  /**
   * When this city's catalogue last moved.
   *
   * Stamping `now` on a derived page would tell Google the whole site changed
   * on every crawl, which is how a `lastModified` stops being believed — and
   * once it is ignored, the freshness signal it exists to carry is gone. A
   * city hub is exactly as fresh as the newest event on it.
   */
  const freshness = new Map<string, Date>();
  for (const e of events) {
    const seen = freshness.get(e.city.slug);
    if (!seen || e.updatedAt > seen) freshness.set(e.city.slug, e.updatedAt);
  }
  const cityFresh = (slug: string) => freshness.get(slug) ?? now;

  const staticPages = [
    // The national home page. It was omitted while `/` was a 307 to a city —
    // Google's guidance is to list the destination, and a redirecting URL is
    // reported as "Page with redirect — excluded", which reads like a fault.
    // It is a real page now (D-044) and the strongest URL on the domain.
    entry("/", now, "daily", 1),
    // The organizer funnel. These are the pages that answer "can I sell here",
    // and they are the only marketing copy on the site that a crawler can read
    // without a city in the path.
    entry("/organizer", now, "monthly", 0.7),
    entry("/organizer/pricing", now, "monthly", 0.6),
    entry("/organizer/onboarding", now, "monthly", 0.5),
    entry("/legal/terms", now, "yearly", 0.2),
    entry("/legal/privacy", now, "yearly", 0.2),
    entry("/legal/refunds", now, "yearly", 0.3),
    // A licence condition, not decoration (D-026) — it must stay reachable.
    entry("/legal/image-credits", now, "monthly", 0.2),
  ];

  // Derived from the events themselves, so a city earns its pages by having
  // something on rather than by existing in the catalogue.
  const citiesWithEvents = [...new Set(events.map((e) => e.city.slug))];
  const cityPages = citiesWithEvents.flatMap((slug) => [
    entry(`/${slug}`, cityFresh(slug), "daily", slug === DEFAULT_CITY ? 0.95 : 0.9),
    entry(`/${slug}/events`, cityFresh(slug), "daily", 0.8),
    entry(`/${slug}/festivals`, cityFresh(slug), "weekly", 0.6),
  ]);

  /**
   * Filtered listings — `?category=garba-navratri` and friends.
   *
   * A query string makes a distinct URL as far as a crawler is concerned, and
   * these are distinct pages: a real listing of real events with its own
   * heading. They are also the phrase people search — "garba tickets
   * ahmedabad" is a category page, not a home page.
   */
  const categoryPages = categoryPairs.map((p) =>
    entry(
      `/${p.city.slug}/events?category=${p.category.slug}`,
      cityFresh(p.city.slug),
      "daily",
      0.7,
    ),
  );

  const festivalPages = festivalPairs
    .filter((p) => p.festival !== null)
    .map((p) =>
      entry(
        `/${p.city.slug}/festivals/${p.festival!.slug}`,
        cityFresh(p.city.slug),
        "weekly",
        0.6,
      ),
    );

  /**
   * The events, each carrying its poster.
   *
   * The `<image:image>` entry is the reason to bother: a poster that Google
   * has been pointed at can surface in Images and in the rich result beside
   * the listing, and an event without a picture in a search result loses to
   * one with a picture every time. Only absolute URLs count, and only real
   * files — an event with no cover art contributes no image node rather than a
   * dead one.
   */
  const eventPages = events.map((e) =>
    entry(
      `/${e.city.slug}/events/${e.slug}`,
      e.updatedAt,
      "daily",
      0.8,
      e.coverImageUrl ? [absoluteUrl(e.coverImageUrl)] : undefined,
    ),
  );

  const organizerPages = organizers
    .filter((o) => o.city !== null)
    .map((o) =>
      entry(`/${o.city!.slug}/organizers/${o.slug}`, o.updatedAt, "weekly", 0.5),
    );

  return [
    ...staticPages,
    ...cityPages,
    ...categoryPages,
    ...eventPages,
    ...festivalPages,
    ...organizerPages,
  ];
}
