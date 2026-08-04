import "server-only";

import { db } from "@/lib/db";
import { getBusinessConfig, resolveCommissionPct } from "@/lib/config";
import { computeOrderTotals, type OrderTotals } from "@/lib/money";
import { isTierOnSale, tierRemaining } from "@/lib/availability";
import {
  cuidish,
  holdSeats,
  releaseSeats,
  releasePromo,
  reservePromo,
  type Tx,
} from "./inventory";
import { scheduleHoldRelease } from "@/lib/jobs/hold-release";

/**
 * Booking creation — one transaction, taking a real inventory hold.
 *
 * This closes D-014, which deliberately shipped `/booking/new` with NO hold
 * because the release did not exist yet and a hold without a release leaks
 * seats permanently. The hold and its release land together, and the release
 * has two independent triggers so a dead job runner cannot strand inventory:
 *
 *   1. a delayed BullMQ job, scheduled here for `expiresAt`;
 *   2. an opportunistic sweep of *this event's* expired holds, run at the top
 *      of every create (`releaseExpiredHolds`).
 *
 * (2) is the one that matters. A queue is infrastructure that can be down, and
 * "the worker was not running" must never mean "these seats are gone forever".
 * Anyone trying to buy the seat is, by definition, executing the code that
 * reclaims it (D-022).
 */

export type CreateBookingResult =
  | { ok: true; bookingId: string; bookingNumber: string; expiresAt: Date }
  | {
      ok: false;
      code:
        | "EVENT_UNAVAILABLE"
        | "SESSION_INVALID"
        | "TIER_INVALID"
        | "SOLD_OUT"
        | "PER_USER_LIMIT"
        | "PROMO_INVALID";
      message: string;
      /** Per-tier availability, so the UI can repair the selection in place
       *  rather than sending the user back to start again (spec C4.2b). */
      availability?: { tierId: string; tierName: string; remaining: number }[];
    };

export interface CreateBookingInput {
  userId: string;
  eventSlug: string;
  sessionId?: string | null;
  lines: { tierId: string; quantity: number }[];
  promoCode?: string | null;
  useWallet?: boolean;
  buyer?: { name?: string; phone?: string; email?: string };
}

export async function createBooking(
  input: CreateBookingInput,
): Promise<CreateBookingResult> {
  const cfg = await getBusinessConfig();

  const event = await db.event.findFirst({
    where: { slug: input.eventSlug },
    select: {
      id: true,
      status: true,
      shortCode: true,
      organizerId: true,
      organizer: { select: { commissionPctOverride: true } },
      sessions: { where: { isActive: true }, select: { id: true, endsAt: true } },
    },
  });
  if (!event || event.status !== "LIVE") {
    return {
      ok: false,
      code: "EVENT_UNAVAILABLE",
      message: "This event is not on sale.",
    };
  }

  // Reclaim anything this event is holding past its expiry before we test
  // availability — otherwise an abandoned checkout makes a tier look sold out
  // to the very next buyer.
  await releaseExpiredHolds(event.id);

  if (input.sessionId) {
    const session = event.sessions.find((s) => s.id === input.sessionId);
    // A session that has already finished cannot be booked, even while other
    // nights of the same event are still selling.
    if (!session || session.endsAt < new Date()) {
      return {
        ok: false,
        code: "SESSION_INVALID",
        message: "That night is no longer available.",
      };
    }
  }

  const requested = input.lines.filter((l) => Number.isInteger(l.quantity) && l.quantity > 0);
  if (requested.length === 0) {
    return { ok: false, code: "TIER_INVALID", message: "No tickets selected." };
  }

  const commissionPct = resolveCommissionPct(
    event.organizer.commissionPctOverride
      ? Number(event.organizer.commissionPctOverride)
      : null,
    cfg,
  );

  try {
    return await db.$transaction(async (tx) => {
      const now = new Date();

      const tiers = await tx.ticketTier.findMany({
        where: { id: { in: requested.map((l) => l.tierId) }, eventId: event.id },
    });
    if (tiers.length !== requested.length) {
      throw new BookingRejected({
        ok: false,
        code: "TIER_INVALID",
        message: "One of those ticket types no longer exists.",
      });
    }

    // --- Sale window and per-user limit ---------------------------------
    // Invariant I4: prices are read here, from the database. Nothing the
    // client sent about money is used.
    const priced = requested.map((r) => {
      const tier = tiers.find((t) => t.id === r.tierId)!;
      return { tier, quantity: r.quantity };
    });

    for (const { tier } of priced) {
      if (!isTierOnSale(tier, now)) {
        throw new BookingRejected({
          ok: false,
          code: "TIER_INVALID",
          message: `${tier.name} is not on sale right now.`,
        });
      }
    }

    // Spec C4.2a: the cap is across ALL of this user's confirmed bookings,
    // not per booking — a per-booking cap is evaded by booking twice.
    const priorByTier = await tx.bookingItem.groupBy({
      by: ["tierId"],
      where: {
        tierId: { in: priced.map((p) => p.tier.id) },
        booking: { userId: input.userId, status: "CONFIRMED" },
      },
      _sum: { quantity: true },
    });
    for (const { tier, quantity } of priced) {
      const prior =
        priorByTier.find((p) => p.tierId === tier.id)?._sum.quantity ?? 0;
      if (prior + quantity > tier.perUserLimit) {
        throw new BookingRejected({
          ok: false,
          code: "PER_USER_LIMIT",
          message:
            prior > 0
              ? `${tier.name} is limited to ${tier.perUserLimit} per person, and you already have ${prior}.`
              : `${tier.name} is limited to ${tier.perUserLimit} per person.`,
        });
      }
    }

    // --- The atomic hold (invariant I1) ---------------------------------
    // Held one tier at a time; the moment any tier fails, the whole
    // transaction rolls back, so a multi-tier order is all-or-nothing and
    // never leaves a partial hold behind.
    const held: { tierId: string; quantity: number }[] = [];
    for (const { tier, quantity } of priced) {
      const ok = await holdSeats(tx, tier.id, quantity);
      if (!ok) {
        // Re-read every tier so the caller can show what IS available,
        // rather than a bare failure (spec C4.2b).
        const fresh = await tx.ticketTier.findMany({
          where: { id: { in: priced.map((p) => p.tier.id) } },
        });
        throw new BookingRejected({
          ok: false,
          code: "SOLD_OUT",
          message: `${tier.name} does not have ${quantity} left.`,
          availability: fresh.map((t) => ({
            tierId: t.id,
            tierName: t.name,
            remaining: tierRemaining(t),
          })),
        });
      }
      held.push({ tierId: tier.id, quantity });
    }

    // --- Promo ----------------------------------------------------------
    let promoId: string | null = null;
    let discountPaise = 0;
    const subtotal = priced.reduce(
      (s, p) => s + p.tier.pricePaise * p.quantity,
      0,
    );

    if (input.promoCode) {
      const promo = await tx.promo.findUnique({
        where: { code: input.promoCode.trim().toUpperCase() },
      });
      const valid =
        promo &&
        promo.isActive &&
        (!promo.eventId || promo.eventId === event.id) &&
        (!promo.startsAt || promo.startsAt <= now) &&
        (!promo.endsAt || promo.endsAt >= now) &&
        subtotal >= promo.minAmountPaise;

      if (!valid) {
        throw new BookingRejected({
          ok: false,
          code: "PROMO_INVALID",
          message: "That promo code is not valid for this order.",
        });
      }

      const usedByUser = await tx.promoRedemption.count({
        where: { promoId: promo.id, userId: input.userId },
      });
      if (usedByUser >= promo.perUserLimit) {
        throw new BookingRejected({
          ok: false,
          code: "PROMO_INVALID",
          message: "You have already used that code.",
        });
      }

      if (!(await reservePromo(tx, promo.id))) {
        throw new BookingRejected({
          ok: false,
          code: "PROMO_INVALID",
          message: "That code has just reached its usage limit.",
        });
      }

      promoId = promo.id;
      const raw = promo.discountFlatPaise
        ? promo.discountFlatPaise
        : Math.round((subtotal * Number(promo.discountPct ?? 0)) / 100);
      discountPaise = promo.maxDiscountPaise
        ? Math.min(raw, promo.maxDiscountPaise)
        : raw;
    }

    // --- Wallet -----------------------------------------------------------
    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: { walletBalancePaise: true, name: true, phone: true, email: true },
    });

    const totals: OrderTotals = computeOrderTotals({
      lines: priced.map((p) => ({
        tierId: p.tier.id,
        unitPricePaise: p.tier.pricePaise,
        quantity: p.quantity,
      })),
      discountPaise,
      walletBalancePaise: user?.walletBalancePaise ?? 0,
      useWallet: input.useWallet,
      config: cfg,
    });

    // --- The booking ------------------------------------------------------
    const expiresAt = new Date(
      now.getTime() + cfg.bookingHoldMinutes * 60_000,
    );

    const booking = await tx.booking.create({
      data: {
        bookingNumber: await nextBookingNumber(tx),
        status: "PENDING_PAYMENT",
        userId: input.userId,
        eventId: event.id,
        subtotalPaise: totals.subtotalPaise,
        discountPaise: totals.discountPaise,
        bookingFeePaise: totals.bookingFeePaise,
        gstOnFeePaise: totals.gstOnFeePaise,
        totalPaise: totals.totalPaise,
        walletAppliedPaise: totals.walletAppliedPaise,
        gatewayPayablePaise: totals.gatewayPayablePaise,
        // Snapshotted: a later commission change must not rewrite this
        // booking's economics (spec G2).
        commissionPctUsed: commissionPct,
        promoId,
        buyerName: input.buyer?.name ?? user?.name ?? null,
        buyerPhone: input.buyer?.phone ?? user?.phone ?? null,
        buyerEmail: input.buyer?.email ?? user?.email ?? null,
        expiresAt,
        items: {
          create: priced.map((p) => ({
            tierId: p.tier.id,
            sessionId: input.sessionId ?? null,
            quantity: p.quantity,
            unitPricePaise: p.tier.pricePaise,
          })),
        },
      },
      select: { id: true, bookingNumber: true },
    });

    void held; // released by expiry, or committed at capture

    return {
      ok: true as const,
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      expiresAt,
    };
    });
  } catch (err) {
    // A rejection is a normal outcome, not a crash — but it MUST arrive here
    // as a throw. Returning a failure value from a Prisma interactive
    // transaction COMMITS everything done inside it, which silently leaked
    // every hold taken before the failing tier (D-023).
    if (err instanceof BookingRejected) return err.result;
    throw err;
  }
}

/**
 * Thrown to roll a `createBooking` transaction back while carrying the
 * user-facing result out with it.
 */
class BookingRejected extends Error {
  constructor(readonly result: Extract<CreateBookingResult, { ok: false }>) {
    super(result.message);
    this.name = "BookingRejected";
  }
}

/**
 * Create, then schedule the release. Split from `createBooking` so the
 * transaction never depends on Redis being reachable — a queue outage must
 * degrade to the opportunistic sweep, not fail the booking.
 */
export async function createBookingAndSchedule(
  input: CreateBookingInput,
): Promise<CreateBookingResult> {
  const result = await createBooking(input);
  if (result.ok) {
    await scheduleHoldRelease(result.bookingId, result.expiresAt);
  }
  return result;
}

// ---------------------------------------------------------------------------

/**
 * Release every hold on this event whose booking has expired.
 *
 * Runs inside its own transaction per booking so one bad row cannot block the
 * rest, and is safe to run concurrently with the delayed job: the status guard
 * (`PENDING_PAYMENT` -> `EXPIRED`) is itself a guarded UPDATE, so exactly one
 * caller wins and only the winner releases the seats. Double release would
 * otherwise drive `quantityHeld` negative and oversell the tier.
 */
export async function releaseExpiredHolds(eventId?: string): Promise<number> {
  const now = new Date();
  const expired = await db.booking.findMany({
    where: {
      status: "PENDING_PAYMENT",
      expiresAt: { lt: now },
      ...(eventId ? { eventId } : {}),
    },
    select: { id: true },
    take: 200,
  });

  let released = 0;
  for (const { id } of expired) {
    if (await expireBooking(id)) released++;
  }
  return released;
}

/**
 * Expire one booking and give its seats back. Returns false if someone else
 * already moved it out of PENDING_PAYMENT — a capture that beat us, or another
 * sweep.
 */
export async function expireBooking(bookingId: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    // The guard. `count === 0` means the booking is no longer ours to expire,
    // and we must NOT touch inventory.
    const claimed = await tx.$executeRaw`
      UPDATE bookings
         SET status = 'EXPIRED',
             "cancelledAt" = NOW(),
             "cancelReason" = 'Hold expired before payment',
             "updatedAt" = NOW()
       WHERE id = ${bookingId}
         AND status = 'PENDING_PAYMENT'
    `;
    if (claimed === 0) return false;

    const items = await tx.bookingItem.findMany({
      where: { bookingId },
      select: { tierId: true, quantity: true },
    });
    for (const item of items) {
      await releaseSeats(tx, item.tierId, item.quantity);
    }

    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      select: { promoId: true },
    });
    if (booking?.promoId) await releasePromo(tx, booking.promoId);

    return true;
  });
}

/**
 * `EN` + 6 digits (D-017). Random rather than sequential so the number leaks
 * no volume information, with a bounded retry against the unique index.
 */
async function nextBookingNumber(tx: Tx): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = `EN${Math.floor(100_000 + Math.random() * 900_000)}`;
    const clash = await tx.booking.findUnique({
      where: { bookingNumber: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  // Space is 900k; eight collisions means something is very wrong. Fall back
  // to a value that cannot collide rather than failing the booking.
  return `EN${cuidish().slice(-6).toUpperCase()}`;
}
