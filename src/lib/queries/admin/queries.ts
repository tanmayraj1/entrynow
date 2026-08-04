import "server-only";

import type { DisputeStatus, EventStatus, Prisma } from "@/generated/prisma";
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

  // Unsettled balance per organizer, in one grouped query rather than N.
  const balances = new Map<string, number>();
  if (rows.length) {
    const grouped = await db.ledgerEntry.groupBy({
      by: ["organizerId"],
      where: {
        organizerId: { in: rows.map((r) => r.id) },
        payoutId: null,
      },
      _sum: { amountPaise: true },
    });
    for (const g of grouped) {
      if (g.organizerId) balances.set(g.organizerId, g._sum.amountPaise ?? 0);
    }
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
    })),
  };
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
