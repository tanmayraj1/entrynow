import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getMapPins } from "@/lib/queries/map";
import type { Bounds } from "@/lib/geo";

/**
 * Pins inside a map viewport.
 *
 * Called on every map idle, so it stays a narrow projection and a bounded
 * result set. `north/south/east/west` come straight from the client's
 * viewport; anything unparseable falls back to the whole city rather than
 * erroring, because an empty map is a worse answer than a wide one.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const citySlug = url.searchParams.get("city") ?? "";

  const city = await db.city.findFirst({
    where: { slug: citySlug, isActive: true },
    select: { id: true },
  });
  if (!city) return NextResponse.json({ pins: [] });

  const bounds = parseBounds(url.searchParams);
  const origin = parsePoint(url.searchParams, "olat", "olng");

  const pins = await getMapPins(city.id, {
    bounds,
    origin,
    q: url.searchParams.get("q") || undefined,
    category: url.searchParams.get("category") || undefined,
  });

  return NextResponse.json({ pins });
}

function parseBounds(sp: URLSearchParams): Bounds | undefined {
  const n = Number(sp.get("north"));
  const s = Number(sp.get("south"));
  const e = Number(sp.get("east"));
  const w = Number(sp.get("west"));
  if (![n, s, e, w].every(Number.isFinite)) return undefined;
  // A viewport that has been dragged across the antimeridian would invert
  // east/west; normalising keeps the SQL range valid.
  return {
    north: Math.max(n, s),
    south: Math.min(n, s),
    east: Math.max(e, w),
    west: Math.min(e, w),
  };
}

function parsePoint(sp: URLSearchParams, latKey: string, lngKey: string) {
  const rawLat = sp.get(latKey);
  const rawLng = sp.get(lngKey);
  // Presence check FIRST. `Number(null)` is 0, not NaN, so a missing origin
  // used to parse as {lat: 0, lng: 0} — the Gulf of Guinea — and every event
  // in Ahmedabad came back "8218.1 km away".
  if (rawLat === null || rawLng === null) return null;
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
