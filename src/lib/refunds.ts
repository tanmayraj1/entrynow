import "server-only";

import { db } from "@/lib/db";
import { getBusinessConfig } from "@/lib/config";
import {
  buildCaptureLedger,
  buildRefundLedger,
  type LedgerRow,
  type OrderTotals,
} from "@/lib/money";
import { writeLedger } from "@/lib/ledger";
import { cuidish, restoreSoldSeats } from "@/lib/booking/inventory";
import { isInventoryRestorable } from "@/lib/ist";
import { writeAudit, type AuditActorType } from "@/lib/audit";
import type { BookingStatus, RefundMode } from "@/generated/prisma";

/**
 * Refunds — the money coming back out.
 *
 * This exists because cancelling an event is not a status change: it is a
 * promise to several hundred people that their money returns. Shipping the
 * admin Cancel button without this would have made the platform's most
 * destructive action also its least honest one, and Part J's tiebreaker
 * (attendee money → organizer trust → platform revenue) settles that
 * decisively. See D-031.
 *
 * **Scope, stated plainly.** This is the *wallet* refund path. `WALLET` mode
 * completes inside the transaction: the balance moves, the `Refund` row is
 * COMPLETED, and the attendee can spend it immediately. `SOURCE` mode — money
 * back to the card or UPI handle it came from — needs a gateway refund adapter
 * that does not exist yet, so it records a PENDING `Refund` and returns
 * `pendingGateway: true` rather than silently pretending to have paid anyone.
 * Callers that must make an attendee whole *now* ask for WALLET.
 *
 * Three properties hold regardless of mode:
 *
 *   - **Idempotent.** The booking transition is a guarded UPDATE. A retried
 *     bulk cancel, a double-clicked button and a resumed job all find
 *     `rowCount === 0` and stop, so nobody is paid twice.
 *   - **Invariant I3 survives.** The refund rows sum to zero on their own, so
 *     the booking's lifetime total stays zero. `writeLedger` asserts it before
 *     inserting, inside this transaction.
 *   - **Inventory is restored only when it can still be sold** (spec C6.2) —
 *     more than `inventoryRestoreThresholdHours` before the session. Below
 *     that the seats stay burned, which is what stops cancel-and-resell gaming
 *     an hour before doors.
 */

export type RefundReason =
  | "EVENT_CANCELLED"
  | "ORGANIZER_CANCELLED"
  | "USER_CANCELLED"
  | "DISPUTE_RESOLUTION"
  | "LATE_CAPTURE_SOLD_OUT";

/** Who cancelled — decides the terminal booking status and fee treatment. */
export type RefundActor = "ADMIN" | "ORGANIZER" | "USER" | "SYSTEM";

const TERMINAL_STATUS: Record<RefundActor, BookingStatus> = {
  ADMIN: "CANCELLED_BY_ADMIN",
  ORGANIZER: "CANCELLED_BY_ORGANIZER",
  USER: "CANCELLED_BY_USER",
  // A system-initiated refund is the platform's own doing — a late capture
  // that found the tier sold out. That is our fault, not the attendee's.
  SYSTEM: "CANCELLED_BY_ADMIN",
};

const AUDIT_ACTOR: Record<RefundActor, AuditActorType> = {
  ADMIN: "ADMIN",
  ORGANIZER: "ORGANIZER",
  USER: "USER",
  SYSTEM: "SYSTEM",
};

export interface RefundBookingInput {
  bookingId: string;
  /** 1 = full. Partial refunds reverse only the sale legs (spec D1). */
  fraction?: number;
  /**
   * The booking fee is the platform's revenue for work already done, so it is
   * returned only when the *fault* is ours or the organizer's — never when an
   * attendee simply changes their mind (spec D1).
   */
  refundBookingFee: boolean;
  mode?: RefundMode;
  reason: RefundReason;
  actor: RefundActor;
  /** Null for SYSTEM. Recorded on the audit row. */
  actorId: string | null;
  note?: string;
}

export type RefundBookingResult =
  | {
      ok: true;
      replayed: false;
      refundId: string;
      amountPaise: number;
      mode: RefundMode;
      /** True when the money is recorded but not yet moved — SOURCE mode. */
      pendingGateway: boolean;
      ticketsCancelled: number;
      inventoryRestored: boolean;
    }
  /** Already cancelled or refunded. Not an error — this is the safe branch. */
  | { ok: true; replayed: true }
  | { ok: false; code: "UNKNOWN_BOOKING" | "NOT_REFUNDABLE"; message: string };

export async function refundBooking(
  input: RefundBookingInput,
): Promise<RefundBookingResult> {
  const cfg = await getBusinessConfig();
  const fraction = Math.min(Math.max(input.fraction ?? 1, 0), 1);
  const mode: RefundMode = input.mode ?? "WALLET";
  const now = new Date();

  return db.$transaction(
    async (tx) => {
      // --- 1. Claim the booking -------------------------------------------
      // Only a CONFIRMED booking has money to return. The guard is what makes
      // a repeated bulk cancel safe: the second pass matches nothing.
      const target = TERMINAL_STATUS[input.actor];
      const claimed = await tx.$executeRaw`
        UPDATE bookings
           SET status         = ${target}::"BookingStatus",
               "cancelledAt"  = NOW(),
               "cancelReason" = ${input.note ?? humanReason(input.reason)},
               "updatedAt"    = NOW()
         WHERE id = ${input.bookingId}
           AND status = 'CONFIRMED'
      `;
      if (claimed === 0) {
        return { ok: true as const, replayed: true as const };
      }

      const booking = await tx.booking.findUnique({
        where: { id: input.bookingId },
        include: {
          items: {
            include: {
              session: { select: { startsAt: true } },
            },
          },
          event: { select: { id: true, organizerId: true, title: true } },
        },
      });
      if (!booking) {
        // Unreachable in practice — the UPDATE above matched a row. Throwing
        // rather than returning is deliberate: a `return` here would COMMIT
        // the cancellation with no refund attached (D-023).
        throw new Error(`refundBooking: booking ${input.bookingId} vanished`);
      }

      // --- 2. Rebuild the capture ledger ------------------------------------
      // Recomputed from the booking's own snapshotted money columns rather
      // than read back from `ledger_entries`. Both would work today, but the
      // stored rows accumulate reversals from any earlier partial refund, so
      // reading them would double-count the moment partial refunds ship.
      // `commissionPctUsed` is snapshotted on the booking precisely so this
      // recomputation cannot drift when the platform rate changes (spec G2).
      const totals: OrderTotals = {
        subtotalPaise: booking.subtotalPaise,
        discountPaise: booking.discountPaise,
        bookingFeePaise: booking.bookingFeePaise,
        gstOnFeePaise: booking.gstOnFeePaise,
        totalPaise: booking.totalPaise,
        walletAppliedPaise: booking.walletAppliedPaise,
        gatewayPayablePaise: booking.gatewayPayablePaise,
      };
      const captureRows = buildCaptureLedger({
        totals,
        commissionPct: Number(booking.commissionPctUsed),
        config: cfg,
      });
      const refundRows = buildRefundLedger({
        captureRows,
        fraction,
        refundBookingFee: input.refundBookingFee,
      });

      // The outbound EXTERNAL leg IS the amount the attendee gets back —
      // derived from the reversal rather than recomputed, so it stays exact
      // under any rounding of the fraction.
      const amountPaise = outboundOf(refundRows);

      // --- 3. Ledger (invariant I3) -----------------------------------------
      await writeLedger(tx, {
        bookingId: booking.id,
        organizerId: booking.event.organizerId,
        rows: refundRows,
      });

      // --- 4. The Refund row -------------------------------------------------
      const refundId = cuidish();
      const walletNow = mode === "WALLET";
      await tx.refund.create({
        data: {
          id: refundId,
          bookingId: booking.id,
          status: walletNow ? "COMPLETED" : "PENDING",
          mode,
          amountPaise,
          fraction,
          bookingFeeRefunded: input.refundBookingFee,
          reason: input.note ?? humanReason(input.reason),
          completedAt: walletNow ? now : null,
        },
      });

      // --- 5. Move the money -------------------------------------------------
      if (walletNow && amountPaise > 0) {
        const user = await tx.user.update({
          where: { id: booking.userId },
          data: { walletBalancePaise: { increment: amountPaise } },
          select: { walletBalancePaise: true },
        });
        await tx.walletTxn.create({
          data: {
            id: cuidish(),
            userId: booking.userId,
            type: "REFUND_CREDIT",
            amountPaise,
            balanceAfterPaise: user.walletBalancePaise,
            bookingId: booking.id,
            description: `Refund for ${booking.bookingNumber} — ${booking.event.title}`,
          },
        });
      }

      // Reflect it on the payment so reconciliation and the receipt agree.
      await tx.payment.updateMany({
        where: { bookingId: booking.id, status: "CAPTURED" },
        data: {
          status: fraction >= 1 ? "REFUNDED" : "PARTIALLY_REFUNDED",
        },
      });

      // --- 6. Tickets and inventory -------------------------------------------
      // SCANNED tickets are deliberately left alone. Someone who already walked
      // through the gate attended; rewriting that would corrupt the gate record
      // and the attendance count the organizer is paid against.
      const { count: ticketsCancelled } = await tx.ticket.updateMany({
        where: { bookingId: booking.id, status: "ACTIVE" },
        data: { status: "CANCELLED", cancelledAt: now },
      });

      let inventoryRestored = false;
      if (fraction >= 1) {
        for (const item of booking.items) {
          const startsAt = item.session?.startsAt;
          // No session on the item means a season pass — there is no single
          // start to measure against, so the seats go back.
          const restorable =
            !startsAt ||
            isInventoryRestorable(
              startsAt,
              now,
              cfg.inventoryRestoreThresholdHours,
            );
          if (!restorable) continue;
          await restoreSoldSeats(tx, item.tierId, item.quantity);
          inventoryRestored = true;
        }
      }

      // --- 7. Tell the attendee ------------------------------------------------
      await tx.notification.create({
        data: {
          id: cuidish(),
          userId: booking.userId,
          kind: "REFUND",
          title: walletNow
            ? `₹${(amountPaise / 100).toFixed(2)} refunded to your wallet`
            : "Refund initiated",
          body: walletNow
            ? `${booking.event.title} — booking ${booking.bookingNumber}. The credit is available now.`
            : `${booking.event.title} — booking ${booking.bookingNumber}. It reaches your original payment method in 5–7 working days.`,
          href: "/account/wallet",
        },
      });

      // --- 8. Audit (invariant I6) ---------------------------------------------
      await writeAudit(tx, {
        actorId: input.actorId,
        actorType: AUDIT_ACTOR[input.actor],
        action: "refund.issue",
        entityType: "Refund",
        entityId: refundId,
        before: { bookingStatus: "CONFIRMED", bookingId: booking.id },
        after: {
          bookingStatus: target,
          amountPaise,
          fraction,
          mode,
          bookingFeeRefunded: input.refundBookingFee,
          reason: input.reason,
        },
      });

      return {
        ok: true as const,
        replayed: false as const,
        refundId,
        amountPaise,
        mode,
        pendingGateway: !walletNow,
        ticketsCancelled,
        inventoryRestored,
      };
    },
    { timeout: 15_000 },
  );
}

/**
 * Refund every confirmed booking on an event.
 *
 * **One transaction per booking, not one for the whole event.** A sold-out
 * Garba night is thousands of bookings; a single transaction over all of them
 * would hold locks across the entire event for minutes, block every concurrent
 * scan and booking, and lose all the completed work if the last one failed.
 * Per-booking transactions mean a crash halfway through leaves the first half
 * genuinely refunded — and because each one is idempotent, re-running finishes
 * the job rather than paying anyone twice.
 *
 * Returns a summary the caller reports; individual failures are collected
 * rather than thrown, so one bad booking cannot strand the rest.
 */
export async function refundEventBookings(args: {
  eventId: string;
  reason: RefundReason;
  actor: RefundActor;
  actorId: string | null;
  note?: string;
  /** Cancelling an event is the organizer's or platform's fault, so the fee
   *  goes back too (spec D1). */
  refundBookingFee?: boolean;
  mode?: RefundMode;
}): Promise<{
  refunded: number;
  alreadyDone: number;
  failed: { bookingId: string; message: string }[];
  totalPaise: number;
}> {
  const bookings = await db.booking.findMany({
    where: { eventId: args.eventId, status: "CONFIRMED" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  let refunded = 0;
  let alreadyDone = 0;
  let totalPaise = 0;
  const failed: { bookingId: string; message: string }[] = [];

  for (const { id } of bookings) {
    try {
      const r = await refundBooking({
        bookingId: id,
        fraction: 1,
        refundBookingFee: args.refundBookingFee ?? true,
        mode: args.mode ?? "WALLET",
        reason: args.reason,
        actor: args.actor,
        actorId: args.actorId,
        note: args.note,
      });
      if (!r.ok) {
        failed.push({ bookingId: id, message: r.message });
      } else if (r.replayed) {
        alreadyDone += 1;
      } else {
        refunded += 1;
        totalPaise += r.amountPaise;
      }
    } catch (err) {
      failed.push({
        bookingId: id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { refunded, alreadyDone, failed, totalPaise };
}

/**
 * What a full cancellation would cost, without performing it.
 *
 * The admin Cancel dialog must state the real number before the click, because
 * the click is irreversible — `CANCELLED` is a terminal state in the event
 * machine with no outgoing edges.
 */
export async function previewEventRefund(eventId: string): Promise<{
  bookingCount: number;
  ticketCount: number;
  attendeeCount: number;
  refundPaise: number;
}> {
  const cfg = await getBusinessConfig();
  const bookings = await db.booking.findMany({
    where: { eventId, status: "CONFIRMED" },
    select: {
      userId: true,
      subtotalPaise: true,
      discountPaise: true,
      bookingFeePaise: true,
      gstOnFeePaise: true,
      totalPaise: true,
      walletAppliedPaise: true,
      gatewayPayablePaise: true,
      commissionPctUsed: true,
    },
  });

  const refundPaise = bookings.reduce((sum, b) => {
    const rows = buildRefundLedger({
      captureRows: buildCaptureLedger({
        totals: {
          subtotalPaise: b.subtotalPaise,
          discountPaise: b.discountPaise,
          bookingFeePaise: b.bookingFeePaise,
          gstOnFeePaise: b.gstOnFeePaise,
          totalPaise: b.totalPaise,
          walletAppliedPaise: b.walletAppliedPaise,
          gatewayPayablePaise: b.gatewayPayablePaise,
        },
        commissionPct: Number(b.commissionPctUsed),
        config: cfg,
      }),
      fraction: 1,
      refundBookingFee: true,
    });
    return sum + outboundOf(rows);
  }, 0);

  const ticketCount = await db.ticket.count({
    where: { eventId, status: "ACTIVE" },
  });

  return {
    bookingCount: bookings.length,
    ticketCount,
    attendeeCount: new Set(bookings.map((b) => b.userId)).size,
    refundPaise,
  };
}

/** The EXTERNAL leg of a refund — money leaving the platform, so positive. */
function outboundOf(rows: LedgerRow[]): number {
  return rows
    .filter((r) => r.account === "EXTERNAL")
    .reduce((s, r) => s + r.amountPaise, 0);
}

function humanReason(reason: RefundReason): string {
  switch (reason) {
    case "EVENT_CANCELLED":
      return "Event cancelled by Entry Now";
    case "ORGANIZER_CANCELLED":
      return "Event cancelled by the organizer";
    case "USER_CANCELLED":
      return "Cancelled by you";
    case "DISPUTE_RESOLUTION":
      return "Resolved in your favour by support";
    case "LATE_CAPTURE_SOLD_OUT":
      return "Sold out before your payment completed";
  }
}
