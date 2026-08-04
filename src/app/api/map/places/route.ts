import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { searchPlaces } from "@/lib/queries/map";

/**
 * Autocomplete for the map's "Where" box — localities, venues and events from
 * the catalogue, then landmarks from the geocode adapter.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const citySlug = url.searchParams.get("city") ?? "";

  if (q.length < 2) return NextResponse.json({ places: [] });

  const city = await db.city.findFirst({
    where: { slug: citySlug, isActive: true },
    select: { id: true, lat: true, lng: true },
  });
  if (!city) return NextResponse.json({ places: [] });

  const places = await searchPlaces(city.id, q, {
    lat: Number(city.lat),
    lng: Number(city.lng),
  });

  return NextResponse.json({ places });
}
