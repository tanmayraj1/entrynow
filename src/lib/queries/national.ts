import "server-only";

import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import {
  CATALOG_TAG,
  eventCardSelect,
  toCard,
  type EventCardData,
  type RawEvent,
} from "@/lib/queries/marketplace";

/**
 * The country-level view of the marketplace.
 *
 * Everything else in `queries/marketplace.ts` takes a `cityId`, because the
 * marketplace is city-scoped (spec C2.2) and a listing that mixes Ahmedabad
 * and Mumbai is not a listing anyone can act on. The home page at `/` is the
 * one surface where that is wrong: it is the first thing a visitor sees, the
 * page Google shows for the brand's own name, and the only place a
 * non-geographic query like "book event tickets" can land.
 *
 * So these queries are deliberately unscoped, and each row carries its city
 * with it — every card and tile links into a city-scoped page, which is where
 * the visitor should end up.
 *
 * Cached on the catalogue tag with a short TTL. This page is the most-hit
 * route on the site and none of it is per-visitor.
 */

const LIVE = "LIVE" as const;
const TTL = 300;

export interface CityTile {
  slug: string;
  name: string;
  state: string;
  eventCount: number;
}

/**
 * The cities, newest inventory first — but every active city, not only the
 * ones with something on.
 *
 * A city with no events still belongs here. It tells a visitor in Surat that
 * the site intends to serve them, and it is a real page with a real empty
 * state (spec I15) rather than a 404. What it does NOT get is a sitemap entry:
 * inviting Google to an empty listing and inviting a person to one are
 * different decisions, and only the first one costs anything.
 */
export const getCityTiles = unstable_cache(
  async (): Promise<CityTile[]> => {
    const [cities, counts] = await Promise.all([
      db.city.findMany({
        where: { isActive: true },
        select: { id: true, slug: true, name: true, state: true },
        orderBy: { sortOrder: "asc" },
      }),
      db.event.groupBy({
        by: ["cityId"],
        where: { status: LIVE },
        _count: { _all: true },
      }),
    ]);
    const byCity = new Map(counts.map((c) => [c.cityId, c._count._all]));
    return cities.map((c) => ({
      slug: c.slug,
      name: c.name,
      state: c.state,
      eventCount: byCity.get(c.id) ?? 0,
    }));
  },
  ["national-city-tiles"],
  { revalidate: TTL, tags: [CATALOG_TAG] },
);

export interface CategoryTile {
  slug: string;
  name: string;
  gradient: string;
  eventCount: number;
  /** The city to send a click to — the one with the most of this category. */
  citySlug: string;
}

/**
 * The twelve categories, each pointing at the city where it has the most on.
 *
 * A category tile on a national page has to resolve to *somewhere*, and every
 * listing is city-scoped. Sending "Comedy" to a city with no comedy would be
 * a dead end, so each tile links to the city that actually has the most of it,
 * and falls back to the default city when a category has nothing anywhere.
 */
export const getCategoryTiles = unstable_cache(
  async (defaultCity: string): Promise<CategoryTile[]> => {
    const [categories, pairs] = await Promise.all([
      db.category.findMany({
        where: { isActive: true },
        select: { id: true, slug: true, name: true, gradient: true },
        orderBy: { sortOrder: "asc" },
      }),
      db.event.groupBy({
        by: ["categoryId", "cityId"],
        where: { status: LIVE },
        _count: { _all: true },
      }),
    ]);

    const cityNames = new Map(
      (await db.city.findMany({ select: { id: true, slug: true } })).map((c) => [
        c.id,
        c.slug,
      ]),
    );

    const best = new Map<string, { citySlug: string; n: number }>();
    const totals = new Map<string, number>();
    for (const p of pairs) {
      totals.set(p.categoryId, (totals.get(p.categoryId) ?? 0) + p._count._all);
      const current = best.get(p.categoryId);
      if (!current || p._count._all > current.n) {
        best.set(p.categoryId, {
          citySlug: cityNames.get(p.cityId) ?? defaultCity,
          n: p._count._all,
        });
      }
    }

    return categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      gradient: c.gradient,
      eventCount: totals.get(c.id) ?? 0,
      citySlug: best.get(c.id)?.citySlug ?? defaultCity,
    }));
  },
  ["national-category-tiles"],
  { revalidate: TTL, tags: [CATALOG_TAG] },
);

/** An event card that knows which city it is in, so it can link out. */
export type NationalEventCard = EventCardData & {
  citySlug: string;
  cityName: string;
};

/**
 * What is on next, anywhere in the country.
 *
 * Ordered by the soonest upcoming session rather than by trending score. On a
 * city page "trending" is a useful sort because the reader has already chosen
 * where they are; here it would just show the same four events for weeks. A
 * date is the one thing that makes a national rail feel alive.
 *
 * The `sessions` filter and the in-memory sort mirror `getEventRail`'s "soon"
 * branch, for the same reason it exists there: Prisma cannot order a parent by
 * a filtered child's minimum, and the set is already capped.
 */
export async function getNationalRail(take = 12): Promise<NationalEventCard[]> {
  const now = new Date();

  const rows = await db.event.findMany({
    where: {
      status: LIVE,
      sessions: { some: { isActive: true, endsAt: { gte: now } } },
    },
    orderBy: [{ trendingScore: "desc" }, { viewCount: "desc" }],
    // Over-fetch, because the sort that matters happens below in memory and
    // trending order is not date order.
    take: take * 3,
    select: { ...eventCardSelect, city: { select: { slug: true, name: true } } },
  });

  return (rows as unknown as (RawEvent & { city: { slug: string; name: string } })[])
    .map((e) => ({
      ...toCard(e, now),
      citySlug: e.city.slug,
      cityName: e.city.name,
    }))
    .filter((c) => c.nextSessionAt !== null)
    .sort((a, b) => a.nextSessionAt!.getTime() - b.nextSessionAt!.getTime())
    .slice(0, take);
}

/** Headline numbers. Honest counts, not marketing rounding. */
export const getNationalStats = unstable_cache(
  async () => {
    const [events, cities, organizers] = await Promise.all([
      db.event.count({ where: { status: LIVE } }),
      db.city.count({ where: { isActive: true } }),
      db.organizerProfile.count({ where: { status: "VERIFIED" } }),
    ]);
    return { events, cities, organizers };
  },
  ["national-stats"],
  { revalidate: TTL, tags: [CATALOG_TAG] },
);
