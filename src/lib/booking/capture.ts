import "server-only";

import { db } from "@/lib/db";
import { getBusinessConfig } from "@/lib/config";
import { buildCaptureLedger, type OrderTotals } from "@/lib/money";
import { writeLedger } from "@/lib/ledger";
import {
  claimWebhookEvent,
  commitSeats,
  consumePromo,
  cuidish,
  formatTicketNumber,
  releasePromo,
  releaseSeats,
  reserveTicketNumbers,
  sellSeatsDirect,
} from "./inventory";
import { cancelHoldRelease } from "@/lib/jobs/hold-release";
import { deliverTickets } from "./deliver";

/**
 * Payment capture — the moment a hold becomes tickets and money.
 *
 * Everything here is idempotent, because gateways are not. They retry on any
 * non-2xx, they deliver out of order, and they occasionally deliver twice for
 * a single payment. Replay-safety is the normal operating condition, not an
 * edge case (spec C4.6, edge case I3):
 *
 *   - the gateway event is claimed by a unique INSERT before any work starts;
 *   - the booking transition is a guarded UPDATE, so a second delivery that
 *     slips past the claim still finds nothing to do;
 *   - tickets are only minted inside the transaction that won the guard.
 */

export type CaptureResult =
  | { ok: true; bookingId: string; ticketCount: number; replayed: false }
  | { ok: true; bookingId: string; ticketCount: 0; replayed: true }
  | { ok: false; code: "UNKNOWN_BOOKING" | "NOT_PAYABLE" | "SOLD_OUT_LATE"; message: string };

export interface CaptureInput {
  gatewayEventId: string;
  eventType: string;
  payload: unknown;
  bookingId: string;
  gatewayOrderId: string;
  gatewayPaymentId: string;
  amountPaise: number;
  method?: string | null;
  vpa?: string | null;
}

export async function captureBooking(input: CaptureInput): Promise<CaptureResult> {
  const cfg = await getBusinessConfig();

  const result = await db.$transaction(
    async (tx) => {
      // --- 1. Claim the delivery ------------------------------------------
      // First writer wins; every replay lands here and stops.
      const claimed = await claimWebhookEvent(tx, {
        gatewayEventId: input.gatewayEventId,
        eventType: input.eventType,
        payload: input.payload,
      });
      if (!claimed) {
        return {
          ok: true as const,
          bookingId: input.bookingId,
          ticketCount: 0 as const,
          replayed: true as const,
        };
      }

      const booking = await tx.booking.findUnique({
        where: { id: input.bookingId },
        include: {
          items: { include: { tier: true } },
          event: { select: { id: true, shortCode: true, organizerId: true } },
        },
      });
      if (!booking) {
        return {
          ok: false as const,
          code: "UNKNOWN_BOOKING" as const,
          message: "No such booking.",
        };
      }

      // --- 2. Claim the booking -------------------------------------------
      // PENDING_PAYMENT or EXPIRED: an expired hold whose money arrived late
      // is recoverable (spec C4.7), a cancelled or already-confirmed one is
      // not.
      const transitioned = await tx.$executeRaw`
        UPDATE bookings
           SET status = 'CONFIRMED',
               "confirmedAt" = NOW(),
               "expiresAt" = NULL,
               "updatedAt" = NOW()
         WHERE id = ${input.bookingId}
           AND status IN ('PENDING_PAYMENT', 'EXPIRED')
      `;
      if (transitioned === 0) {
        // Already CONFIRMED by a delivery we raced, or CANCELLED. Either way
        // there is nothing to do and nothing to undo.
        return {
          ok: true as const,
          bookingId: input.bookingId,
          ticketCount: 0 as const,
          replayed: true as const,
        };
      }

      const wasExpired = booking.status === "EXPIRED";

      // --- 3. Inventory ----------------------------------------------------
      // The normal path converts our own hold. The late path has no hold left
      // to convert — its seats went back on sale — so it must compete for
      // stock like any other buyer.
      for (const item of booking.items) {
        const ok = wasExpired
          ? await sellSeatsDirect(tx, item.tierId, item.quantity)
          : await commitSeats(tx, item.tierId, item.quantity);

        if (!ok) {
          // Someone else bought the seat while this payment was in flight.
          // Roll the whole transaction back and refund upstream — admitting a
          // paying customer to a full ground is the worse failure
          // (edge case I5).
          throw new LateCaptureSoldOut(item.tierId);
        }
      }

      // --- 4. Payment row ---------------------------------------------------
      // The order route already inserted this row as CREATED, so this is a
      // TRANSITION, not a new payment. Inserting instead would violate the
      // unique `gatewayOrderId` and 500 the webhook, which the gateway would
      // then retry forever.
      const captured = {
        status: "CAPTURED" as const,
        method: (input.method as "UPI") ?? "UPI",
        amountPaise: input.amountPaise,
        gatewayPaymentId: input.gatewayPaymentId,
        vpa: input.vpa ?? null,
        capturedAt: new Date(),
      };
      if (input.gatewayOrderId) {
        await tx.payment.upsert({
          where: { gatewayOrderId: input.gatewayOrderId },
          update: captured,
          create: {
            id: cuidish(),
            bookingId: booking.id,
            gatewayOrderId: input.gatewayOrderId,
            ...captured,
          },
        });
      } else {
        // Wallet-only: no gateway order ever existed, so there is nothing to
        // transition and the unique column stays null.
        await tx.payment.create({
          data: { id: cuidish(), bookingId: booking.id, ...captured },
        });
      }

      // --- 5. Wallet --------------------------------------------------------
      if (booking.walletAppliedPaise > 0) {
        const user = await tx.user.update({
          where: { id: booking.userId },
          data: {
            walletBalancePaise: { decrement: booking.walletAppliedPaise },
          },
          select: { walletBalancePaise: true },
        });
        await tx.walletTxn.create({
          data: {
            id: cuidish(),
            userId: booking.userId,
            type: "BOOKING_REDEEM",
            amountPaise: -booking.walletAppliedPaise,
            balanceAfterPaise: user.walletBalancePaise,
            bookingId: booking.id,
            description: `Applied to booking ${booking.bookingNumber}`,
          },
        });
      }

      // --- 6. Promo ---------------------------------------------------------
      if (booking.promoId) {
        await consumePromo(tx, booking.promoId);
        await tx.promoRedemption.create({
          data: {
            id: cuidish(),
            promoId: booking.promoId,
            userId: booking.userId,
            bookingId: booking.id,
            amountPaise: booking.discountPaise,
          },
        });
      }

      // --- 7. Tickets -------------------------------------------------------
      const totalQty = booking.items.reduce((s, i) => s + i.quantity, 0);
      // One atomic reservation for the whole booking, so two concurrent
      // captures on the same event can never mint the same number (D-021).
      const lastSeq = await reserveTicketNumbers(tx, booking.event.id, totalQty);
      let seq = lastSeq - totalQty;

      const attendee = await tx.attendee.create({
        data: {
          id: cuidish(),
          bookingId: booking.id,
          name: booking.buyerName ?? "Guest",
          phone: booking.buyerPhone,
        },
      });

      const tickets: {
        id: string;
        ticketNumber: string;
        bookingId: string;
        userId: string;
        eventId: string;
        tierId: string;
        sessionId: string | null;
        attendeeId: string;
        attendeeName: string;
      }[] = [];

      for (const item of booking.items) {
        for (let i = 0; i < item.quantity; i++) {
          seq += 1;
          tickets.push({
            id: cuidish(),
            ticketNumber: formatTicketNumber(booking.event.shortCode, seq),
            bookingId: booking.id,
            userId: booking.userId,
            eventId: booking.event.id,
            tierId: item.tierId,
            // A season pass is session-agnostic; scanning writes a
            // SessionScan child row instead (spec C7).
            sessionId: item.tier.isSeasonPass ? null : item.sessionId,
            attendeeId: attendee.id,
            attendeeName: booking.buyerName ?? "Guest",
          });
        }
      }
      await tx.ticket.createMany({ data: tickets });

      // --- 8. Ledger (invariant I3) -----------------------------------------
      const totals: OrderTotals = {
        subtotalPaise: booking.subtotalPaise,
        discountPaise: booking.discountPaise,
        bookingFeePaise: booking.bookingFeePaise,
        gstOnFeePaise: booking.gstOnFeePaise,
        totalPaise: booking.totalPaise,
        walletAppliedPaise: booking.walletAppliedPaise,
        gatewayPayablePaise: booking.gatewayPayablePaise,
      };
      // `writeLedger` asserts the rows sum to zero BEFORE inserting, inside
      // this transaction — an unbalanced booking rolls back rather than being
      // discovered at settlement.
      await writeLedger(tx, {
        bookingId: booking.id,
        organizerId: booking.event.organizerId,
        rows: buildCaptureLedger({
          totals,
          commissionPct: Number(booking.commissionPctUsed),
          config: cfg,
        }),
      });

      await tx.webhookEvent.update({
        where: { gatewayEventId: input.gatewayEventId },
        data: { processedAt: new Date() },
      });

      return {
        ok: true as const,
        bookingId: booking.id,
        ticketCount: tickets.length,
        replayed: false as const,
      };
    },
    // Ticket generation plus the ledger is more work than the 5s default
    // allows on a cold connection.
    { timeout: 15_000 },
  ).catch((err) => {
    if (err instanceof LateCaptureSoldOut) {
      return {
        ok: false as const,
        code: "SOLD_OUT_LATE" as const,
        message:
          "The seats were taken while this payment was in flight. The payment will be refunded in full.",
      };
    }
    throw err;
  });

  // Best-effort, outside the transaction: a queue failure must not undo a
  // captured payment. Neither must a failed SMS — `deliverTickets` swallows
  // and logs its own errors for exactly that reason, and the tickets are in
  // the database regardless of whether any message went out.
  //
  // Guarded on `!replayed` so a gateway retrying a webhook it already sent
  // does not text the buyer a second time.
  if (result.ok && !result.replayed) {
    await cancelHoldRelease(input.bookingId);
    await deliverTickets(input.bookingId);
  }

  return result;
}

/** Thrown to roll the capture transaction back; caught immediately above. */
class LateCaptureSoldOut extends Error {
  constructor(readonly tierId: string) {
    super(`Tier ${tierId} sold out before a late capture could take it`);
    this.name = "LateCaptureSoldOut";
  }
}

// ---------------------------------------------------------------------------

/**
 * A payment that failed at the gateway.
 *
 * Releases the hold immediately rather than waiting for the timer: the user is
 * looking at a failure screen and may well retry, and holding their seats
 * hostage for the rest of the window helps nobody.
 */
export async function failBooking(input: {
  gatewayEventId: string;
  eventType: string;
  payload: unknown;
  bookingId: string;
  reason?: string | null;
}): Promise<{ ok: true; replayed: boolean }> {
  return db.$transaction(async (tx) => {
    const claimed = await claimWebhookEvent(tx, {
      gatewayEventId: input.gatewayEventId,
      eventType: input.eventType,
      payload: input.payload,
    });
    if (!claimed) return { ok: true as const, replayed: true };

    const transitioned = await tx.$executeRaw`
      UPDATE bookings
         SET status = 'FAILED',
             "cancelledAt" = NOW(),
             "cancelReason" = ${input.reason ?? "Payment failed"},
             "updatedAt" = NOW()
       WHERE id = ${input.bookingId}
         AND status = 'PENDING_PAYMENT'
    `;
    if (transitioned === 0) return { ok: true as const, replayed: true };

    const booking = await tx.booking.findUnique({
      where: { id: input.bookingId },
      select: {
        promoId: true,
        items: { select: { tierId: true, quantity: true } },
      },
    });
    for (const item of booking?.items ?? []) {
      await releaseSeats(tx, item.tierId, item.quantity);
    }
    if (booking?.promoId) await releasePromo(tx, booking.promoId);

    // Same reasoning as capture: transition the CREATED row rather than
    // inserting a second one against the same gateway order.
    await tx.payment.updateMany({
      where: { bookingId: input.bookingId, status: "CREATED" },
      data: {
        status: "FAILED",
        failureReason: input.reason ?? "Payment failed",
        failedAt: new Date(),
      },
    });

    await tx.webhookEvent.update({
      where: { gatewayEventId: input.gatewayEventId },
      data: { processedAt: new Date() },
    });

    return { ok: true as const, replayed: false };
  });
}
