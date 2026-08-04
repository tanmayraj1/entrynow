import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Search suggestions for the header overlay.
 *
 * Scoped to one city and to LIVE events only — a suggestion the user cannot
 * open is worse than no suggestion.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const citySlug = url.searchParams.get("city") ?? "";

  if (q.length < 2) return NextResponse.json({ results: [] });

  const city = await db.city.findFirst({
    where: { slug: citySlug, isActive: true },
    select: { id: true, slug: true },
  });
  if (!city) return NextResponse.json({ results: [] });

  const [events, categories, organizers] = await Promise.all([
    db.event.findMany({
      where: {
        cityId: city.id,
        status: "LIVE",
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { summary: { contains: q, mode: "insensitive" } },
          { venue: { name: { contains: q, mode: "insensitive" } } },
        ],
      },
      orderBy: { trendingScore: "desc" },
      take: 5,
      select: { slug: true, title: true },
    }),
    db.category.findMany({
      where: { isActive: true, name: { contains: q, mode: "insensitive" } },
      take: 3,
      select: { slug: true, name: true },
    }),
    db.organizerProfile.findMany({
      where: {
        cityId: city.id,
        status: "VERIFIED",
        name: { contains: q, mode: "insensitive" },
      },
      take: 3,
      select: { slug: true, name: true },
    }),
  ]);

  const results = [
    ...events.map((e) => ({
      kind: "Event" as const,
      label: e.title,
      href: `/${city.slug}/events/${e.slug}`,
      glyph: "◈",
    })),
    ...categories.map((c) => ({
      kind: "Category" as const,
      label: c.name,
      href: `/${city.slug}/events?category=${c.slug}`,
      glyph: "▦",
    })),
    ...organizers.map((o) => ({
      kind: "Organizer" as const,
      label: o.name,
      href: `/${city.slug}/organizers/${o.slug}`,
      glyph: "◉",
    })),
  ];

  return NextResponse.json({ results });
}
