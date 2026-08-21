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

  const [events, commission] = await Promise.all([
    db.event.findMany({
      where: { organizerId, id: { in: grouped.map((g) => g.eventId) } },
      select: { id: true, title: true, status: true },
    }),
    commissionByEvent(organizerId),
  ]);
  const byId = new Map(events.map((e) => [e.id, e]));

  return grouped
    .map((g) => {
      const grossPaise = g._sum.totalPaise ?? 0;
      const commissionPaise = commission.get(g.eventId) ?? 0;
      return {
        eventId: g.eventId,
        title: byId.get(g.eventId)?.title ?? "—",
        status: byId.get(g.eventId)?.status ?? "DRAFT",
        grossPaise,
        // What the platform charged on this event — commission plus the GST on
        // it, reported positive because that is how a fee reads on an invoice.
        commissionPaise,
        // Gross minus our cut. Not the same as the organizer's ledger balance
        // for the event: refunds, wallet redemptions and the attendee-paid
        // booking fee all move that too. Labelled "after commission" in the UI
        // rather than "payout" for exactly that reason.
        netPaise: grossPaise - commissionPaise,
        bookings: g._count._all,
      };
    })
    .sort((a, b) => b.grossPaise - a.grossPaise);
}

/**
 * Commission charged, grouped by event.
 *
 * Raw SQL because the grouping key lives one relation away: commission is
 * recorded on `LedgerEntry`, which knows its `bookingId`, and the event is on
 * the booking. Prisma's `groupBy` cannot group by a relation's column, and the
 * alternatives are both worse — grouping by `bookingId` pulls one row per
 * booking into memory to fold by hand, and a per-event subquery is N+1.
 *
 * The `::bigint` and the `Number()` are a pair, and both are load-bearing.
 * Postgres widens `SUM` to `bigint` on its own; casting back down to `int`
 * would be tidier to read and would *throw* — "integer out of range" — the day
 * one event's commission passes ₹21.4M, which is only a few thousand tickets
 * at the top end. A BigInt cannot cross the RSC boundary either (it throws on
 * serialisation), so it is narrowed to a `number` here, at the query layer,
 * where paise stay exact well past any figure this platform will see.
 *
 * Signs are flipped on the way out. Commission legs are negative against the
 * organizer (money leaving them); the number an operator wants to read is the
 * positive cost.
 *
 * The `account = 'ORGANIZER'` filter is redundant *today* — `organizerId` is
 * only populated on organizer-side legs — but the redundancy is the point.
 * Every commission charge also writes a mirrored `PLATFORM` leg of the
 * opposite sign, so anything that sums these types without naming a side gets
 * exactly zero back. Stating the side means this query cannot silently start
 * returning nothing if `organizerId` is ever set on both legs.
 */
async function commissionByEvent(
  organizerId: OrganizerId,
): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<{ eventId: string; amountPaise: bigint }[]>`
    SELECT b."eventId" AS "eventId",
           SUM(l."amountPaise")::bigint AS "amountPaise"
      FROM ledger_entries l
      JOIN bookings b ON b.id = l."bookingId"
     WHERE l."organizerId" = ${organizerId}
       AND l."account" = 'ORGANIZER'
       AND l."type" IN ('COMMISSION', 'GST_COMMISSION')
     GROUP BY b."eventId"
  `;
  return new Map(rows.map((r) => [r.eventId, Math.abs(Number(r.amountPaise))]));
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
