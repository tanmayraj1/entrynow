import "server-only";

import type { DisputeStatus, EventStatus } from "@/generated/prisma";
// A value import, not `import type`: `Prisma.join` builds the parameter list
// for the one raw query below, and a type-only import compiles to nothing.
import { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";

/**
 * Read-side queries for the platform admin.
 *
 * The mirror image of `queries/organizer/`: these are deliberately **not**
 * tenant-scoped, because oversight across every organizer is the entire point.
 * That is why they live in their own directory — audit check A12 reads
 * `queries/organizer/**` and requires an `organizerId` in every query there, so
 * putting a cross-tenant query in that directory would either fail the build or
 * force an exemption comment on something that is not an exception at all.
 *
 * The gate on this data is `requireAdmin(permission)` at the route and
 * `authorizeAdmin(permission)` in every action — not the query layer.
 *
 * **BigInt.** `Payout.amountPaise` and `PayoutItem.grossPaise|netPaise` are
 * BigInt and throw on JSON serialisation across the RSC boundary. Every one is
 * converted to `number` here, at the query layer, so no page has to remember.
 * Paise fits comfortably in a JS safe integer up to ₹90,000 crore.
 */

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export interface AdminOverview {
  pendingApprovals: number;
  pendingKyc: number;
  openDisputes: number;
  payoutsAwaiting: number;
  liveEvents: number;
  organizers: number;
  gmvPaise: number;
  platformNetPaise: number;
  ticketsSold: number;
  unsettledPaise: number;
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const [
    pendingApprovals,
    pendingKyc,
    openDisputes,
    payoutsAwaiting,
    liveEvents,
    organizers,
    gmv,
    platformNet,
    ticketsSold,
    unsettled,
  ] = await Promise.all([
    db.event.count({ where: { status: "IN_REVIEW" } }),
    db.organizerProfile.count({ where: { status: "KYC_IN_REVIEW" } }),
    db.dispute.count({ where: { status: { in: ["OPEN", "INVESTIGATING"] } } }),
    db.payout.count({ where: { status: { in: ["SCHEDULED", "PROCESSING"] } } }),
    db.event.count({ where: { status: "LIVE" } }),
    db.organizerProfile.count(),
    db.booking.aggregate({
      where: { status: "CONFIRMED" },
      _sum: { totalPaise: true },
    }),
    db.ledgerEntry.aggregate({
      where: { account: "PLATFORM" },
      _sum: { amountPaise: true },
    }),
    db.ticket.count({ where: { status: { in: ["ACTIVE", "SCANNED"] } } }),
    db.ledgerEntry.aggregate({
      where: { account: "ORGANIZER", payoutId: null },
      _sum: { amountPaise: true },
    }),
  ]);

  return {
    pendingApprovals,
    pendingKyc,
    openDisputes,
    payoutsAwaiting,
    liveEvents,
    organizers,
    gmvPaise: gmv._sum.totalPaise ?? 0,
    platformNetPaise: platformNet._sum.amountPaise ?? 0,
    ticketsSold,
    unsettledPaise: unsettled._sum.amountPaise ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export async function listReviewQueue(status: EventStatus = "IN_REVIEW") {
  return db.event.findMany({
    where: { status },
    orderBy: { submittedAt: "asc" },
    take: 60,
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      submittedAt: true,
      publishedAt: true,
      pendingChanges: true,
      coverImageUrl: true,
      summary: true,
      rejectionNote: true,
      category: { select: { name: true } },
      city: { select: { name: true } },
      venue: { select: { name: true, addressLine: true } },
      organizer: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          verified: true,
          _count: { select: { events: true } },
        },
      },
      sessions: {
        orderBy: { startsAt: "asc" },
        select: { id: true, sequence: true, startsAt: true, endsAt: true },
      },
      tiers: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          pricePaise: true,
          quantityTotal: true,
          quantitySold: true,
        },
      },
    },
  });
}

export async function countReviewQueue(): Promise<
  Record<EventStatus | "ALL", number>
> {
  const rows = await db.event.groupBy({
    by: ["status"],
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

// ---------------------------------------------------------------------------
// Organizers
// ---------------------------------------------------------------------------

export async function listOrganizers(opts: {
  q?: string;
  status?: string;
  page?: number;
  perPage?: number;
}) {
  const perPage = opts.perPage ?? 25;
  const page = Math.max(1, opts.page ?? 1);
  const where: Prisma.OrganizerProfileWhereInput = {
    ...(opts.status && opts.status !== "ALL"
      ? { status: opts.status as Prisma.EnumOrganizerStatusFilter["equals"] }
      : {}),
    ...(opts.q
      ? {
          OR: [
            { name: { contains: opts.q, mode: "insensitive" as const } },
            { legalName: { contains: opts.q, mode: "insensitive" as const } },
            { slug: { contains: opts.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.organizerProfile.count({ where }),
    db.organizerProfile.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        verified: true,
        plan: true,
        commissionPctOverride: true,
        kycSubmittedAt: true,
        suspendedAt: true,
        suspendedReason: true,
        createdAt: true,
        city: { select: { name: true } },
        user: { select: { phone: true, email: true } },
        _count: { select: { events: true } },
      },
    }),
  ]);

  // Balance, commission and GMV per organizer — three grouped queries rather
  // than three per row.
  const balances = new Map<string, number>();
  const commission = new Map<string, number>();
  let gmv = new Map<string, number>();
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    const [unsettled, fees, gross] = await Promise.all([
      db.ledgerEntry.groupBy({
        by: ["organizerId"],
        where: { organizerId: { in: ids }, payoutId: null },
        _sum: { amountPaise: true },
      }),
      db.ledgerEntry.groupBy({
        by: ["organizerId"],
        where: {
          organizerId: { in: ids },
          // Name the side — see the note in `listAllBookings`. Summing these
          // types across both legs yields zero.
          account: "ORGANIZER",
          type: { in: ["COMMISSION", "GST_COMMISSION"] },
        },
        _sum: { amountPaise: true },
      }),
      grossByOrganizer(ids),
    ]);
    for (const g of unsettled) {
      if (g.organizerId) balances.set(g.organizerId, g._sum.amountPaise ?? 0);
    }
    for (const g of fees) {
      // Commission legs are negative against the organizer; the platform reads
      // its own revenue as positive.
      if (g.organizerId) {
        commission.set(g.organizerId, Math.abs(g._sum.amountPaise ?? 0));
      }
    }
    gmv = gross;
  }

  return {
    total,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
    rows: rows.map((r) => ({
      ...r,
      commissionPctOverride: r.commissionPctOverride
        ? Number(r.commissionPctOverride)
        : null,
      unsettledPaise: balances.get(r.id) ?? 0,
      commissionPaise: commission.get(r.id) ?? 0,
      grossPaise: gmv.get(r.id) ?? 0,
    })),
  };
}

/**
 * Confirmed gross, grouped by organizer.
 *
 * Raw SQL for the same reason as `commissionByEvent` in the organizer's own
 * finance queries: the grouping key is one relation away — bookings know their
 * event, events know their organizer — and Prisma's `groupBy` cannot group by
 * a relation's column.
 *
 * `::bigint` then `Number()`, never `::int`: a cast back down to `int` throws
 * "integer out of range" once an organizer's lifetime gross passes ₹21.4M,
 * which is a busy season rather than a milestone. BigInt cannot cross the RSC
 * boundary, so it is narrowed here.
 */
async function grossByOrganizer(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const rows = await db.$queryRaw<{ organizerId: string; grossPaise: bigint }[]>`
    SELECT e."organizerId" AS "organizerId",
           SUM(b."totalPaise")::bigint AS "grossPaise"
      FROM bookings b
      JOIN events e ON e.id = b."eventId"
     WHERE e."organizerId" IN (${Prisma.join(ids)})
       AND b.status = 'CONFIRMED'
     GROUP BY e."organizerId"
  `;
  return new Map(rows.map((r) => [r.organizerId, Number(r.grossPaise)]));
}

export async function getOrganizerDetail(organizerId: string) {
  const [profile, events, unsettled, payouts] = await Promise.all([
    db.organizerProfile.findUnique({
      where: { id: organizerId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        verified: true,
        plan: true,
        legalName: true,
        businessType: true,
        contactEmail: true,
        contactPhone: true,
        addressLine: true,
        pincode: true,
        kycSubmittedAt: true,
        kycReviewedAt: true,
        kycRejectionReason: true,
        bankVerifiedAt: true,
        commissionPctOverride: true,
        suspendedAt: true,
        suspendedReason: true,
        createdAt: true,
        ratingAvg: true,
        ratingCount: true,
        city: { select: { name: true } },
        user: { select: { id: true, name: true, phone: true, email: true } },
        // Presence, not value — the numbers are never rendered to an admin
        // either, and `writeAudit` redacts them from the audit trail too.
        panNumber: true,
        gstNumber: true,
        bankAccountNumber: true,
      },
    }),
    db.event.findMany({
      where: { organizerId },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        title: true,
        status: true,
        publishedAt: true,
        createdAt: true,
        _count: { select: { bookings: true, tickets: true } },
      },
    }),
    db.ledgerEntry.aggregate({
      where: { organizerId, payoutId: null },
      _sum: { amountPaise: true },
    }),
    db.payout.findMany({
      where: { organizerId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        amountPaise: true,
        periodStart: true,
        periodEnd: true,
        paidAt: true,
        frozenReason: true,
      },
    }),
  ]);

  if (!profile) return null;

  // Lifetime money, fetched after the existence check so a bad id costs one
  // query rather than three.
  const [fees, gross] = await Promise.all([
    db.ledgerEntry.aggregate({
      where: {
        organizerId,
        account: "ORGANIZER",
        type: { in: ["COMMISSION", "GST_COMMISSION"] },
      },
      _sum: { amountPaise: true },
    }),
    grossByOrganizer([organizerId]),
  ]);

  return {
    profile: {
      ...profile,
      commissionPctOverride: profile.commissionPctOverride
        ? Number(profile.commissionPctOverride)
        : null,
      ratingAvg: Number(profile.ratingAvg),
      hasPan: Boolean(profile.panNumber),
      hasGst: Boolean(profile.gstNumber),
      hasBank: Boolean(profile.bankAccountNumber),
    },
    events,
    unsettledPaise: unsettled._sum.amountPaise ?? 0,
    // Positive: the platform's revenue from this organizer, not the negative
    // leg the ledger stores against them.
    commissionPaise: Math.abs(fees._sum.amountPaise ?? 0),
    grossPaise: gross.get(organizerId) ?? 0,
    payouts: payouts.map((p) => ({ ...p, amountPaise: Number(p.amountPaise) })),
  };
}

// ---------------------------------------------------------------------------
// Events (support view — every organizer's)
// ---------------------------------------------------------------------------

export async function listAllEvents(opts: {
  q?: string;
  status?: string;
  page?: number;
  perPage?: number;
}) {
  const perPage = opts.perPage ?? 25;
  const page = Math.max(1, opts.page ?? 1);
  const where: Prisma.EventWhereInput = {
    ...(opts.status && opts.status !== "ALL"
      ? { status: opts.status as EventStatus }
      : {}),
    ...(opts.q
      ? { title: { contains: opts.q, mode: "insensitive" as const } }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.event.count({ where }),
    db.event.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        publishedAt: true,
        cancelledAt: true,
        createdAt: true,
        organizer: { select: { id: true, name: true } },
        city: { select: { name: true, slug: true } },
        _count: { select: { bookings: true, tickets: true, disputes: true } },
      },
    }),
  ]);

  return { rows, total, pageCount: Math.max(1, Math.ceil(total / perPage)) };
}

export async function getAdminEvent(eventId: string) {
  return db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      summary: true,
      publishedAt: true,
      cancelledAt: true,
      cancelReason: true,
      pausedAt: true,
      pendingChanges: true,
      rejectionNote: true,
      organizer: { select: { id: true, name: true, status: true } },
      city: { select: { name: true, slug: true } },
      venue: { select: { name: true, addressLine: true } },
      sessions: {
        orderBy: { startsAt: "asc" },
        select: { id: true, sequence: true, startsAt: true, endsAt: true },
      },
      tiers: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          pricePaise: true,
          quantityTotal: true,
          quantitySold: true,
          quantityHeld: true,
        },
      },
      _count: { select: { bookings: true, tickets: true, disputes: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------

export async function listPayouts(status?: string) {
  const rows = await db.payout.findMany({
    where: status && status !== "ALL" ? { status: status as never } : {},
    orderBy: [{ status: "asc" }, { periodEnd: "desc" }],
    take: 80,
    select: {
      id: true,
      status: true,
      amountPaise: true,
      periodStart: true,
      periodEnd: true,
      approvedAt: true,
      paidAt: true,
      utr: true,
      frozenReason: true,
      statusBeforeFreeze: true,
      attemptCount: true,
      failureReason: true,
      organizer: { select: { id: true, name: true, status: true } },
    },
  });
  return rows.map((p) => ({ ...p, amountPaise: Number(p.amountPaise) }));
}

/** Unsettled balance per organizer — what the next payout run would pay. */
export async function getUnsettledByOrganizer() {
  const grouped = await db.ledgerEntry.groupBy({
    by: ["organizerId"],
    where: { account: "ORGANIZER", payoutId: null },
    _sum: { amountPaise: true },
  });
  const ids = grouped.map((g) => g.organizerId).filter((x): x is string => !!x);
  if (!ids.length) return [];

  const profiles = await db.organizerProfile.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, status: true, verified: true },
  });
  const byId = new Map(profiles.map((p) => [p.id, p]));

  return grouped
    .filter((g) => g.organizerId)
    .map((g) => ({
      organizerId: g.organizerId!,
      name: byId.get(g.organizerId!)?.name ?? "—",
      status: byId.get(g.organizerId!)?.status ?? "SIGNUP",
      unsettledPaise: g._sum.amountPaise ?? 0,
    }))
    .sort((a, b) => b.unsettledPaise - a.unsettledPaise);
}

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

export async function listDisputes(status?: DisputeStatus | "ALL") {
  return db.dispute.findMany({
    where: status && status !== "ALL" ? { status } : {},
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 60,
    select: {
      id: true,
      status: true,
      kind: true,
      summary: true,
      detail: true,
      refundPct: true,
      resolutionNote: true,
      resolvedAt: true,
      createdAt: true,
      booking: {
        select: {
          id: true,
          bookingNumber: true,
          totalPaise: true,
          status: true,
        },
      },
      event: {
        select: { id: true, title: true, organizer: { select: { name: true } } },
      },
      raisedBy: { select: { id: true, name: true, phone: true } },
    },
  });
}

export async function countDisputes(): Promise<
  Record<DisputeStatus | "ALL", number>
> {
  const rows = await db.dispute.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const out = {
    ALL: 0,
    OPEN: 0,
    INVESTIGATING: 0,
    RESOLVED_REFUND: 0,
    RESOLVED_REJECT: 0,
    RESOLVED_PARTIAL: 0,
  } as Record<DisputeStatus | "ALL", number>;
  for (const r of rows) {
    out[r.status] = r._count._all;
    out.ALL += r._count._all;
  }
  return out;
}

// ---------------------------------------------------------------------------
// CMS and config
// ---------------------------------------------------------------------------

export async function listCmsContent() {
  const [banners, cities, categories, festivals] = await Promise.all([
    db.banner.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        subtitle: true,
        status: true,
        startsAt: true,
        endsAt: true,
        sortOrder: true,
        city: { select: { name: true } },
      },
    }),
    db.city.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        state: true,
        isActive: true,
        _count: { select: { events: true } },
      },
    }),
    db.category.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        _count: { select: { events: true } },
      },
    }),
    db.festival.findMany({
      orderBy: { startsAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        startsAt: true,
        endsAt: true,
        _count: { select: { events: true } },
      },
    }),
  ]);
  return { banners, cities, categories, festivals };
}

export async function listConfig() {
  return db.configSetting.findMany({ orderBy: { key: "asc" } });
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export async function listAuditLog(opts: {
  entityType?: string;
  actorId?: string;
  action?: string;
  page?: number;
  perPage?: number;
}) {
  const perPage = opts.perPage ?? 40;
  const page = Math.max(1, opts.page ?? 1);
  const where: Prisma.AuditLogWhereInput = {
    ...(opts.entityType ? { entityType: opts.entityType } : {}),
    ...(opts.actorId ? { actorId: opts.actorId } : {}),
    ...(opts.action ? { action: { startsWith: opts.action } } : {}),
  };

  const [total, rows] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        actorType: true,
        action: true,
        entityType: true,
        entityId: true,
        before: true,
        after: true,
        ip: true,
        createdAt: true,
        actor: { select: { id: true, name: true, phone: true } },
      },
    }),
  ]);

  return { rows, total, pageCount: Math.max(1, Math.ceil(total / perPage)) };
}

/**
 * Every booking on the platform, newest first.
 *
 * The admin overview counts tickets sold but had nowhere to drill into, so the
 * one question an operator asks constantly — *"what actually sold, and to
 * whom"* — could only be answered against the database directly. This is that
 * list: every organizer's bookings in one place, searchable by booking number,
 * buyer, event or organizer.
 *
 * **Scanned counts come from `Ticket.status`, not from a scan-log count.** A
 * season pass is scanned once per session and writes a `SessionScan` child
 * rather than flipping the ticket (spec C7), so counting scan rows would
 * over-report attendance for exactly the events that sell the most passes.
 */
export async function listAllBookings(opts: {
  q?: string;
  status?: string;
  page?: number;
  perPage?: number;
}) {
  const perPage = opts.perPage ?? 25;
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim();

  const where: Prisma.BookingWhereInput = {
    ...(opts.status && opts.status !== "ALL"
      ? { status: opts.status as Prisma.EnumBookingStatusFilter["equals"] }
      : {}),
    ...(q
      ? {
          OR: [
            // Booking numbers are printed on the ticket and quoted in support
            // mail, so they are the most common thing pasted into this box.
            { bookingNumber: { contains: q, mode: "insensitive" as const } },
            { buyerName: { contains: q, mode: "insensitive" as const } },
            { buyerPhone: { contains: q } },
            { buyerEmail: { contains: q, mode: "insensitive" as const } },
            { user: { name: { contains: q, mode: "insensitive" as const } } },
            { user: { phone: { contains: q } } },
            { user: { email: { contains: q, mode: "insensitive" as const } } },
            { event: { title: { contains: q, mode: "insensitive" as const } } },
            {
              event: {
                organizer: { name: { contains: q, mode: "insensitive" as const } },
              },
            },
          ],
        }
      : {}),
  };

  const [total, totals, ticketTotal, rows] = await Promise.all([
    db.booking.count({ where }),
    // Totals span the whole filter, never just the visible page. A header
    // reading "₹41,532 across 25 bookings" while the pager says "page 3 of 9"
    // is describing the page and will be read as the total.
    db.booking.aggregate({ where, _sum: { totalPaise: true } }),
    db.ticket.count({ where: { booking: where } }),
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
        // The buyer may be a guest, who has no account name (D-036) — fall
        // back to the linked user in the page rather than showing a blank.
        buyerName: true,
        buyerPhone: true,
        buyerEmail: true,
        user: { select: { id: true, name: true, phone: true, email: true } },
        event: {
          select: {
            id: true,
            title: true,
            organizer: { select: { id: true, name: true } },
          },
        },
        _count: { select: { tickets: true } },
      },
    }),
  ]);

  // Two grouped queries rather than per-row counts: scanned tickets, and what
  // the platform earned on each booking.
  const ids = rows.map((r) => r.id);
  const scanned = new Map<string, number>();
  const commission = new Map<string, number>();

  if (ids.length) {
    const [scans, fees] = await Promise.all([
      db.ticket.groupBy({
        by: ["bookingId"],
        where: { bookingId: { in: ids }, status: "SCANNED" },
        _count: { _all: true },
      }),
      db.ledgerEntry.groupBy({
        by: ["bookingId"],
        where: {
          bookingId: { in: ids },
          type: { in: ["COMMISSION", "GST_COMMISSION"] },
          // `account` is not optional here, it is the whole query.
          //
          // Commission is double-entry: every charge writes a PLATFORM leg of
          // +X and an ORGANIZER leg of −X, which is exactly what makes a
          // booking's entries sum to zero (I3). Filtering by `type` alone sums
          // both legs and returns 0.00 for every booking — a column of dashes
          // that looks like "no commission configured" rather than like a bug.
          //
          // The organizer-side queries get away without this because they
          // filter on `organizerId`, which is only populated on ORGANIZER
          // legs. This one groups by booking, so it must say which side it
          // means: PLATFORM, because this is the platform's own revenue.
          account: "PLATFORM",
        },
        _sum: { amountPaise: true },
      }),
    ]);
    for (const s of scans) scanned.set(s.bookingId, s._count._all);
    for (const f of fees) {
      // Already positive: the PLATFORM leg is the credit side.
      if (f.bookingId) commission.set(f.bookingId, f._sum.amountPaise ?? 0);
    }
  }

  return {
    total,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
    grossPaise: totals._sum.totalPaise ?? 0,
    ticketTotal,
    rows: rows.map((r) => ({
      ...r,
      ticketCount: r._count.tickets,
      scannedCount: scanned.get(r.id) ?? 0,
      commissionPaise: commission.get(r.id) ?? 0,
    })),
  };
}
