import "server-only";

import { db } from "@/lib/db";
import { type OrganizerId, unsettledLedgerOf } from "./scope";

/**
 * The organizer's money.
 *
 * `LedgerEntry.organizerId` is populated on ORGANIZER-account legs only, and
 * `payoutId IS NULL` means "not yet swept into a settlement" — together they
 * are the unsettled balance, served exactly by `@@index([organizerId,
 * payoutId])`. No aggregation over bookings is needed or wanted: the ledger is
 * the record, and a booking-level sum would count gross rather than net of
 * commission.
 */

export interface OrganizerFinanceSummary {
  unsettledPaise: number;
  lifetimeNetPaise: number;
  paidOutPaise: number;
  commissionPaise: number;
  nextPayoutAt: Date | null;
}

export async function getOrganizerFinanceSummary(
  organizerId: OrganizerId,
): Promise<OrganizerFinanceSummary> {
  const [unsettled, lifetime, paidOut, commission, scheduled] =
    await Promise.all([
      db.ledgerEntry.aggregate({
        where: unsettledLedgerOf(organizerId),
        _sum: { amountPaise: true },
      }),
      db.ledgerEntry.aggregate({
        where: { organizerId },
        _sum: { amountPaise: true },
      }),
      db.payout.aggregate({
        where: { organizerId, status: "PAID" },
        _sum: { amountPaise: true },
      }),
      db.ledgerEntry.aggregate({
        where: {
          organizerId,
          type: { in: ["COMMISSION", "GST_COMMISSION"] },
        },
        _sum: { amountPaise: true },
      }),
      db.payout.findFirst({
        where: { organizerId, status: { in: ["SCHEDULED", "ACCRUING"] } },
        orderBy: { periodEnd: "asc" },
        select: { periodEnd: true },
      }),
    ]);

  return {
    unsettledPaise: unsettled._sum.amountPaise ?? 0,
    lifetimeNetPaise: lifetime._sum.amountPaise ?? 0,
    // BigInt does not survive the RSC boundary — it throws on serialisation.
    // Converted here, at the query layer, so no page has to remember.
    paidOutPaise: Number(paidOut._sum.amountPaise ?? 0),
    // Commission legs are negative on the organizer's side; report the cost as
    // a positive number, which is how an operator reads a fee.
    commissionPaise: Math.abs(commission._sum.amountPaise ?? 0),
    nextPayoutAt: scheduled?.periodEnd ?? null,
  };
}

export async function listOrganizerPayouts(organizerId: OrganizerId, take = 20) {
  const rows = await db.payout.findMany({
    where: { organizerId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      status: true,
      amountPaise: true,
      periodStart: true,
      periodEnd: true,
      paidAt: true,
      utr: true,
      invoiceUrl: true,
      frozenReason: true,
      items: {
        select: {
          grossPaise: true,
          netPaise: true,
          event: { select: { id: true, title: true } },
        },
      },
    },
  });

  return rows.map((p) => ({
    ...p,
    amountPaise: Number(p.amountPaise),
    items: p.items.map((i) => ({
      ...i,
      grossPaise: Number(i.grossPaise),
      netPaise: Number(i.netPaise),
    })),
  }));
}

/** The ledger itself, for the organizer who wants to see the arithmetic. */
export async function listOrganizerLedger(
  organizerId: OrganizerId,
  opts: { page?: number; perPage?: number; unsettledOnly?: boolean } = {},
) {
  const perPage = opts.perPage ?? 30;
  const page = Math.max(1, opts.page ?? 1);
  const where = opts.unsettledOnly
    ? unsettledLedgerOf(organizerId)
    : { organizerId };

  const [total, rows] = await Promise.all([
    db.ledgerEntry.count({ where }),
    db.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        type: true,
        account: true,
        amountPaise: true,
        memo: true,
        createdAt: true,
        payoutId: true,
        booking: {
          select: {
            bookingNumber: true,
            event: { select: { title: true } },
          },
        },
      },
    }),
  ]);

  return { rows, total, pageCount: Math.max(1, Math.ceil(total / perPage)) };
}

/** Revenue per event — the breakdown an organizer actually asks for. */
export async function getRevenueByEvent(organizerId: OrganizerId) {
  const grouped = await db.booking.groupBy({
    by: ["eventId"],
    where: { event: { organizerId }, status: "CONFIRMED" },
    _sum: { totalPaise: true },
    _count: { _all: true },
  });
  if (!grouped.length) return [];

  const events = await db.event.findMany({
    where: { organizerId, id: { in: grouped.map((g) => g.eventId) } },
    select: { id: true, title: true, status: true },
  });
  const byId = new Map(events.map((e) => [e.id, e]));

  return grouped
    .map((g) => ({
      eventId: g.eventId,
      title: byId.get(g.eventId)?.title ?? "—",
      status: byId.get(g.eventId)?.status ?? "DRAFT",
      grossPaise: g._sum.totalPaise ?? 0,
      bookings: g._count._all,
    }))
    .sort((a, b) => b.grossPaise - a.grossPaise);
}

/** Promo codes this organizer owns, plus their own event-scoped ones. */
export async function listOrganizerPromos(organizerId: OrganizerId) {
  return db.promo.findMany({
    where: {
      OR: [{ organizerId }, { event: { organizerId } }],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      description: true,
      discountFlatPaise: true,
      discountPct: true,
      maxDiscountPaise: true,
      minAmountPaise: true,
      usageLimit: true,
      usedCount: true,
      reservedCount: true,
      perUserLimit: true,
      startsAt: true,
      endsAt: true,
      isActive: true,
      event: { select: { id: true, title: true } },
    },
  });
}

/** Announcements sent for an owned event, newest first (spec E3's 3/week cap). */
export async function listOrganizerAnnouncements(
  organizerId: OrganizerId,
  take = 40,
) {
  return db.announcement.findMany({
    where: { organizerId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      subject: true,
      body: true,
      audienceCount: true,
      bypassesCap: true,
      sentAt: true,
      createdAt: true,
      event: { select: { id: true, title: true } },
    },
  });
}
