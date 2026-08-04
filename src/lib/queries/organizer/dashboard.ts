import "server-only";

import { db } from "@/lib/db";
import { type OrganizerId, unsettledLedgerOf } from "./scope";

/**
 * Read-side queries for the organizer portal.
 *
 * Every exported function takes `OrganizerId` as its first parameter and puts
 * it in the `where`. That is not a convention to remember — audit check A12
 * reads this directory and fails the build on any exported function that
 * touches Prisma without an `organizerId` in scope, so a query that forgets is
 * a broken build rather than a data leak.
 *
 * Child models (`TicketTier`, `EventSession`, `Gate`) carry no `organizerId`
 * column, so ownership travels through the relation: `event: { organizerId }`.
 * A12 accepts that shape too.
 */

export interface OrganizerOverview {
  liveEvents: number;
  draftEvents: number;
  inReviewEvents: number;
  totalEvents: number;
  ticketsSold: number;
  grossPaise: number;
  unsettledPaise: number;
  bookingsToday: number;
  nextSession: { eventTitle: string; eventId: string; startsAt: Date } | null;
}

export async function getOrganizerOverview(
  organizerId: OrganizerId,
  now: Date = new Date(),
): Promise<OrganizerOverview> {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const [
    byStatus,
    ticketsSold,
    grossAgg,
    unsettledAgg,
    bookingsToday,
    nextSession,
  ] = await Promise.all([
    db.event.groupBy({
      by: ["status"],
      where: { organizerId },
      _count: { _all: true },
    }),
    db.ticket.count({
      where: { event: { organizerId }, status: { in: ["ACTIVE", "SCANNED"] } },
    }),
    db.booking.aggregate({
      where: { event: { organizerId }, status: "CONFIRMED" },
      _sum: { totalPaise: true },
    }),
    // The organizer's own unsettled money. `organizerId` is set only on
    // ORGANIZER-account legs, so this is their net after commission — not the
    // gross the attendee paid.
    db.ledgerEntry.aggregate({
      where: unsettledLedgerOf(organizerId),
      _sum: { amountPaise: true },
    }),
    db.booking.count({
      where: {
        event: { organizerId },
        status: "CONFIRMED",
        confirmedAt: { gte: startOfToday },
      },
    }),
    db.eventSession.findFirst({
      where: {
        event: { organizerId, status: { in: ["LIVE", "PAUSED"] } },
        startsAt: { gte: now },
        isActive: true,
      },
      orderBy: { startsAt: "asc" },
      select: {
        startsAt: true,
        event: { select: { id: true, title: true } },
      },
    }),
  ]);

  const count = (s: string) =>
    byStatus.find((r) => r.status === s)?._count._all ?? 0;

  return {
    liveEvents: count("LIVE"),
    draftEvents: count("DRAFT"),
    inReviewEvents: count("IN_REVIEW"),
    totalEvents: byStatus.reduce((s, r) => s + r._count._all, 0),
    ticketsSold,
    grossPaise: grossAgg._sum.totalPaise ?? 0,
    unsettledPaise: unsettledAgg._sum.amountPaise ?? 0,
    bookingsToday,
    nextSession: nextSession
      ? {
          eventId: nextSession.event.id,
          eventTitle: nextSession.event.title,
          startsAt: nextSession.startsAt,
        }
      : null,
  };
}

/** Sales for the last `days` days, for the dashboard sparkline. */
export async function getOrganizerSalesSeries(
  organizerId: OrganizerId,
  days = 14,
  now: Date = new Date(),
): Promise<{ day: string; paise: number; bookings: number }[]> {
  const from = new Date(now.getTime() - days * 86_400_000);
  const rows = await db.booking.findMany({
    where: {
      event: { organizerId },
      status: "CONFIRMED",
      confirmedAt: { gte: from },
    },
    select: { confirmedAt: true, totalPaise: true },
  });

  const buckets = new Map<string, { paise: number; bookings: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - (days - 1 - i) * 86_400_000);
    buckets.set(d.toISOString().slice(0, 10), { paise: 0, bookings: 0 });
  }
  for (const r of rows) {
    if (!r.confirmedAt) continue;
    const key = r.confirmedAt.toISOString().slice(0, 10);
    const b = buckets.get(key);
    if (!b) continue;
    b.paise += r.totalPaise;
    b.bookings += 1;
  }
  return [...buckets.entries()].map(([day, v]) => ({ day, ...v }));
}

/** Recent bookings across every event this organizer runs. */
export async function getOrganizerRecentBookings(
  organizerId: OrganizerId,
  take = 8,
) {
  return db.booking.findMany({
    where: { event: { organizerId }, status: "CONFIRMED" },
    orderBy: { confirmedAt: "desc" },
    take,
    select: {
      id: true,
      bookingNumber: true,
      totalPaise: true,
      confirmedAt: true,
      buyerName: true,
      event: { select: { id: true, title: true } },
      _count: { select: { tickets: true } },
    },
  });
}
