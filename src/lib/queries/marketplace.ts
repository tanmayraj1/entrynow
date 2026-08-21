import "server-only";

import { unstable_cache } from "next/cache";

import { db } from "@/lib/db";
import {
  availabilityChip,
  fromPricePaise,
  type AvailabilityChip,
  type TierAvailability,
} from "@/lib/availability";
import { isTodayIst, istDateKey } from "@/lib/ist";

/**
 * Read-side queries for the public marketplace.
 *
 * Everything here filters to `status: LIVE`. PAUSED events are hidden from
 * listings but keep their existing tickets valid (spec B1), and DRAFT /
 * IN_REVIEW / REJECTED are organizer-only.
 */

const LIVE = "LIVE" as const;

/** Flat projection an event card needs — no Prisma types leak into components. */
export interface EventCardData {
  id: string;
  slug: string;
  title: string;
  categoryName: string;
  categorySlug: string;
  gradient: string;
  coverImageUrl: string | null;
  organizerName: string;
  organizerSlug: string;
  organizerVerified: boolean;
  localityName: string | null;
  venueName: string;
  ratingAvg: number;
  ratingCount: number;
  fromPricePaise: number | null;
  chip: AvailabilityChip;
  soldRatio: number;
  dateLabel: string;
  nextSessionAt: Date | null;
  lastSessionAt: Date | null;
  size: "SMALL" | "MEDIUM" | "BIG";
  languages: string[];
  lat: number;
  lng: number;
}

const eventCardSelect = {
  id: true,
  slug: true,
  title: true,
  coverImageUrl: true,
  ratingAvg: true,
  ratingCount: true,
  size: true,
  languages: true,
  category: { select: { name: true, slug: true, gradient: true } },
  organizer: { select: { name: true, slug: true, verified: true } },
  venue: {
    select: { name: true, lat: true, lng: true, locality: { select: { name: true } } },
  },
  sessions: {
    where: { isActive: true },
    orderBy: { startsAt: "asc" },
    select: { startsAt: true, endsAt: true },
  },
  tiers: {
    select: {
      quantityTotal: true,
      quantitySold: true,
      quantityHeld: true,
      isActive: true,
      saleStartsAt: true,
      saleEndsAt: true,
      pricePaise: true,
    },
  },
} as const;

type RawEvent = {
  id: string;
  slug: string;
  title: string;
  coverImageUrl: string | null;
  ratingAvg: unknown;
  ratingCount: number;
  size: string;
  languages: string[];
  category: { name: string; slug: string; gradient: string };
  organizer: { name: string; slug: string; verified: boolean };
  venue: {
    name: string;
    lat: unknown;
    lng: unknown;
    locality: { name: string } | null;
  };
  sessions: { startsAt: Date; endsAt: Date }[];
  tiers: TierAvailability[];
};

/** "12 – 20 Oct" for a run of nights, "29 Aug" for one. */
function dateLabel(sessions: { startsAt: Date }[]): string {
  if (sessions.length === 0) return "Dates TBA";
  const first = sessions[0].startsAt;
  const last = sessions[sessions.length - 1].startsAt;
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: "Asia/Kolkata",
    }).format(d);
  if (istDateKey(first) === istDateKey(last)) return fmt(first);
  const firstMonth = new Intl.DateTimeFormat("en-IN", {
    month: "short",
    timeZone: "Asia/Kolkata",
  });
  if (firstMonth.format(first) === firstMonth.format(last)) {
    const day = new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      timeZone: "Asia/Kolkata",
    });
    return `${day.format(first)}–${fmt(last)}`;
  }
  return `${fmt(first)} – ${fmt(last)}`;
}

function toCard(e: RawEvent, now: Date): EventCardData {
  const upcoming = e.sessions.filter((s) => s.endsAt >= now);
  const next = upcoming[0] ?? null;
  const active = e.tiers.filter((t) => t.isActive);
  const total = active.reduce((s, t) => s + t.quantityTotal, 0);
  const sold = active.reduce((s, t) => s + t.quantitySold, 0);

  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    categoryName: e.category.name,
    categorySlug: e.category.slug,
    gradient: e.category.gradient,
    coverImageUrl: e.coverImageUrl,
    organizerName: e.organizer.name,
    organizerSlug: e.organizer.slug,
    organizerVerified: e.organizer.verified,
    localityName: e.venue.locality?.name ?? null,
    venueName: e.venue.name,
    ratingAvg: Number(e.ratingAvg),
    ratingCount: e.ratingCount,
    fromPricePaise: fromPricePaise(e.tiers, now),
    chip: availabilityChip({
      tiers: e.tiers,
      isToday: next ? isTodayIst(next.startsAt) : false,
      now,
    }),
    soldRatio: total === 0 ? 0 : sold / total,
    dateLabel: dateLabel(e.sessions),
    nextSessionAt: next?.startsAt ?? null,
    lastSessionAt: e.sessions.at(-1)?.startsAt ?? null,
    size: e.size as EventCardData["size"],
    languages: e.languages,
    lat: Number(e.venue.lat),
    lng: Number(e.venue.lng),
  };
}

// ---------------------------------------------------------------------------
// Cities
// ---------------------------------------------------------------------------

/**
 * Reference data — cities, localities, categories.
 *
 * These are the catalog rows an admin edits a handful of times a year, and
 * every marketplace page reads several of them: the shell needs cities and
 * categories, the home page needs categories again and localities. That was
 * four or five queries per render, each one a round trip to Postgres.
 *
 * Cached for an hour and tagged, so an admin toggling a row in `/admin/cms`
 * can invalidate it deliberately rather than everyone waiting out the TTL.
 * They are also the safest thing in the app to cache: nothing here is
 * per-user, and a stale city name for a few minutes is not a defect.
 */
export const CATALOG_TAG = "catalog";
const CATALOG_TTL = 3600;

export const getCityBySlug = unstable_cache(
  async (slug: string) => db.city.findFirst({ where: { slug, isActive: true } }),
  ["city-by-slug"],
  { revalidate: CATALOG_TTL, tags: [CATALOG_TAG] },
);

export const getCities = unstable_cache(
  async () =>
    db.city.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ["cities"],
  { revalidate: CATALOG_TTL, tags: [CATALOG_TAG] },
);

export const getLocalities = unstable_cache(
  async (cityId: string) =>
    db.locality.findMany({
      where: { cityId, isActive: true },
      orderBy: { name: "asc" },
    }),
  ["localities"],
  { revalidate: CATALOG_TTL, tags: [CATALOG_TAG] },
);

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const getCategories = unstable_cache(
  async () =>
    db.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
  ["categories"],
  { revalidate: CATALOG_TTL, tags: [CATALOG_TAG] },
);

/** Festival strip, with a live-event count per festival for this city. */
export async function getFestivalsWithCounts(cityId: string) {
  const festivals = await db.festival.findMany({
    where: { isActive: true },
    orderBy: { startsAt: "asc" },
  });
  const counts = await db.event.groupBy({
    by: ["festivalId"],
    where: { cityId, status: LIVE, festivalId: { not: null } },
    _count: { _all: true },
  });
  const map = new Map(counts.map((c) => [c.festivalId, c._count._all]));
  return festivals.map((f) => ({ ...f, eventCount: map.get(f.id) ?? 0 }));
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type FeaturedTab = "all" | "weekend" | "big" | "small";

/**
 * Featured rail. The design's four tabs map onto filters rather than separate
 * curations, so a newly published event appears without an admin touching CMS.
 */
export async function getFeaturedEvents(
  cityId: string,
  tab: FeaturedTab = "all",
  take = 6,
): Promise<EventCardData[]> {
  const now = new Date();

  const sizeFilter =
    tab === "big" ? { size: "BIG" as const }
    : tab === "small" ? { size: "SMALL" as const }
    : {};

  // "This weekend" = any session falling on the coming Sat/Sun in IST.
  let sessionFilter = {};
  if (tab === "weekend") {
    const { start, end } = comingWeekendUtcRange(now);
    sessionFilter = {
      sessions: { some: { startsAt: { gte: start, lte: end }, isActive: true } },
    };
  }

  const rows = await db.event.findMany({
    where: { cityId, status: LIVE, ...sizeFilter, ...sessionFilter },
    orderBy: [{ trendingScore: "desc" }, { viewCount: "desc" }],
    take,
    select: eventCardSelect,
  });

  return (rows as unknown as RawEvent[]).map((e) => toCard(e, now));
}

/**
 * Extra home-page rails.
 *
 * Deliberately one query with a switch rather than four near-identical
 * exports: they differ only in a `where` clause and an `orderBy`, and four
 * copies of `eventCardSelect` is four places to forget a field when the card
 * grows one.
 *
 * Each rail must answer a question a browsing visitor actually asks, or it is
 * just the trending list wearing a different hat:
 *
 *   soon     — "what can I go to this week?"   nearest upcoming session first
 *   topRated — "what is actually good?"        highest rated, with enough
 *                                              ratings to mean something
 *   budget   — "what can I afford tonight?"    anything with a tier under ₹500
 */
export type RailKind = "soon" | "topRated" | "budget";

const BUDGET_CEILING_PAISE = 50_000;

export async function getEventRail(
  cityId: string,
  kind: RailKind,
  take = 10,
): Promise<EventCardData[]> {
  const now = new Date();

  const where =
    kind === "soon"
      ? {
          cityId,
          status: LIVE,
          sessions: { some: { isActive: true, startsAt: { gte: now } } },
        }
      : kind === "topRated"
        ? { cityId, status: LIVE, ratingCount: { gte: 50 } }
        : {
            cityId,
            status: LIVE,
            tiers: {
              some: { isActive: true, pricePaise: { lte: BUDGET_CEILING_PAISE } },
            },
          };

  const orderBy =
    kind === "topRated"
      ? ([{ ratingAvg: "desc" }, { ratingCount: "desc" }] as const)
      : ([{ trendingScore: "desc" }, { viewCount: "desc" }] as const);

  const rows = await db.event.findMany({
    where,
    orderBy: [...orderBy],
    take,
    select: eventCardSelect,
  });

  const cards = (rows as unknown as RawEvent[]).map((e) => toCard(e, now));

  // "Soon" is a date question, and Prisma cannot order a parent by a filtered
  // child's minimum. The set is already capped at `take`, so sorting the page
  // in memory is cheaper than the correlated subquery would be.
  if (kind === "soon") {
    return cards
      .filter((c) => c.nextSessionAt !== null)
      .sort(
        (a, b) =>
          new Date(a.nextSessionAt!).getTime() -
          new Date(b.nextSessionAt!).getTime(),
      );
  }
  return cards;
}

/** Admin-pinned homepage curation, validated LIVE-only at render (spec G2). */
export async function getCuratedEvents(cityId: string): Promise<EventCardData[]> {
  const now = new Date();
  const slots = await db.featuredSlot.findMany({
    where: { cityId },
    orderBy: [{ pinned: "desc" }, { position: "asc" }],
  });
  if (slots.length === 0) return [];

  const rows = await db.event.findMany({
    where: { id: { in: slots.map((s) => s.eventId) }, status: LIVE },
    select: eventCardSelect,
  });

  const byId = new Map(
    (rows as unknown as RawEvent[]).map((e) => [e.id, toCard(e, now)]),
  );
  return slots
    .map((s) => byId.get(s.eventId))
    .filter((e): e is EventCardData => Boolean(e));
}

export async function getPopularOrganizers(cityId: string, take = 6) {
  return db.organizerProfile.findMany({
    where: { cityId, status: "VERIFIED" },
    orderBy: [{ followerCount: "desc" }],
    take,
    select: {
      id: true,
      slug: true,
      name: true,
      logoUrl: true,
      verified: true,
      followerCount: true,
      ratingAvg: true,
      ratingCount: true,
    },
  });
}

export async function getActiveBanners(cityId: string) {
  const now = new Date();
  return db.banner.findMany({
    where: {
      status: "LIVE",
      // Each window condition and the city scope live in AND so their ORs
      // cannot swallow each other. `cityId: null` is the admin form's "All
      // cities" — an exact `cityId` match here meant a national banner never
      // rendered on any city home.
      AND: [
        { OR: [{ cityId }, { cityId: null }] },
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: { sortOrder: "asc" },
  });
}

/** Platform stats band on the homepage. */
export async function getCityStats(cityId: string) {
  const [liveEvents, organizers, ticketsSold] = await Promise.all([
    db.event.count({ where: { cityId, status: LIVE } }),
    db.organizerProfile.count({ where: { cityId, status: "VERIFIED" } }),
    db.ticket.count({ where: { event: { cityId } } }),
  ]);
  return { liveEvents, organizers, ticketsSold };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The coming Sat 00:00 → Sun 23:59 in IST, expressed as UTC instants. */
function comingWeekendUtcRange(now: Date): { start: Date; end: Date } {
  const IST_OFFSET_MS = 5.5 * 3600 * 1000;
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const dow = istNow.getUTCDay(); // 0 Sun .. 6 Sat
  const daysToSat = (6 - dow + 7) % 7;

  const satIst = Date.UTC(
    istNow.getUTCFullYear(),
    istNow.getUTCMonth(),
    istNow.getUTCDate() + daysToSat,
  );
  const sunEndIst = satIst + 2 * 86_400_000 - 1;

  return {
    start: new Date(satIst - IST_OFFSET_MS),
    end: new Date(sunEndIst - IST_OFFSET_MS),
  };
}
