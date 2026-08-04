"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { authorizeAdmin } from "@/lib/auth/rbac";
import { pick, requestIp, writeAudit } from "@/lib/audit";
import { assertTransition } from "@/lib/state-machines";
import { cuidish } from "@/lib/booking/inventory";
import { previewEventRefund, refundEventBookings } from "@/lib/refunds";
import { invalidateConfigCache } from "@/lib/config";
// A value import, not `import type`: `Prisma.DbNull` is a runtime sentinel.
// Clearing a JSON column needs it — a JS `null` is rejected by Prisma, and
// `Prisma.JsonNull` would store the JSON value `null` rather than a SQL NULL.
import { Prisma } from "@/generated/prisma";

/**
 * Platform admin mutations.
 *
 * Same four rules as the organizer actions, plus one that only applies here:
 *
 * **Permission is re-checked in the action, per action, with the specific
 * permission that action needs.** A SUPPORT admin who can reach `/admin/events`
 * must not be able to POST to `approveEvent` just because both live in this
 * file. `authorizeAdmin(...)` is therefore the first line of every one of them,
 * and the permission argument differs.
 *
 * Refusals deliberately share one message. Telling a lower-privileged admin
 * *which* permission they are missing hands them the exact target to ask for.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
  notice?: string;
  id?: string;
}

const ok = (notice?: string, id?: string): ActionResult => ({ ok: true, notice, id });
const fail = (error: string): ActionResult => ({ ok: false, error });

function toResult(err: unknown): ActionResult {
  if (err instanceof Error && err.name === "IllegalTransitionError") {
    return fail(err.message);
  }
  throw err;
}

function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

// ---------------------------------------------------------------------------
// Approvals (spec E2)
// ---------------------------------------------------------------------------

/**
 * Approve a submitted event, or a pending edit to a live one.
 *
 * The two cases share a button but are genuinely different:
 *
 *   - A **first** approval (from a never-published event) publishes it: LIVE,
 *     `publishedAt` set.
 *   - An approval of a **pendingChanges** edit applies the parked values to the
 *     live row, clears `pendingChanges`, and returns the event to LIVE — and
 *     then owes everyone who already booked a notification plus a 72-hour free
 *     cancellation window, because the thing they bought has changed
 *     (spec B1.editBlast).
 */
export async function approveEvent(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeAdmin("APPROVALS");
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const eventId = String(formData.get("eventId") ?? "");
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      status: true,
      publishedAt: true,
      pendingChanges: true,
      organizerId: true,
    },
  });
  if (!event) return fail("Not found.");
  if (event.status !== "IN_REVIEW") {
    return fail(`This event is ${event.status.toLowerCase()}, not in review.`);
  }

  const applying = event.pendingChanges !== null;
  const ip = await requestIp();

  try {
    const notified = await db.$transaction(async (tx) => {
      assertTransition("event", event.status, "LIVE");

      const patch: Prisma.EventUpdateManyMutationInput = {
        status: "LIVE",
        approvedAt: new Date(),
        approvedBy: ctx.userId,
        rejectionNote: null,
        publishedAt: event.publishedAt ?? new Date(),
        pendingChanges: Prisma.DbNull,
        ...(applying
          ? (event.pendingChanges as Prisma.InputJsonObject as object)
          : {}),
      };

      const { count } = await tx.event.updateMany({
        where: { id: eventId, status: "IN_REVIEW" },
        data: patch,
      });
      // Guarded on status, so two admins clicking Approve at once cannot both
      // publish. Throwing rolls back — returning would commit (D-023).
      if (count !== 1) {
        throw new Error("Someone else already actioned this event.");
      }

      let recipients: { userId: string }[] = [];
      if (applying) {
        // Mandatory blast. Not a nicety: an approved edit changed the thing
        // people paid for, so they are told and given 72h to walk away free
        // regardless of the event's own refund policy.
        recipients = await tx.booking.findMany({
          where: { eventId, status: "CONFIRMED" },
          select: { userId: true },
          distinct: ["userId"],
        });
        if (recipients.length) {
          await tx.notification.createMany({
            data: recipients.map((r) => ({
              id: cuidish(),
              userId: r.userId,
              kind: "EVENT_CHANGED",
              title: `${event.title} has changed`,
              body:
                "The organizer updated this event and we approved the change. " +
                "If it no longer works for you, cancel free within 72 hours — " +
                "whatever the event's usual refund policy says.",
              href: "/tickets",
            })),
          });
        }
      }

      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ADMIN",
        action: applying ? "event.pending_changes_apply" : "event.approve",
        entityType: "Event",
        entityId: eventId,
        before: pick(event, ["status", "publishedAt", "pendingChanges"]),
        after: {
          status: "LIVE",
          applied: applying ? event.pendingChanges : null,
          notified: recipients.length,
        },
        ip,
      });

      return recipients.length;
    });

    revalidatePath("/admin/approvals");
    return ok(
      applying
        ? `Change applied and published. ${notified} attendee${notified === 1 ? "" : "s"} notified with a 72-hour free-cancellation window.`
        : "Approved and published.",
    );
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Someone else")) {
      return fail(err.message);
    }
    return toResult(err);
  }
}

export async function rejectEvent(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeAdmin("APPROVALS");
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const eventId = String(formData.get("eventId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (note.length < 10) {
    return fail(
      "Say what needs fixing, in at least a sentence. The organizer sees this note and nothing else.",
    );
  }

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, status: true, title: true },
  });
  if (!event) return fail("Not found.");

  const ip = await requestIp();
  try {
    await db.$transaction(async (tx) => {
      assertTransition("event", event.status, "REJECTED");
      const { count } = await tx.event.updateMany({
        where: { id: eventId, status: "IN_REVIEW" },
        data: {
          status: "REJECTED",
          rejectionNote: note,
          // The schema has no rejectedAt/rejectedBy columns, so who rejected
          // it and when lives in the audit row — which is why that row is not
          // optional here.
          pendingChanges: Prisma.DbNull,
        },
      });
      if (count !== 1) throw new Error("Someone else already actioned this event.");

      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ADMIN",
        action: "event.reject",
        entityType: "Event",
        entityId: eventId,
        before: { status: event.status },
        after: { status: "REJECTED", rejectionNote: note },
        ip,
      });
    });
    revalidatePath("/admin/approvals");
    return ok("Rejected. The organizer can edit and resubmit.");
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Someone else")) {
      return fail(err.message);
    }
    return toResult(err);
  }
}

// ---------------------------------------------------------------------------
// Organizers — KYC and suspension (spec B5)
// ---------------------------------------------------------------------------

export async function decideKyc(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeAdmin("APPROVALS");
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const organizerId = String(formData.get("organizerId") ?? "");
  const approve = formData.get("verdict") === "approve";
  const note = strOrNull(formData.get("note"));

  if (!approve && (!note || note.length < 10)) {
    return fail("Give a reason the organizer can act on.");
  }

  const profile = await db.organizerProfile.findUnique({
    where: { id: organizerId },
    select: { id: true, name: true, status: true, verified: true, userId: true },
  });
  if (!profile) return fail("Not found.");

  const to = approve ? "VERIFIED" : "KYC_REJECTED";
  const ip = await requestIp();

  try {
    await db.$transaction(async (tx) => {
      assertTransition("organizer", profile.status, to);
      await tx.organizerProfile.update({
        where: { id: organizerId },
        data: {
          status: to,
          verified: approve,
          kycReviewedAt: new Date(),
          kycReviewedBy: ctx.userId,
          kycRejectionReason: approve ? null : note,
        },
      });

      await tx.notification.create({
        data: {
          id: cuidish(),
          userId: profile.userId,
          kind: "KYC",
          title: approve ? "You're verified" : "KYC needs another look",
          body: approve
            ? "Your organizer account is verified. You can publish events now."
            : (note ?? "Please resubmit your documents."),
          href: "/organizer/settings",
        },
      });

      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ADMIN",
        action: approve ? "organizer.kyc_approve" : "organizer.kyc_reject",
        entityType: "OrganizerProfile",
        entityId: organizerId,
        before: pick(profile, ["status", "verified"]),
        after: { status: to, verified: approve, reason: note },
        ip,
      });
    });
    revalidatePath("/admin/organizers");
    return ok(approve ? "Verified. They can publish now." : "Sent back for correction.");
  } catch (err) {
    return toResult(err);
  }
}

/**
 * Suspend an organizer — the cascade, in one transaction.
 *
 * Three things must move together or not at all:
 *   1. the profile goes SUSPENDED (login survives, read-only — spec B5);
 *   2. every LIVE event goes PAUSED, so nothing new sells;
 *   3. every non-terminal payout goes FROZEN, with `statusBeforeFreeze`
 *      recorded so reinstatement can put each one back where it was.
 *
 * Tickets already sold stay valid throughout. Suspension is an investigation,
 * not a cancellation — no money moves, which is exactly why it is reversible
 * and event cancellation is not.
 */
export async function suspendOrganizer(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeAdmin("APPROVALS");
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const organizerId = String(formData.get("organizerId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 10) return fail("Record why. This is a serious action.");

  const profile = await db.organizerProfile.findUnique({
    where: { id: organizerId },
    select: { id: true, name: true, status: true, userId: true },
  });
  if (!profile) return fail("Not found.");

  const ip = await requestIp();
  try {
    const result = await db.$transaction(async (tx) => {
      assertTransition("organizer", profile.status, "SUSPENDED");

      await tx.organizerProfile.update({
        where: { id: organizerId },
        data: {
          status: "SUSPENDED",
          suspendedAt: new Date(),
          suspendedReason: reason,
        },
      });

      const { count: paused } = await tx.event.updateMany({
        where: { organizerId, status: "LIVE" },
        data: { status: "PAUSED", pausedAt: new Date() },
      });

      // Each payout remembers its own prior state, so unfreezing is not a
      // guess. A single `data:` update cannot do that, hence the loop.
      const toFreeze = await tx.payout.findMany({
        where: {
          organizerId,
          status: { in: ["ACCRUING", "SCHEDULED", "PROCESSING", "FAILED"] },
        },
        select: { id: true, status: true },
      });
      for (const p of toFreeze) {
        assertTransition("payout", p.status, "FROZEN");
        await tx.payout.update({
          where: { id: p.id },
          data: {
            status: "FROZEN",
            statusBeforeFreeze: p.status,
            frozenReason: `Organizer suspended: ${reason}`,
          },
        });
      }

      await tx.notification.create({
        data: {
          id: cuidish(),
          userId: profile.userId,
          kind: "ACCOUNT",
          title: "Your organizer account is suspended",
          body: `${reason} You can still sign in and see everything; tickets already sold stay valid.`,
          href: "/organizer/settings",
        },
      });

      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ADMIN",
        action: "organizer.suspend",
        entityType: "OrganizerProfile",
        entityId: organizerId,
        before: { status: profile.status },
        after: {
          status: "SUSPENDED",
          reason,
          eventsPaused: paused,
          payoutsFrozen: toFreeze.length,
        },
        ip,
      });

      return { paused, frozen: toFreeze.length };
    });

    revalidatePath("/admin/organizers");
    return ok(
      `Suspended. ${result.paused} live event${result.paused === 1 ? "" : "s"} paused, ` +
        `${result.frozen} payout${result.frozen === 1 ? "" : "s"} frozen. Their login is now read-only.`,
    );
  } catch (err) {
    return toResult(err);
  }
}

/** Reverse the cascade. Events stay PAUSED — republishing is the organizer's call. */
export async function reinstateOrganizer(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeAdmin("APPROVALS");
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const organizerId = String(formData.get("organizerId") ?? "");
  const profile = await db.organizerProfile.findUnique({
    where: { id: organizerId },
    select: { id: true, status: true, userId: true, suspendedReason: true },
  });
  if (!profile) return fail("Not found.");

  const ip = await requestIp();
  try {
    const restored = await db.$transaction(async (tx) => {
      assertTransition("organizer", profile.status, "VERIFIED");
      await tx.organizerProfile.update({
        where: { id: organizerId },
        data: {
          status: "VERIFIED",
          verified: true,
          suspendedAt: null,
          suspendedReason: null,
        },
      });

      const frozen = await tx.payout.findMany({
        where: { organizerId, status: "FROZEN" },
        select: { id: true, statusBeforeFreeze: true },
      });
      for (const p of frozen) {
        // `statusBeforeFreeze` is why unfreezing is exact rather than a guess.
        // A payout mid-PROCESSING when the freeze landed returns to PROCESSING,
        // not to SCHEDULED, so it is not paid twice.
        const back = p.statusBeforeFreeze ?? "SCHEDULED";
        assertTransition("payout", "FROZEN", back);
        await tx.payout.update({
          where: { id: p.id },
          data: {
            status: back,
            statusBeforeFreeze: null,
            frozenReason: null,
          },
        });
      }

      await tx.notification.create({
        data: {
          id: cuidish(),
          userId: profile.userId,
          kind: "ACCOUNT",
          title: "Your account is active again",
          body: "The suspension is lifted. Your events are paused — publish them when you're ready.",
          href: "/organizer/events",
        },
      });

      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ADMIN",
        action: "organizer.reinstate",
        entityType: "OrganizerProfile",
        entityId: organizerId,
        before: { status: "SUSPENDED", reason: profile.suspendedReason },
        after: { status: "VERIFIED", payoutsRestored: frozen.length },
        ip,
      });

      return frozen.length;
    });

    revalidatePath("/admin/organizers");
    return ok(
      `Reinstated. ${restored} payout${restored === 1 ? "" : "s"} returned to their prior state. ` +
        `Their events stay paused until they publish them.`,
    );
  } catch (err) {
    return toResult(err);
  }
}

// ---------------------------------------------------------------------------
// Taking an event down (spec B1)
// ---------------------------------------------------------------------------

export async function setEventPaused(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeAdmin("SUPPORT");
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const eventId = String(formData.get("eventId") ?? "");
  const pause = formData.get("pause") === "true";
  const reason = strOrNull(formData.get("reason"));

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, status: true, organizerId: true },
  });
  if (!event) return fail("Not found.");

  const to = pause ? "PAUSED" : "LIVE";
  const ip = await requestIp();

  try {
    await db.$transaction(async (tx) => {
      assertTransition("event", event.status, to);
      const { count } = await tx.event.updateMany({
        where: { id: eventId, status: event.status },
        data: { status: to, pausedAt: pause ? new Date() : null },
      });
      if (count !== 1) throw new Error("Someone else already actioned this event.");

      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ADMIN",
        action: pause ? "event.pause" : "event.resume",
        entityType: "Event",
        entityId: eventId,
        before: { status: event.status },
        after: { status: to, reason },
        ip,
      });
    });
    revalidatePath("/admin/events");
    return ok(
      pause
        ? "Paused. Off the listings immediately; tickets already sold stay valid."
        : "Live again.",
    );
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Someone else")) {
      return fail(err.message);
    }
    return toResult(err);
  }
}

/**
 * Cancel an event and refund everyone.
 *
 * The most destructive action on the platform, and the reason the refund
 * engine had to exist before this button did: CANCELLED is terminal in the
 * event machine, and the promise it makes to several hundred attendees is that
 * their money comes back.
 *
 * Order matters. The status flips **first**, in its own transaction, so no new
 * booking can confirm while the refunds run. The refunds then run one
 * transaction per booking — see `refundEventBookings` for why a single
 * transaction over thousands of bookings would be the wrong shape.
 *
 * The typed confirmation is not decoration. Every other destructive control
 * here is reversible; this one is not, and it moves real money.
 */
export async function cancelEvent(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeAdmin("SUPPORT");
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const eventId = String(formData.get("eventId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const typed = String(formData.get("confirmTitle") ?? "").trim();

  if (reason.length < 10) {
    return fail("Record why. Attendees see this on their refund notice.");
  }

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, status: true, organizerId: true },
  });
  if (!event) return fail("Not found.");

  if (typed.toLowerCase() !== event.title.trim().toLowerCase()) {
    return fail(
      `Type the event's exact title to confirm: “${event.title}”. This cannot be undone.`,
    );
  }

  const ip = await requestIp();
  const preview = await previewEventRefund(eventId);

  try {
    await db.$transaction(async (tx) => {
      assertTransition("event", event.status, "CANCELLED");
      const { count } = await tx.event.updateMany({
        where: { id: eventId, status: event.status },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelReason: reason,
        },
      });
      if (count !== 1) throw new Error("Someone else already actioned this event.");

      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ADMIN",
        action: "event.cancel",
        entityType: "Event",
        entityId: eventId,
        before: { status: event.status },
        after: {
          status: "CANCELLED",
          reason,
          willRefundBookings: preview.bookingCount,
          willRefundPaise: preview.refundPaise,
        },
        ip,
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Someone else")) {
      return fail(err.message);
    }
    return toResult(err);
  }

  // Outside the status transaction, deliberately. Every refund is idempotent,
  // so a crash here leaves a cancelled event with some refunds done — and
  // re-running finishes the rest rather than paying anyone twice.
  const outcome = await refundEventBookings({
    eventId,
    reason: "EVENT_CANCELLED",
    actor: "ADMIN",
    actorId: ctx.userId,
    note: reason,
    // Platform/organizer fault, so the booking fee goes back too (spec D1).
    refundBookingFee: true,
    mode: "WALLET",
  });

  revalidatePath("/admin/events");

  if (outcome.failed.length) {
    return fail(
      `Cancelled, but ${outcome.failed.length} refund${outcome.failed.length === 1 ? "" : "s"} failed. ` +
        `${outcome.refunded} succeeded. Re-run Cancel to retry the rest — refunds are idempotent, ` +
        `nobody is paid twice.`,
    );
  }

  return ok(
    `Cancelled. ${outcome.refunded} booking${outcome.refunded === 1 ? "" : "s"} refunded ` +
      `(₹${(outcome.totalPaise / 100).toLocaleString("en-IN")}) to attendee wallets, instantly.`,
  );
}

// ---------------------------------------------------------------------------
// Finance (spec D2)
// ---------------------------------------------------------------------------

export async function approvePayout(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeAdmin("FINANCE");
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const payoutId = String(formData.get("payoutId") ?? "");
  const payout = await db.payout.findUnique({
    where: { id: payoutId },
    select: { id: true, status: true, amountPaise: true, organizerId: true },
  });
  if (!payout) return fail("Not found.");

  const ip = await requestIp();
  try {
    await db.$transaction(async (tx) => {
      assertTransition("payout", payout.status, "PROCESSING");
      await tx.payout.update({
        where: { id: payoutId },
        data: {
          status: "PROCESSING",
          approvedAt: new Date(),
          approvedBy: ctx.userId,
          processedAt: new Date(),
        },
      });
      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ADMIN",
        action: "payout.approve",
        entityType: "Payout",
        entityId: payoutId,
        before: { status: payout.status },
        // BigInt would throw on JSON.stringify — `writeAudit` converts it, but
        // converting here keeps the audit row's shape obvious at the call site.
        after: { status: "PROCESSING", amountPaise: Number(payout.amountPaise) },
        ip,
      });
    });
    revalidatePath("/admin/finance");
    return ok("Approved and sent for processing.");
  } catch (err) {
    return toResult(err);
  }
}

export async function markPayoutPaid(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeAdmin("FINANCE");
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const payoutId = String(formData.get("payoutId") ?? "");
  const utr = String(formData.get("utr") ?? "").trim();
  if (utr.length < 6) {
    return fail("Enter the bank's UTR — it is how the organizer traces the money.");
  }

  const payout = await db.payout.findUnique({
    where: { id: payoutId },
    select: { id: true, status: true, amountPaise: true, organizerId: true },
  });
  if (!payout) return fail("Not found.");

  const ip = await requestIp();
  try {
    await db.$transaction(async (tx) => {
      assertTransition("payout", payout.status, "PAID");
      await tx.payout.update({
        where: { id: payoutId },
        data: { status: "PAID", paidAt: new Date(), utr },
      });
      // Sweep the settled rows so the next run cannot pay them again. This is
      // what `payoutId IS NULL` means, and it is the whole unsettled-balance
      // mechanism.
      await tx.ledgerEntry.updateMany({
        where: {
          organizerId: payout.organizerId,
          payoutId: null,
          account: "ORGANIZER",
        },
        data: { payoutId },
      });
      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ADMIN",
        action: "payout.mark_paid",
        entityType: "Payout",
        entityId: payoutId,
        before: { status: payout.status },
        after: {
          status: "PAID",
          utr,
          amountPaise: Number(payout.amountPaise),
        },
        ip,
      });
    });
    revalidatePath("/admin/finance");
    return ok("Marked paid. The organizer's unsettled balance is now zero for this period.");
  } catch (err) {
    return toResult(err);
  }
}

// ---------------------------------------------------------------------------
// Disputes (spec G1)
// ---------------------------------------------------------------------------

export async function updateDispute(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeAdmin("SUPPORT");
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const disputeId = String(formData.get("disputeId") ?? "");
  const to = String(formData.get("status") ?? "") as
    | "INVESTIGATING"
    | "RESOLVED_REFUND"
    | "RESOLVED_REJECT"
    | "RESOLVED_PARTIAL";
  const note = strOrNull(formData.get("note"));

  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: {
      id: true,
      status: true,
      bookingId: true,
      eventId: true,
      summary: true,
    },
  });
  if (!dispute) return fail("Not found.");

  const resolving = to.startsWith("RESOLVED");
  if (resolving && (!note || note.length < 10)) {
    return fail("Record the resolution — this is the record if it is ever queried.");
  }

  const ip = await requestIp();
  try {
    await db.$transaction(async (tx) => {
      assertTransition("dispute", dispute.status, to);
      await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: to,
          resolutionNote: note,
          resolvedAt: resolving ? new Date() : null,
          resolvedBy: resolving ? ctx.userId : null,
        },
      });

      // An open dispute freezes the organizer's money. Settling out from under
      // a live complaint is how a platform ends up paying twice.
      if (to === "INVESTIGATING" && dispute.eventId) {
        const event = await tx.event.findUnique({
          where: { id: dispute.eventId },
          select: { organizerId: true },
        });
        if (event) {
          const freezable = await tx.payout.findMany({
            where: {
              organizerId: event.organizerId,
              status: { in: ["ACCRUING", "SCHEDULED"] },
            },
            select: { id: true, status: true },
          });
          for (const p of freezable) {
            assertTransition("payout", p.status, "FROZEN");
            await tx.payout.update({
              where: { id: p.id },
              data: {
                status: "FROZEN",
                statusBeforeFreeze: p.status,
                frozenReason: `Dispute under investigation: ${dispute.summary}`,
              },
            });
          }
        }
      }

      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ADMIN",
        action: resolving ? "dispute.resolve" : "dispute.update",
        entityType: "Dispute",
        entityId: disputeId,
        before: { status: dispute.status },
        after: { status: to, resolutionNote: note },
        ip,
      });
    });
    revalidatePath("/admin/disputes");
    return ok(resolving ? "Resolved." : "Marked as under investigation; payouts frozen.");
  } catch (err) {
    return toResult(err);
  }
}

// ---------------------------------------------------------------------------
// CMS (spec G2 — deactivate, never delete)
// ---------------------------------------------------------------------------

/**
 * Catalog rows deactivate; they are never deleted.
 *
 * Events carry a `cityId` / `categoryId` / `festivalId` foreign key, so a
 * delete either fails on the constraint or orphans every event that referenced
 * it. `isActive: false` hides it from the marketplace and leaves history
 * intact. Audit check A12 rule 12d fails the build on a delete of any of them.
 */
export async function toggleCatalogActive(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeAdmin("CONTENT");
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "");
  const ip = await requestIp();

  const entity = (
    { city: "City", category: "Category", festival: "Festival" } as const
  )[kind as "city" | "category" | "festival"];
  if (!entity) return fail("Unknown catalog type.");

  try {
    const notice = await db.$transaction(async (tx) => {
      // Branching per model rather than unioning the three delegates into one
      // variable: their `where` types differ, so the union's `findUnique` has
      // no callable signature. Three explicit calls, one shared shape.
      const sel = { id: true, name: true, isActive: true } as const;
      const current =
        kind === "city"
          ? await tx.city.findUnique({ where: { id }, select: sel })
          : kind === "category"
            ? await tx.category.findUnique({ where: { id }, select: sel })
            : await tx.festival.findUnique({ where: { id }, select: sel });
      if (!current) throw new Error("Not found.");

      const next = !current.isActive;
      const data = { isActive: next };
      if (kind === "city") {
        await tx.city.updateMany({ where: { id }, data });
      } else if (kind === "category") {
        await tx.category.updateMany({ where: { id }, data });
      } else {
        await tx.festival.updateMany({ where: { id }, data });
      }

      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ADMIN",
        action: next ? "cms.update" : "cms.deactivate",
        entityType: entity,
        entityId: id,
        before: { isActive: current.isActive },
        after: { isActive: next },
        ip,
      });

      return next
        ? `${current.name} is visible again.`
        : `${current.name} is hidden from the marketplace. Existing events keep working.`;
    });
    revalidatePath("/admin/cms");
    return ok(notice);
  } catch (err) {
    if (err instanceof Error && err.message === "Not found.") return fail("Not found.");
    return toResult(err);
  }
}

export async function upsertBanner(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeAdmin("CONTENT");
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const bannerId = strOrNull(formData.get("bannerId"));
  const title = String(formData.get("title") ?? "").trim();
  const subtitle = strOrNull(formData.get("subtitle"));
  const href = strOrNull(formData.get("href"));
  const status = String(formData.get("status") ?? "DRAFT") as
    | "DRAFT"
    | "SCHEDULED"
    | "LIVE";
  const cityId = strOrNull(formData.get("cityId"));

  if (title.length < 3) return fail("Give the banner a title.");

  const ip = await requestIp();
  try {
    await db.$transaction(async (tx) => {
      if (bannerId) {
        const before = await tx.banner.findUnique({
          where: { id: bannerId },
          select: { id: true, title: true, status: true },
        });
        if (!before) throw new Error("Not found.");
        await tx.banner.update({
          where: { id: bannerId },
          data: { title, subtitle, href, status, cityId },
        });
        await writeAudit(tx, {
          actorId: ctx.userId,
          actorType: "ADMIN",
          action: "cms.update",
          entityType: "Banner",
          entityId: bannerId,
          before,
          after: { title, subtitle, href, status, cityId },
          ip,
        });
      } else {
        const created = await tx.banner.create({
          data: { id: cuidish(), title, subtitle, href, status, cityId },
          select: { id: true },
        });
        await writeAudit(tx, {
          actorId: ctx.userId,
          actorType: "ADMIN",
          action: "cms.create",
          entityType: "Banner",
          entityId: created.id,
          before: null,
          after: { title, subtitle, href, status, cityId },
          ip,
        });
      }
    });
    revalidatePath("/admin/cms");
    return ok("Banner saved.");
  } catch (err) {
    if (err instanceof Error && err.message === "Not found.") return fail("Not found.");
    return toResult(err);
  }
}

// ---------------------------------------------------------------------------
// Config (spec A3) — SUPER only
// ---------------------------------------------------------------------------

export async function updateConfig(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeAdmin("SUPER");
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const key = String(formData.get("key") ?? "").trim();
  const raw = String(formData.get("value") ?? "").trim();
  if (!key) return fail("Missing key.");

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    // A bare number or string is the common case and is not valid JSON on its
    // own, so fall back rather than making an admin type quotes.
    value = Number.isFinite(Number(raw)) && raw !== "" ? Number(raw) : raw;
  }

  const ip = await requestIp();
  try {
    await db.$transaction(async (tx) => {
      const before = await tx.configSetting.findUnique({ where: { key } });
      await tx.configSetting.upsert({
        where: { key },
        update: { value: value as Prisma.InputJsonValue, updatedBy: ctx.userId },
        create: {
          key,
          value: value as Prisma.InputJsonValue,
          updatedBy: ctx.userId,
        },
      });
      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ADMIN",
        action: "config.update",
        entityType: "ConfigSetting",
        entityId: key,
        before: before ? { value: before.value } : null,
        after: { value },
        ip,
      });
    });

    // The accessor caches, so without this the change stays invisible and an
    // admin concludes the form is broken. Deliberately NOT `setConfigValue` —
    // that writes the row as well, and the row is already written above,
    // inside the transaction that also produced the audit entry.
    invalidateConfigCache();
    revalidatePath("/admin/config");
    return ok(`${key} updated.`);
  } catch (err) {
    return toResult(err);
  }
}
