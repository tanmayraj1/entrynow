import "server-only";

import { db } from "@/lib/db";
import { fromPricePaise, tierRemaining, isTierOnSale } from "@/lib/availability";

/**
 * Does this event exist and may the public see it?
 *
 * A single indexed lookup, separate from `getEventDetail` on purpose. The page
 * has to decide 404-or-not **before** it opens a Suspense boundary — once a
 * boundary flushes, Next has committed a 200 and `notFound()` can only change
 * the body, not the status (D-037). So the cheap question is asked outside the
 * boundary and the expensive one inside it, which is what lets the page both
 * answer 404 correctly and still show a preloader while it loads.
 */
export async function eventIsPublic(
  citySlug: string,
  slug: string,
): Promise<boolean> {
  const row = await db.event.findFirst({
    where: {
      slug,
      city: { slug: citySlug },
      status: { in: ["LIVE", "PAUSED"] },
    },
    select: { id: true },
  });
  return row !== null;
}

/** Full event detail. Returns null for anything not publicly viewable. */
export async function getEventDetail(citySlug: string, slug: string) {
  const event = await db.event.findFirst({
    where: {
      slug,
      city: { slug: citySlug },
      // PAUSED events are hidden from listings but their page stays reachable
      // so existing ticket-holders can still find the venue and schedule.
      status: { in: ["LIVE", "PAUSED"] },
    },
    include: {
      category: true,
      festival: true,
      city: true,
      venue: { include: { locality: true } },
      organizer: {
        select: {
          id: true,
          slug: true,
          name: true,
          logoUrl: true,
          verified: true,
          ratingAvg: true,
          ratingCount: true,
          followerCount: true,
        },
      },
      sessions: { where: { isActive: true }, orderBy: { startsAt: "asc" } },
      tiers: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
      images: { orderBy: { sortOrder: "asc" } },
      faqs: { orderBy: { sortOrder: "asc" } },
      schedule: { orderBy: { sortOrder: "asc" } },
      gates: true,
      reviews: {
        where: { hiddenAt: null },
        orderBy: { createdAt: "desc" },
        take: 6,
        include: {
          user: { select: { name: true } },
          reply: { select: { body: true, createdAt: true } },
        },
      },
    },
  });

  if (!event) return null;

  const now = new Date();

  return {
    ...event,
    ratingAvg: Number(event.ratingAvg),
    fromPricePaise: fromPricePaise(event.tiers, now),
    tiers: event.tiers.map((t) => ({
      ...t,
      remaining: tierRemaining(t),
      onSale: isTierOnSale(t, now),
    })),
    upcomingSessions: event.sessions.filter((s) => s.endsAt >= now),
  };
}

export type EventDetail = NonNullable<Awaited<ReturnType<typeof getEventDetail>>>;

/** Rating histogram for the reviews block. */
export async function getRatingBreakdown(eventId: string) {
  const rows = await db.review.groupBy({
    by: ["rating"],
    where: { eventId, hiddenAt: null },
    _count: { _all: true },
  });
  const total = rows.reduce((s, r) => s + r._count._all, 0);
  return [5, 4, 3, 2, 1].map((star) => {
    const count = rows.find((r) => r.rating === star)?._count._all ?? 0;
    return { star, count, pct: total === 0 ? 0 : (count / total) * 100 };
  });
}

/** "Similar events" rail — same category and city, excluding this event. */
export async function getSimilarEvents(
  cityId: string,
  categoryId: string,
  excludeId: string,
  take = 4,
) {
  const now = new Date();
  const rows = await db.event.findMany({
    where: { cityId, categoryId, status: "LIVE", id: { not: excludeId } },
    orderBy: { trendingScore: "desc" },
    take,
    select: {
      id: true,
      slug: true,
      title: true,
      category: { select: { name: true, gradient: true } },
      venue: { select: { locality: { select: { name: true } }, name: true } },
      sessions: {
        where: { isActive: true },
        orderBy: { startsAt: "asc" },
        take: 1,
        select: { startsAt: true },
      },
      tiers: {
        select: {
          pricePaise: true,
          isActive: true,
          quantityTotal: true,
          quantitySold: true,
          quantityHeld: true,
          saleStartsAt: true,
          saleEndsAt: true,
        },
      },
    },
  });

  return rows.map((e) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    gradient: e.category.gradient,
    categoryName: e.category.name,
    locality: e.venue.locality?.name ?? e.venue.name,
    startsAt: e.sessions[0]?.startsAt ?? null,
    fromPricePaise: fromPricePaise(e.tiers, now),
  }));
}
