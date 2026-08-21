import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { absoluteUrl, isIndexable } from "@/lib/site";

/**
 * Every public URL worth crawling.
 *
 * Regenerated hourly rather than per request: the shape of the marketplace
 * changes when an event goes live, not when someone loads a page, and a
 * sitemap is read by robots on their own schedule anyway.
 *
 * Empty while `DEMO_MODE` is on, to match `robots.ts`. Publishing a list of
 * invented events and then refusing to let anything crawl them would be two
 * files disagreeing about the same decision.
 */

export const revalidate = 3600;

/** A guard, not a real limit — 50,000 URLs is the format's ceiling. */
const MAX_ROWS = 5000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isIndexable()) return [];

  const [cities, events, festivals, organizers] = await Promise.all([
    // No `updatedAt` on the catalog tables — a city is not a document, and a
    // `lastModified` is optional in the format. `now` is the honest answer for
    // a page whose content is a live query.
    db.city.findMany({
      where: { isActive: true },
      select: { slug: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.event.findMany({
      where: { status: "LIVE" },
      select: { slug: true, updatedAt: true, city: { select: { slug: true } } },
      orderBy: { updatedAt: "desc" },
      take: MAX_ROWS,
    }),
    db.festival.findMany({
      where: { isActive: true },
      select: { slug: true },
    }),
    db.organizerProfile.findMany({
      where: { status: "VERIFIED" },
      select: {
        slug: true,
        updatedAt: true,
        city: { select: { slug: true } },
      },
      take: MAX_ROWS,
    }),
  ]);

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

  const now = new Date();

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

  const cityPages = cities.flatMap((c) => [
    entry(`/${c.slug}`, now, "daily", 0.9),
    entry(`/${c.slug}/events`, now, "daily", 0.8),
    entry(`/${c.slug}/festivals`, now, "weekly", 0.6),
  ]);

  // Festivals are city-scoped in the URL but not in the table, so each one is
  // listed under every city. That is how the routes actually work — dropping
  // the duplicates would mean sitemapping URLs that only exist for one city.
  const festivalPages = cities.flatMap((c) =>
    festivals.map((f) =>
      entry(`/${c.slug}/festivals/${f.slug}`, now, "weekly", 0.5),
    ),
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
