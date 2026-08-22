import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { absoluteUrl, isIndexable } from "@/lib/site";

/**
 * Every public URL worth crawling — and deliberately not one more.
 *
 * The first version listed every city, and every festival in every city, on
 * the grounds that those routes exist. They do, and most of them are empty:
 * all 28 live events are in Ahmedabad, so Surat, Vadodara, Rajkot and Mumbai
 * each contributed a blank home, a blank listing, a blank festival index and
 * one blank page per festival. Twenty-eight of seventy-four URLs were pages
 * with nothing on them.
 *
 * Submitting those is worse than omitting them. It spends crawl budget on
 * pages that cannot rank, and a sitemap that is largely thin content
 * suppresses the pages that would have. So a city, a listing or a festival
 * appears only once something is actually on sale there — and appears
 * automatically the moment that changes, because this is derived from the
 * events rather than from the route table.
 *
 * Regenerated hourly rather than per request: the shape of the marketplace
 * changes when an event goes live, not when someone loads a page.
 */

export const revalidate = 3600;

/** A guard, not a real limit — 50,000 URLs is the format's ceiling. */
const MAX_ROWS = 5000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isIndexable()) return [];

  const [events, festivalPairs, organizers] = await Promise.all([
    db.event.findMany({
      where: { status: "LIVE" },
      select: { slug: true, updatedAt: true, city: { select: { slug: true } } },
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
  ) => ({
    url: absoluteUrl(path),
    lastModified,
    changeFrequency,
    priority,
  });

  const staticPages = [
    entry("/", now, "daily", 1),
    entry("/organizer", now, "monthly", 0.6),
    entry("/organizer/pricing", now, "monthly", 0.5),
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
    entry(`/${slug}`, now, "daily", 0.9),
    entry(`/${slug}/events`, now, "daily", 0.8),
    entry(`/${slug}/festivals`, now, "weekly", 0.6),
  ]);

  const festivalPages = festivalPairs
    .filter((p) => p.festival !== null)
    .map((p) =>
      entry(`/${p.city.slug}/festivals/${p.festival!.slug}`, now, "weekly", 0.5),
    );

  const eventPages = events.map((e) =>
    entry(`/${e.city.slug}/events/${e.slug}`, e.updatedAt, "daily", 0.8),
  );

  const organizerPages = organizers
    .filter((o) => o.city !== null)
    .map((o) =>
      entry(`/${o.city!.slug}/organizers/${o.slug}`, o.updatedAt, "weekly", 0.5),
    );

  return [
    ...staticPages,
    ...cityPages,
    ...eventPages,
    ...festivalPages,
    ...organizerPages,
  ];
}
