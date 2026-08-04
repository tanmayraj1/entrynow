import "server-only";

import type { EventStatus, Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import type { OrganizerId } from "./scope";

/** Everything the events list needs, flattened so Prisma types stay server-side. */
export interface OrganizerEventRow {
  id: string;
  slug: string;
  title: string;
  status: EventStatus;
  coverImageUrl: string | null;
  categoryName: string;
  venueName: string;
  cityName: string;
  firstSessionAt: Date | null;
  sessionCount: number;
  capacity: number;
  sold: number;
  grossPaise: number;
  hasPendingChanges: boolean;
  rejectionNote: string | null;
  createdAt: Date;
}

export async function listOrganizerEvents(
  organizerId: OrganizerId,
  opts: {
    status?: EventStatus | "ALL";
    q?: string;
    page?: number;
    perPage?: number;
  } = {},
): Promise<{ rows: OrganizerEventRow[]; total: number; pageCount: number }> {
  const perPage = opts.perPage ?? 12;
  const page = Math.max(1, opts.page ?? 1);

  const where: Prisma.EventWhereInput = {
    organizerId,
    ...(opts.status && opts.status !== "ALL" ? { status: opts.status } : {}),
    ...(opts.q
      ? { title: { contains: opts.q, mode: "insensitive" as const } }
      : {}),
  };

  const [total, events] = await Promise.all([
    db.event.count({ where }),
    db.event.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        coverImageUrl: true,
        pendingChanges: true,
        rejectionNote: true,
        createdAt: true,
        category: { select: { name: true } },
        venue: { select: { name: true } },
        city: { select: { name: true } },
        tiers: {
          select: { quantityTotal: true, quantitySold: true },
        },
        sessions: {
          where: { isActive: true },
          orderBy: { startsAt: "asc" },
          select: { startsAt: true },
        },
      },
    }),
  ]);

  // Revenue per event in one grouped query rather than N+1 aggregates.
  const grossByEvent = new Map<string, number>();
  if (events.length) {
    const grouped = await db.booking.groupBy({
      by: ["eventId"],
      where: {
        status: "CONFIRMED",
        eventId: { in: events.map((e) => e.id) },
        event: { organizerId },
      },
      _sum: { totalPaise: true },
    });
    for (const g of grouped) grossByEvent.set(g.eventId, g._sum.totalPaise ?? 0);
  }

  return {
    total,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
    rows: events.map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      status: e.status,
      coverImageUrl: e.coverImageUrl,
      categoryName: e.category.name,
      venueName: e.venue.name,
      cityName: e.city.name,
      firstSessionAt: e.sessions[0]?.startsAt ?? null,
      sessionCount: e.sessions.length,
      capacity: e.tiers.reduce((s, t) => s + t.quantityTotal, 0),
      sold: e.tiers.reduce((s, t) => s + t.quantitySold, 0),
      grossPaise: grossByEvent.get(e.id) ?? 0,
      hasPendingChanges: e.pendingChanges !== null,
      rejectionNote: e.rejectionNote,
      createdAt: e.createdAt,
    })),
  };
}

/** Counts for the status tab strip. Zero-filled so a tab never disappears. */
export async function countOrganizerEventsByStatus(
  organizerId: OrganizerId,
): Promise<Record<EventStatus | "ALL", number>> {
  const rows = await db.event.groupBy({
    by: ["status"],
    where: { organizerId },
    _count: { _all: true },
  });
  const out = {
    ALL: 0,
    DRAFT: 0,
    IN_REVIEW: 0,
    REJECTED: 0,
    LIVE: 0,
    PAUSED: 0,
    COMPLETED: 0,
    CANCELLED: 0,
  } as Record<EventStatus | "ALL", number>;
  for (const r of rows) {
    out[r.status] = r._count._all;
    out.ALL += r._count._all;
  }
  return out;
}

/**
 * One event with everything the edit screen needs.
 *
 * `findFirst`, never `findUnique`: the unique form takes only the id, leaving
 * nowhere to put the ownership filter, so it would happily return another
 * organizer's event. A12 flags `findUnique` on a tenant model for exactly this
 * reason.
 */
export async function getOrganizerEvent(
  organizerId: OrganizerId,
  eventId: string,
) {
  return db.event.findFirst({
    where: { id: eventId, organizerId },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      city: { select: { id: true, name: true, slug: true } },
      venue: { select: { id: true, name: true, addressLine: true } },
      festival: { select: { id: true, name: true } },
      sessions: { orderBy: { sequence: "asc" } },
      tiers: { orderBy: { sortOrder: "asc" } },
      gates: { orderBy: { code: "asc" } },
      faqs: { orderBy: { sortOrder: "asc" } },
      schedule: { orderBy: { sortOrder: "asc" } },
      images: { orderBy: { sortOrder: "asc" } },
      _count: { select: { bookings: true, tickets: true } },
    },
  });
}

/** Bookings for one owned event. */
export async function listEventBookings(
  organizerId: OrganizerId,
  eventId: string,
  opts: { page?: number; perPage?: number; q?: string } = {},
) {
  const perPage = opts.perPage ?? 25;
  const page = Math.max(1, opts.page ?? 1);

  const where: Prisma.BookingWhereInput = {
    eventId,
    // Both halves matter. `eventId` alone would serve any event's bookings to
    // anyone who guessed an id; the relation filter is what makes the URL
    // parameter harmless.
    event: { organizerId },
    ...(opts.q
      ? {
          OR: [
            { bookingNumber: { contains: opts.q, mode: "insensitive" as const } },
            { buyerName: { contains: opts.q, mode: "insensitive" as const } },
            { buyerPhone: { contains: opts.q } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.booking.count({ where }),
    db.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        bookingNumber: true,
        status: true,
        totalPaise: true,
        createdAt: true,
        confirmedAt: true,
        buyerName: true,
        buyerPhone: true,
        _count: { select: { tickets: true } },
        items: {
          select: {
            quantity: true,
            tier: { select: { name: true } },
            session: { select: { sequence: true, startsAt: true } },
          },
        },
      },
    }),
  ]);

  return {
    rows,
    total,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
  };
}

/** Live gate board: scan counts per gate and per tier for one owned event. */
export async function getEventLiveBoard(
  organizerId: OrganizerId,
  eventId: string,
) {
  const event = await db.event.findFirst({
    where: { id: eventId, organizerId },
    select: {
      id: true,
      title: true,
      gatesClosedAt: true,
      status: true,
      gates: { select: { id: true, name: true, code: true } },
      tiers: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          quantityTotal: true,
          quantitySold: true,
          quantityHeld: true,
        },
      },
    },
  });
  if (!event) return null;

  const [scannedByTier, scannedByGate, totals] = await Promise.all([
    db.ticket.groupBy({
      by: ["tierId"],
      where: { eventId, event: { organizerId }, status: "SCANNED" },
      _count: { _all: true },
    }),
    db.ticket.groupBy({
      by: ["scannedGateId"],
      where: {
        eventId,
        event: { organizerId },
        status: "SCANNED",
        scannedGateId: { not: null },
      },
      _count: { _all: true },
    }),
    db.ticket.groupBy({
      by: ["status"],
      where: { eventId, event: { organizerId } },
      _count: { _all: true },
    }),
  ]);

  const scanByTier = new Map(
    scannedByTier.map((r) => [r.tierId, r._count._all]),
  );
  const scanByGate = new Map(
    scannedByGate.map((r) => [r.scannedGateId ?? "", r._count._all]),
  );

  return {
    event: {
      id: event.id,
      title: event.title,
      status: event.status,
      gatesClosedAt: event.gatesClosedAt,
    },
    tiers: event.tiers.map((t) => ({
      id: t.id,
      name: t.name,
      sold: t.quantitySold,
      held: t.quantityHeld,
      total: t.quantityTotal,
      scanned: scanByTier.get(t.id) ?? 0,
    })),
    gates: event.gates.map((g) => ({
      id: g.id,
      name: g.name,
      code: g.code,
      scanned: scanByGate.get(g.id) ?? 0,
    })),
    ticketTotals: {
      active: totals.find((t) => t.status === "ACTIVE")?._count._all ?? 0,
      scanned: totals.find((t) => t.status === "SCANNED")?._count._all ?? 0,
      cancelled: totals.find((t) => t.status === "CANCELLED")?._count._all ?? 0,
    },
  };
}

/** Scanner staff assigned to one owned event. */
export async function listEventStaff(
  organizerId: OrganizerId,
  eventId: string,
) {
  return db.staffAssignment.findMany({
    where: { eventId, event: { organizerId } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      canOverride: true,
      createdAt: true,
      user: { select: { id: true, name: true, phone: true } },
      gate: { select: { id: true, name: true, code: true } },
    },
  });
}
