import "server-only";

import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { toPaise } from "@/lib/money";
import {
  availabilityChip,
  fromPricePaise,
  type TierAvailability,
} from "@/lib/availability";
import { isTodayIst, istDateKey } from "@/lib/ist";
import { haversineKm } from "@/lib/geo";
import type { EventCardData } from "./marketplace";

/**
 * Listing search.
 *
 * All facets combine with AND (spec: "all client-side facets combine with AND"
 * — we do it server-side so the count is authoritative and the URL is
 * shareable). Every parameter round-trips through the URL, which is what makes
 * back/forward and deep links work.
 */

export type ListingView = "grid" | "list" | "map";
export type ListingSort = "trending" | "date" | "price_asc" | "price_desc" | "rating";

export interface ListingFilters {
  q?: string;
  category?: string;
  locality?: string;
  festival?: string;
  size?: ("SMALL" | "MEDIUM" | "BIG")[];
  language?: string[];
  maxPricePaise?: number;
  verifiedOnly?: boolean;
  when?: "any" | "today" | "weekend" | "month";
  date?: string;
  near?: { lat: number; lng: number; radiusKm: number };
  /**
   * `?near=1` arrived but no coordinates yet — the "Near me" chip is a deep
   * link and geolocation can only be requested client-side. Kept distinct from
   * `near` so the UI prompts for permission instead of rendering the radius
   * control as though a location were already applied.
   */
  nearRequested?: boolean;
  sort?: ListingSort;
  view?: ListingView;
}

export interface ListingResult {
  events: (EventCardData & { distanceKm: number | null })[];
  total: number;
  facets: {
    categories: { slug: string; name: string; count: number }[];
    localities: { slug: string; name: string; count: number }[];
    languages: { name: string; count: number }[];
    sizes: { key: string; count: number }[];
    priceMaxPaise: number;
  };
}

/** Parse URLSearchParams into typed filters. One place, so the page, the API
 *  and the map view can never disagree about what a param means. */
export function parseFilters(
  sp: Record<string, string | string[] | undefined>,
): ListingFilters {
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const many = (k: string) => {
    const v = sp[k];
    if (!v) return undefined;
    return (Array.isArray(v) ? v : v.split(",")).filter(Boolean);
  };

  const maxPrice = one("maxPrice");
  const view = one("view");
  const sort = one("sort");

  return {
    q: one("q") || undefined,
    category: one("category") || undefined,
    locality: one("locality") || undefined,
    festival: one("festival") || undefined,
    size: many("size") as ListingFilters["size"],
    language: many("language"),
    maxPricePaise: maxPrice ? toPaise(Number(maxPrice)) : undefined,
    verifiedOnly: one("verified") === "1",
    when: (one("when") as ListingFilters["when"]) || "any",
    date: one("date") || undefined,
    sort: (["trending", "date", "price_asc", "price_desc", "rating"].includes(
      sort ?? "",
    )
      ? sort
      : "trending") as ListingSort,
    view: (["grid", "list", "map"].includes(view ?? "") ? view : "grid") as ListingView,
    // ?near=1 is the "Near Me" chip's deep link; coordinates arrive separately
    // because geolocation is client-side and never persisted (spec C2.3).
    near:
      one("near") === "1" && one("lat") && one("lng")
        ? {
            lat: Number(one("lat")),
            lng: Number(one("lng")),
            radiusKm: Number(one("radius") ?? 10),
          }
        : undefined,
    nearRequested: one("near") === "1" && !(one("lat") && one("lng")),
  };
}

/** Serialise filters back to a query string, dropping defaults so URLs stay clean. */
export function buildQuery(f: ListingFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.category) p.set("category", f.category);
  if (f.locality) p.set("locality", f.locality);
  if (f.festival) p.set("festival", f.festival);
  if (f.size?.length) p.set("size", f.size.join(","));
  if (f.language?.length) p.set("language", f.language.join(","));
  if (f.maxPricePaise) p.set("maxPrice", String(f.maxPricePaise / 100));
  if (f.verifiedOnly) p.set("verified", "1");
  if (f.when && f.when !== "any") p.set("when", f.when);
  if (f.date) p.set("date", f.date);
  if (f.sort && f.sort !== "trending") p.set("sort", f.sort);
  if (f.view && f.view !== "grid") p.set("view", f.view);
  if (f.near) {
    p.set("near", "1");
    p.set("lat", String(f.near.lat));
    p.set("lng", String(f.near.lng));
    p.set("radius", String(f.near.radiusKm));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

const cardSelect = {
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
    select: {
      name: true,
      lat: true,
      lng: true,
      locality: { select: { name: true, slug: true } },
    },
  },
  sessions: {
    where: { isActive: true },
    orderBy: { startsAt: "asc" as const },
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
} satisfies Prisma.EventSelect;

type Row = Prisma.EventGetPayload<{ select: typeof cardSelect }>;

function whenRange(when: ListingFilters["when"], date?: string) {
  const now = new Date();
  const IST = 5.5 * 3600 * 1000;

  if (date) {
    const start = new Date(`${date}T00:00:00.000Z`).getTime() - IST;
    return { gte: new Date(start), lte: new Date(start + 86_400_000 - 1) };
  }
  if (when === "today") {
    const key = istDateKey(now);
    const start = new Date(`${key}T00:00:00.000Z`).getTime() - IST;
    return { gte: new Date(start), lte: new Date(start + 86_400_000 - 1) };
  }
  if (when === "weekend") {
    const istNow = new Date(now.getTime() + IST);
    const daysToSat = (6 - istNow.getUTCDay() + 7) % 7;
    const sat = Date.UTC(
      istNow.getUTCFullYear(),
      istNow.getUTCMonth(),
      istNow.getUTCDate() + daysToSat,
    );
    return {
      gte: new Date(sat - IST),
      lte: new Date(sat + 2 * 86_400_000 - 1 - IST),
    };
  }
  if (when === "month") {
    return { gte: now, lte: new Date(now.getTime() + 30 * 86_400_000) };
  }
  return undefined;
}

export async function searchEvents(
  cityId: string,
  f: ListingFilters,
): Promise<ListingResult> {
  const now = new Date();

  const range = whenRange(f.when, f.date);

  const where: Prisma.EventWhereInput = {
    cityId,
    status: "LIVE",
    ...(f.q
      ? {
          OR: [
            { title: { contains: f.q, mode: "insensitive" } },
            { summary: { contains: f.q, mode: "insensitive" } },
            { venue: { name: { contains: f.q, mode: "insensitive" } } },
            { organizer: { name: { contains: f.q, mode: "insensitive" } } },
          ],
        }
      : {}),
    ...(f.category ? { category: { slug: f.category } } : {}),
    ...(f.festival ? { festival: { slug: f.festival } } : {}),
    // Accept either the slug (from a facet chip) or the display name typed
    // into the hero's "Where" field. The placeholder invites "Satellite,
    // Bopal…", so matching slug-only silently returned zero results.
    ...(f.locality
      ? {
          venue: {
            locality: {
              OR: [
                { slug: f.locality.toLowerCase().replace(/\s+/g, "-") },
                { name: { equals: f.locality, mode: "insensitive" as const } },
              ],
            },
          },
        }
      : {}),
    ...(f.size?.length ? { size: { in: f.size } } : {}),
    ...(f.language?.length ? { languages: { hasSome: f.language } } : {}),
    ...(f.verifiedOnly ? { organizer: { verified: true } } : {}),
    ...(f.maxPricePaise
      ? { tiers: { some: { pricePaise: { lte: f.maxPricePaise }, isActive: true } } }
      : {}),
    ...(range ? { sessions: { some: { startsAt: range, isActive: true } } } : {}),
  };

  const orderBy: Prisma.EventOrderByWithRelationInput[] =
    f.sort === "rating"
      ? [{ ratingAvg: "desc" }, { ratingCount: "desc" }]
      : f.sort === "date"
        ? [{ createdAt: "asc" }]
        : [{ trendingScore: "desc" }, { viewCount: "desc" }];

  const rows = await db.event.findMany({ where, orderBy, select: cardSelect });

  let events = rows.map((e) => toCard(e, now));

  // Distance is computed after the query — Postgres would need PostGIS to do
  // this in SQL, and the city-scoped result set is small enough that it does
  // not pay for itself yet.
  if (f.near) {
    const origin = { lat: f.near.lat, lng: f.near.lng };
    events = events
      .map((e) => ({ ...e, distanceKm: haversineKm(origin, { lat: e.lat, lng: e.lng }) }))
      .filter((e) => (e.distanceKm ?? Infinity) <= f.near!.radiusKm)
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  }

  // Price sorts operate on the derived "from" price, which the DB does not
  // hold, so they are applied here rather than in orderBy.
  if (f.sort === "price_asc" || f.sort === "price_desc") {
    const dir = f.sort === "price_asc" ? 1 : -1;
    events.sort(
      (a, b) => dir * ((a.fromPricePaise ?? 0) - (b.fromPricePaise ?? 0)),
    );
  }

  const facets = await buildFacets(cityId);

  return { events, total: events.length, facets };
}

function toCard(e: Row, now: Date): EventCardData & { distanceKm: number | null } {
  const tiers = e.tiers as TierAvailability[];
  const upcoming = e.sessions.filter((s) => s.endsAt >= now);
  const next = upcoming[0] ?? null;
  const active = tiers.filter((t) => t.isActive);
  const total = active.reduce((s, t) => s + t.quantityTotal, 0);
  const sold = active.reduce((s, t) => s + t.quantitySold, 0);

  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: "Asia/Kolkata",
    }).format(d);
  const first = e.sessions[0]?.startsAt;
  const last = e.sessions.at(-1)?.startsAt;
  const dateLabel = !first
    ? "Dates TBA"
    : !last || istDateKey(first) === istDateKey(last)
      ? fmt(first)
      : `${fmt(first)} – ${fmt(last)}`;

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
    fromPricePaise: fromPricePaise(tiers, now),
    chip: availabilityChip({
      tiers,
      isToday: next ? isTodayIst(next.startsAt) : false,
      now,
    }),
    soldRatio: total === 0 ? 0 : sold / total,
    dateLabel,
    nextSessionAt: next?.startsAt ?? null,
    lastSessionAt: last ?? null,
    size: e.size as EventCardData["size"],
    languages: e.languages,
    lat: Number(e.venue.lat),
    lng: Number(e.venue.lng),
    distanceKm: null,
  };
}

/** Facet counts are computed over the whole city, not the filtered set, so a
 *  facet never reads "0" purely because another facet is active. */
async function buildFacets(cityId: string): Promise<ListingResult["facets"]> {
  const events = await db.event.findMany({
    where: { cityId, status: "LIVE" },
    select: {
      languages: true,
      size: true,
      category: { select: { slug: true, name: true } },
      venue: { select: { locality: { select: { slug: true, name: true } } } },
      tiers: { select: { pricePaise: true, isActive: true } },
    },
  });

  const tally = <T>(items: T[], key: (t: T) => string | null) => {
    const m = new Map<string, number>();
    for (const it of items) {
      const k = key(it);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };

  const catCounts = tally(events, (e) => e.category.slug);
  const catNames = new Map(events.map((e) => [e.category.slug, e.category.name]));
  const locCounts = tally(events, (e) => e.venue.locality?.slug ?? null);
  const locNames = new Map(
    events
      .filter((e) => e.venue.locality)
      .map((e) => [e.venue.locality!.slug, e.venue.locality!.name]),
  );
  const sizeCounts = tally(events, (e) => e.size);

  const langCounts = new Map<string, number>();
  for (const e of events) {
    for (const l of e.languages) langCounts.set(l, (langCounts.get(l) ?? 0) + 1);
  }

  const priceMaxPaise = Math.max(
    toPaise(500),
    ...events.flatMap((e) =>
      e.tiers.filter((t) => t.isActive).map((t) => t.pricePaise),
    ),
  );

  const sortDesc = <T extends { count: number }>(a: T[]) =>
    a.sort((x, y) => y.count - x.count);

  return {
    categories: sortDesc(
      [...catCounts].map(([slug, count]) => ({
        slug,
        name: catNames.get(slug) ?? slug,
        count,
      })),
    ),
    localities: sortDesc(
      [...locCounts].map(([slug, count]) => ({
        slug,
        name: locNames.get(slug) ?? slug,
        count,
      })),
    ),
    languages: sortDesc(
      [...langCounts].map(([name, count]) => ({ name, count })),
    ),
    sizes: ["SMALL", "MEDIUM", "BIG"].map((key) => ({
      key,
      count: sizeCounts.get(key) ?? 0,
    })),
    priceMaxPaise,
  };
}
