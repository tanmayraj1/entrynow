import "server-only";

import { db } from "@/lib/db";
import {
  availabilityChip,
  fromPricePaise,
  type AvailabilityChip,
  type TierAvailability,
} from "@/lib/availability";
import { isTodayIst, istDateKey } from "@/lib/ist";
import { haversineKm, type Bounds, type LatLng } from "@/lib/geo";
import { getGeocodeAdapter, type GeocodeResult } from "@/lib/adapters/geocode";

/**
 * Map search — the read side of "find events near a point on the map".
 *
 * Deliberately a narrower projection than `EventCardData`: a pan refetches
 * pins on every idle, so this payload travels far more often than a card does
 * and carries only what the pin and its business card render.
 *
 * Bounds filtering happens in SQL on the venue's lat/lng so a wide zoom does
 * not pull the whole city into memory. Distance ranking still happens in JS —
 * ordering by great-circle distance needs PostGIS to do in SQL, and the
 * bounded result set is small by construction (D-016).
 */

export interface MapPin {
  id: string;
  slug: string;
  title: string;
  lat: number;
  lng: number;
  categoryName: string;
  categorySlug: string;
  venueName: string;
  localityName: string | null;
  organizerName: string;
  organizerVerified: boolean;
  dateLabel: string;
  fromPricePaise: number | null;
  ratingAvg: number;
  ratingCount: number;
  chip: AvailabilityChip;
  /** Only set when the query carried an origin. */
  distanceKm: number | null;
}

const pinSelect = {
  id: true,
  slug: true,
  title: true,
  ratingAvg: true,
  ratingCount: true,
  category: { select: { name: true, slug: true } },
  organizer: { select: { name: true, verified: true } },
  venue: {
    select: { name: true, lat: true, lng: true, locality: { select: { name: true } } },
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
} as const;

export interface MapQuery {
  bounds?: Bounds;
  origin?: LatLng | null;
  /** Free-text, matched the same way the listing matches it. */
  q?: string;
  category?: string;
  /** Hard cap so a zoomed-out viewport cannot ship the whole catalogue. */
  limit?: number;
}

export async function getMapPins(
  cityId: string,
  { bounds, origin, q, category, limit = 120 }: MapQuery = {},
): Promise<MapPin[]> {
  const now = new Date();

  const rows = await db.event.findMany({
    where: {
      cityId,
      status: "LIVE",
      ...(bounds
        ? {
            venue: {
              lat: { gte: bounds.south, lte: bounds.north },
              lng: { gte: bounds.west, lte: bounds.east },
            },
          }
        : {}),
      ...(category ? { category: { slug: category } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { summary: { contains: q, mode: "insensitive" as const } },
              { venue: { name: { contains: q, mode: "insensitive" as const } } },
              { organizer: { name: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    orderBy: [{ trendingScore: "desc" }, { viewCount: "desc" }],
    take: limit,
    select: pinSelect,
  });

  const pins = rows.map((e) => {
    const tiers = e.tiers as TierAvailability[];
    const upcoming = e.sessions.filter((s) => s.endsAt >= now);
    const next = upcoming[0] ?? null;
    const lat = Number(e.venue.lat);
    const lng = Number(e.venue.lng);

    return {
      id: e.id,
      slug: e.slug,
      title: e.title,
      lat,
      lng,
      categoryName: e.category.name,
      categorySlug: e.category.slug,
      venueName: e.venue.name,
      localityName: e.venue.locality?.name ?? null,
      organizerName: e.organizer.name,
      organizerVerified: e.organizer.verified,
      dateLabel: dateLabel(e.sessions),
      fromPricePaise: fromPricePaise(tiers, now),
      ratingAvg: Number(e.ratingAvg),
      ratingCount: e.ratingCount,
      chip: availabilityChip({
        tiers,
        isToday: next ? isTodayIst(next.startsAt) : false,
        now,
      }),
      distanceKm: origin ? haversineKm(origin, { lat, lng }) : null,
    } satisfies MapPin;
  });

  // With an origin the nearest result is the answer; without one, trending
  // order (already applied in SQL) is.
  if (origin) pins.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));

  return pins;
}

// ---------------------------------------------------------------------------
// Place search — what the "Where" box offers
// ---------------------------------------------------------------------------

export type PlaceKind = "locality" | "venue" | "event" | "landmark";

export interface Place {
  id: string;
  kind: PlaceKind;
  name: string;
  subtitle: string;
  lat: number;
  lng: number;
  /** How wide the match is, so the map frames it instead of guessing a zoom. */
  radiusKm: number;
  /** Set for `kind: "event"` — picking one can go straight to the event. */
  eventSlug?: string;
  eventCount?: number;
}

/**
 * Catalogue first, geocoder second.
 *
 * A shopper typing "Satellite" wants the locality with eleven Garba nights in
 * it, not the OSM node of the same name — so localities, venues and events are
 * offered ahead of anything the geocode adapter returns, and adapter results
 * that duplicate a catalogue name are dropped.
 */
export async function searchPlaces(
  cityId: string,
  query: string,
  near?: LatLng,
): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const [localities, venues, events] = await Promise.all([
    db.locality.findMany({
      where: { cityId, isActive: true, name: { contains: q, mode: "insensitive" } },
      take: 4,
      select: {
        id: true,
        name: true,
        lat: true,
        lng: true,
        _count: { select: { venues: true } },
      },
    }),
    db.venue.findMany({
      where: { cityId, name: { contains: q, mode: "insensitive" } },
      take: 4,
      select: {
        id: true,
        name: true,
        lat: true,
        lng: true,
        addressLine: true,
        locality: { select: { name: true } },
      },
    }),
    db.event.findMany({
      where: {
        cityId,
        status: "LIVE",
        title: { contains: q, mode: "insensitive" },
      },
      take: 4,
      orderBy: [{ trendingScore: "desc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        venue: {
          select: { name: true, lat: true, lng: true, locality: { select: { name: true } } },
        },
      },
    }),
  ]);

  const places: Place[] = [
    ...localities.map((l) => ({
      id: l.id,
      kind: "locality" as const,
      name: l.name,
      subtitle: `Locality · ${l._count.venues} ${l._count.venues === 1 ? "venue" : "venues"}`,
      lat: Number(l.lat),
      lng: Number(l.lng),
      radiusKm: 3,
    })),
    ...venues.map((v) => ({
      id: v.id,
      kind: "venue" as const,
      name: v.name,
      subtitle: v.locality ? `Venue · ${v.locality.name}` : `Venue · ${v.addressLine}`,
      lat: Number(v.lat),
      lng: Number(v.lng),
      radiusKm: 1,
    })),
    ...events.map((e) => ({
      id: e.id,
      kind: "event" as const,
      name: e.title,
      subtitle: `Event · ${e.venue.locality?.name ?? e.venue.name}`,
      lat: Number(e.venue.lat),
      lng: Number(e.venue.lng),
      radiusKm: 1,
      eventSlug: e.slug,
    })),
  ];

  // The geocoder only fills gaps the catalogue left, and never delays the
  // response past its own failure — a dead provider must not break the box.
  let external: GeocodeResult[] = [];
  try {
    external = await getGeocodeAdapter().search(q, near);
  } catch (err) {
    console.warn("[geocode] search failed, catalogue results only:", err);
  }

  const seen = new Set(places.map((p) => p.name.toLowerCase()));
  for (const g of external) {
    if (seen.has(g.name.toLowerCase())) continue;
    seen.add(g.name.toLowerCase());
    places.push({
      id: `geo:${g.name}`,
      kind: "landmark",
      name: g.name,
      subtitle: g.subtitle,
      lat: g.center.lat,
      lng: g.center.lng,
      radiusKm: g.radiusKm,
    });
  }

  return places.slice(0, 10);
}

// ---------------------------------------------------------------------------

/** "12 – 20 Oct" for a run of nights, "29 Aug" for one. */
function dateLabel(sessions: { startsAt: Date }[]): string {
  if (sessions.length === 0) return "Dates TBA";
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: "Asia/Kolkata",
    }).format(d);
  const first = sessions[0].startsAt;
  const last = sessions[sessions.length - 1].startsAt;
  return istDateKey(first) === istDateKey(last)
    ? fmt(first)
    : `${fmt(first)} – ${fmt(last)}`;
}
