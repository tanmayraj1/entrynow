"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { authorizeOrganizer } from "@/lib/auth/rbac";
import { pick, requestIp, writeAudit } from "@/lib/audit";
import { assertTransition, canHardDeleteEvent } from "@/lib/state-machines";
import { setTierCapacity } from "@/lib/booking/inventory";
import { cuidish } from "@/lib/booking/inventory";
import { getBusinessConfig } from "@/lib/config";
import {
  NotOwnedError,
  updateOwnedEvent,
  updateOwnedTier,
} from "@/lib/queries/organizer/scope";
import { toPaise } from "@/lib/money";
import { getGeocodeAdapter } from "@/lib/adapters/geocode";
import {
  isNearCity,
  parseLatLng,
  MAX_VENUE_DISTANCE_KM,
  type LatLng,
} from "@/lib/venue-location";
import type { Prisma } from "@/generated/prisma";

/**
 * Organizer portal mutations.
 *
 * Four rules hold in every action here, and each is enforced by something
 * other than discipline:
 *
 * 1. **Identity is re-derived from the session inside the action**, never
 *    taken from the form. A page-level guard protects the render; it does
 *    nothing about a crafted POST straight to the action endpoint.
 * 2. **`authorizeOrganizer`, not `requireOrganizer`.** The page guards throw
 *    (`notFound()` is thrown control-flow in Next), and these actions catch
 *    their own errors to return a typed result — so a page guard here would be
 *    swallowed and the action would continue past a failed check (D-028).
 * 3. **Every mutation writes an audit row inside its own transaction.** Audit
 *    check A13 fails the build otherwise (invariant I6).
 * 4. **Every status change goes through `assertTransition`**, which throws —
 *    because returning a value from a Prisma interactive transaction commits
 *    it (D-023, D-030).
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
  notice?: string;
  /** Set on create, so the form can redirect to the new row. */
  id?: string;
}

const ok = (notice?: string, id?: string): ActionResult => ({
  ok: true,
  notice,
  id,
});
const fail = (error: string): ActionResult => ({ ok: false, error });

/**
 * Turn the exceptions this layer throws deliberately into the typed result the
 * form renders. Anything unrecognised is re-thrown — an unexpected error must
 * reach the error boundary rather than being flattened into "Something went
 * wrong" alongside the ones we meant.
 */
function toResult(err: unknown): ActionResult {
  if (err instanceof NotOwnedError) return fail("Not found.");
  if (err instanceof Error && err.name === "IllegalTransitionError") {
    return fail(err.message);
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export async function createEventDraft(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeOrganizer({ writable: true });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const title = String(formData.get("title") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const cityId = String(formData.get("cityId") ?? "");
  const venueId = String(formData.get("venueId") ?? "");
  const summary = String(formData.get("summary") ?? "").trim();

  if (title.length < 4) return fail("Give the event a title of at least 4 characters.");
  if (!categoryId || !cityId || !venueId) {
    return fail("Pick a category, a city and a venue.");
  }

  // Basic plan caps LIVE events, not drafts — an organizer at their cap can
  // still prepare the next one and publish it after something completes
  // (D-010). The cap is enforced at submit, not here.
  const slug = await uniqueSlug(title);
  const ip = await requestIp();

  try {
    const id = await db.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          id: cuidish(),
          slug,
          title,
          shortCode: shortCodeFor(title),
          status: "DRAFT",
          organizerId: ctx.organizerId,
          categoryId,
          cityId,
          venueId,
          summary: summary || null,
        },
        select: { id: true, slug: true, title: true, status: true },
      });

      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ORGANIZER",
        action: "event.create",
        entityType: "Event",
        entityId: created.id,
        before: null,
        after: created,
        ip,
      });

      return created.id;
    });

    revalidatePath("/organizer/events");
    return ok("Draft created.", id);
  } catch (err) {
    return toResult(err);
  }
}

/**
 * Edit an event.
 *
 * The subtle rule is spec B1's, and it exists so a LIVE listing can never
 * change under someone mid-checkout:
 *
 *   - **Free edits apply instantly** — description, gallery, FAQ, adding a
 *     tier, *raising* quantity, extending a sale window, *lowering* a price.
 *     None of these can disadvantage anyone who already booked.
 *   - **Date, venue, or a price *increase*** on a LIVE event write
 *     `pendingChanges` and move it to IN_REVIEW, **and the event keeps selling
 *     at its old values** until an admin approves. Anything else would let an
 *     organizer raise the price on a listing people are actively buying.
 *
 * A DRAFT has no audience, so everything is a free edit there.
 */
export async function updateEventDetails(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeOrganizer({ writable: true });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) return fail("Missing event.");

  const current = await db.event.findFirst({
    where: { id: eventId, organizerId: ctx.organizerId },
    select: {
      id: true,
      status: true,
      title: true,
      summary: true,
      description: true,
      venueId: true,
      refundPolicy: true,
      transfersAllowed: true,
      partialCancellationAllowed: true,
      pendingChanges: true,
    },
  });
  if (!current) return fail("Not found.");

  const next = {
    title: String(formData.get("title") ?? current.title).trim(),
    summary: strOrNull(formData.get("summary")),
    description: strOrNull(formData.get("description")),
    venueId: String(formData.get("venueId") ?? current.venueId),
    refundPolicy: (String(
      formData.get("refundPolicy") ?? current.refundPolicy,
    ) || current.refundPolicy) as typeof current.refundPolicy,
    transfersAllowed: formData.get("transfersAllowed") === "on",
    partialCancellationAllowed:
      formData.get("partialCancellationAllowed") === "on",
  };

  const isLive = current.status === "LIVE";
  // Venue is a "where", and someone booked a ticket to a place. Changing it on
  // a LIVE event is a re-review trigger, exactly like a date change.
  const needsReview = isLive && next.venueId !== current.venueId;
  const ip = await requestIp();

  try {
    await db.$transaction(async (tx) => {
      if (needsReview) {
        assertTransition("event", current.status, "IN_REVIEW");
        // The live row is NOT updated. The proposal parks in pendingChanges
        // and the marketplace keeps selling the event people are looking at.
        await updateOwnedEvent(tx, ctx.organizerId, eventId, {
          status: "IN_REVIEW",
          submittedAt: new Date(),
          pendingChanges: next as unknown as Prisma.InputJsonValue,
        });
      } else {
        await updateOwnedEvent(tx, ctx.organizerId, eventId, next);
      }

      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ORGANIZER",
        action: needsReview ? "event.update" : "event.update",
        entityType: "Event",
        entityId: eventId,
        before: pick(current, [
          "title",
          "summary",
          "description",
          "venueId",
          "refundPolicy",
          "transfersAllowed",
          "partialCancellationAllowed",
          "status",
        ]),
        after: needsReview ? { pendingChanges: next, status: "IN_REVIEW" } : next,
        ip,
      });
    });

    revalidatePath(`/organizer/events/${eventId}`);
    return ok(
      needsReview
        ? "Sent for review. Your event keeps selling at its current details until an admin approves."
        : "Saved.",
    );
  } catch (err) {
    return toResult(err);
  }
}

/** DRAFT or REJECTED → IN_REVIEW. Where the Basic plan's LIVE cap is enforced. */
export async function submitEventForReview(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeOrganizer({ writable: true });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const eventId = String(formData.get("eventId") ?? "");
  const [event, cfg] = await Promise.all([
    db.event.findFirst({
      where: { id: eventId, organizerId: ctx.organizerId },
      select: {
        id: true,
        status: true,
        coverImageUrl: true,
        _count: { select: { sessions: true, tiers: true } },
        sessions: {
          where: { isActive: true, startsAt: { gt: new Date() } },
          select: { id: true },
          take: 1,
        },
        tiers: { where: { isActive: true }, select: { id: true }, take: 1 },
      },
    }),
    getBusinessConfig(),
  ]);
  if (!event) return fail("Not found.");

  // Completeness gate — an event with no future night or no tier cannot sell,
  // and putting it in front of a reviewer wastes their queue.
  const missing: string[] = [];
  if (!event.sessions.length) missing.push("at least one future session");
  if (!event.tiers.length) missing.push("at least one ticket tier");
  if (!event.coverImageUrl) missing.push("a cover image");
  if (missing.length) {
    return fail(`Add ${missing.join(", ")} before submitting.`);
  }

  if (ctx.plan === "BASIC") {
    const liveCount = await db.event.count({
      where: { organizerId: ctx.organizerId, status: "LIVE" },
    });
    if (liveCount >= cfg.planBasicLiveEventCap) {
      return fail(
        `The Basic plan allows ${cfg.planBasicLiveEventCap} live events. ` +
          `Upgrade to Pro, or wait for one to complete — your existing live ` +
          `events are unaffected.`,
      );
    }
  }

  const ip = await requestIp();
  try {
    await db.$transaction(async (tx) => {
      assertTransition("event", event.status, "IN_REVIEW");
      await updateOwnedEvent(tx, ctx.organizerId, eventId, {
        status: "IN_REVIEW",
        submittedAt: new Date(),
        rejectionNote: null,
      });
      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ORGANIZER",
        action: "event.submit",
        entityType: "Event",
        entityId: eventId,
        before: { status: event.status },
        after: { status: "IN_REVIEW" },
        ip,
      });
    });
    revalidatePath("/organizer/events");
    return ok("Submitted for review. Most events are reviewed within 24 hours.");
  } catch (err) {
    return toResult(err);
  }
}

/** LIVE ⇄ PAUSED. Sold tickets stay valid either way (spec B1). */
export async function toggleEventPause(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeOrganizer({ writable: true });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const eventId = String(formData.get("eventId") ?? "");
  const event = await db.event.findFirst({
    where: { id: eventId, organizerId: ctx.organizerId },
    select: { id: true, status: true },
  });
  if (!event) return fail("Not found.");

  const to = event.status === "LIVE" ? "PAUSED" : "LIVE";
  const ip = await requestIp();

  try {
    await db.$transaction(async (tx) => {
      assertTransition("event", event.status, to);
      await updateOwnedEvent(tx, ctx.organizerId, eventId, {
        status: to,
        pausedAt: to === "PAUSED" ? new Date() : null,
      });
      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ORGANIZER",
        action: to === "PAUSED" ? "event.pause" : "event.resume",
        entityType: "Event",
        entityId: eventId,
        before: { status: event.status },
        after: { status: to },
        ip,
      });
    });
    revalidatePath("/organizer/events");
    return ok(
      to === "PAUSED"
        ? "Paused. It is off the listings; tickets already sold stay valid."
        : "Live again.",
    );
  } catch (err) {
    return toResult(err);
  }
}

/** Close the gates (spec E4) — the scanner then answers GATES_CLOSED. */
export async function setGatesClosed(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeOrganizer({ writable: true });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const eventId = String(formData.get("eventId") ?? "");
  const closed = formData.get("closed") === "true";
  const event = await db.event.findFirst({
    where: { id: eventId, organizerId: ctx.organizerId },
    select: { id: true, gatesClosedAt: true },
  });
  if (!event) return fail("Not found.");

  const ip = await requestIp();
  try {
    await db.$transaction(async (tx) => {
      await updateOwnedEvent(tx, ctx.organizerId, eventId, {
        gatesClosedAt: closed ? new Date() : null,
      });
      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ORGANIZER",
        action: "event.gates_closed",
        entityType: "Event",
        entityId: eventId,
        before: { gatesClosedAt: event.gatesClosedAt },
        after: { gatesClosedAt: closed ? new Date() : null },
        ip,
      });
    });
    revalidatePath(`/organizer/events/${eventId}/live`);
    return ok(closed ? "Gates closed." : "Gates reopened.");
  } catch (err) {
    return toResult(err);
  }
}

/** Only a DRAFT that never published. Anything else has money pointing at it. */
export async function deleteEventDraft(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeOrganizer({ writable: true });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const eventId = String(formData.get("eventId") ?? "");
  const event = await db.event.findFirst({
    where: { id: eventId, organizerId: ctx.organizerId },
    select: { id: true, title: true, status: true, publishedAt: true },
  });
  if (!event) return fail("Not found.");

  if (!canHardDeleteEvent(event)) {
    return fail(
      "Only an unpublished draft can be deleted. Pause or cancel this event instead — " +
        "its tickets and payments are the record of what is owed to whom.",
    );
  }

  const ip = await requestIp();
  try {
    await db.$transaction(async (tx) => {
      const { count } = await tx.event.deleteMany({
        where: { id: eventId, organizerId: ctx.organizerId, status: "DRAFT" },
      });
      if (count !== 1) throw new NotOwnedError("Event", eventId);
      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ORGANIZER",
        action: "event.delete_draft",
        entityType: "Event",
        entityId: eventId,
        before: pick(event, ["title", "status"]),
        after: null,
        ip,
      });
    });
    revalidatePath("/organizer/events");
    return ok("Draft deleted.");
  } catch (err) {
    return toResult(err);
  }
}

// ---------------------------------------------------------------------------
// Ticket tiers
// ---------------------------------------------------------------------------

export async function upsertTier(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeOrganizer({ writable: true });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const eventId = String(formData.get("eventId") ?? "");
  const tierId = strOrNull(formData.get("tierId"));
  const name = String(formData.get("name") ?? "").trim();
  const priceRupees = Number(formData.get("priceRupees") ?? NaN);
  const quantityTotal = Number(formData.get("quantityTotal") ?? NaN);
  const perUserLimit = Number(formData.get("perUserLimit") ?? 10);
  const isSeasonPass = formData.get("isSeasonPass") === "on";

  if (!name) return fail("Name the tier.");
  if (!Number.isFinite(priceRupees) || priceRupees < 0) {
    return fail("Enter a valid price.");
  }
  if (!Number.isInteger(quantityTotal) || quantityTotal < 1) {
    return fail("Enter a whole capacity of at least 1.");
  }

  const event = await db.event.findFirst({
    where: { id: eventId, organizerId: ctx.organizerId },
    select: { id: true, status: true },
  });
  if (!event) return fail("Not found.");

  const existing = tierId
    ? await db.ticketTier.findFirst({
        where: { id: tierId, event: { organizerId: ctx.organizerId } },
        select: {
          id: true,
          name: true,
          pricePaise: true,
          quantityTotal: true,
          quantitySold: true,
          quantityHeld: true,
          perUserLimit: true,
          isSeasonPass: true,
        },
      })
    : null;
  if (tierId && !existing) return fail("Not found.");

  const pricePaise = toPaise(priceRupees);

  // Spec B1: raising a price on a LIVE event is a re-review trigger, because
  // somebody is looking at the old number right now. Lowering it is a gift and
  // applies immediately.
  if (existing && event.status === "LIVE" && pricePaise > existing.pricePaise) {
    return fail(
      "Raising a price on a live event needs admin review. Save it as a pending " +
        "change from the event's Details tab — the event keeps selling at the " +
        "current price until it is approved.",
    );
  }

  const ip = await requestIp();
  try {
    const id = await db.$transaction(async (tx) => {
      if (existing) {
        // Capacity moves through the guarded UPDATE, never through Prisma:
        // lowering it below what is already sold would produce a permanently
        // negative remainder and seats that cannot exist (invariant I1).
        if (quantityTotal !== existing.quantityTotal) {
          const okCapacity = await setTierCapacity(tx, existing.id, quantityTotal);
          if (!okCapacity) {
            throw new CapacityTooLow(
              existing.quantitySold + existing.quantityHeld,
            );
          }
        }
        await updateOwnedTier(tx, ctx.organizerId, existing.id, {
          name,
          pricePaise,
          perUserLimit,
          isSeasonPass,
        });
        await writeAudit(tx, {
          actorId: ctx.userId,
          actorType: "ORGANIZER",
          action: "event.update",
          entityType: "TicketTier",
          entityId: existing.id,
          before: pick(existing, [
            "name",
            "pricePaise",
            "quantityTotal",
            "perUserLimit",
            "isSeasonPass",
          ]),
          after: { name, pricePaise, quantityTotal, perUserLimit, isSeasonPass },
          ip,
        });
        return existing.id;
      }

      const created = await tx.ticketTier.create({
        data: {
          id: cuidish(),
          eventId: event.id,
          name,
          pricePaise,
          quantityTotal,
          perUserLimit,
          isSeasonPass,
        },
        select: { id: true },
      });
      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ORGANIZER",
        action: "event.update",
        entityType: "TicketTier",
        entityId: created.id,
        before: null,
        after: { name, pricePaise, quantityTotal, perUserLimit, isSeasonPass },
        ip,
      });
      return created.id;
    });

    revalidatePath(`/organizer/events/${eventId}`);
    return ok("Tier saved.", id);
  } catch (err) {
    if (err instanceof CapacityTooLow) {
      return fail(
        `You have already committed ${err.committed} of these tickets. ` +
          `Capacity cannot go below that.`,
      );
    }
    return toResult(err);
  }
}

class CapacityTooLow extends Error {
  constructor(readonly committed: number) {
    super(`Capacity below committed ${committed}`);
    this.name = "CapacityTooLow";
  }
}

// ---------------------------------------------------------------------------
// Sessions and gates
// ---------------------------------------------------------------------------

export async function upsertSession(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeOrganizer({ writable: true });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const eventId = String(formData.get("eventId") ?? "");
  const startsAt = new Date(String(formData.get("startsAt") ?? ""));
  const endsAt = new Date(String(formData.get("endsAt") ?? ""));
  const name = strOrNull(formData.get("name"));

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return fail("Enter both a start and an end time.");
  }
  // A Garba night runs 8 PM–1 AM, so an end BEFORE the start is normal and
  // correct — it is the next calendar day. Only an equal or earlier-by-a-lot
  // pairing is a mistake. The session belongs to its START date (D-012).
  if (endsAt <= startsAt) {
    return fail(
      "The end time must be after the start. For a night that runs past " +
        "midnight, pick the following date for the end.",
    );
  }

  const event = await db.event.findFirst({
    where: { id: eventId, organizerId: ctx.organizerId },
    select: { id: true, _count: { select: { sessions: true } } },
  });
  if (!event) return fail("Not found.");

  const ip = await requestIp();
  try {
    const id = await db.$transaction(async (tx) => {
      const created = await tx.eventSession.create({
        data: {
          id: cuidish(),
          eventId: event.id,
          sequence: event._count.sessions + 1,
          name,
          startsAt,
          endsAt,
        },
        select: { id: true, sequence: true },
      });
      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ORGANIZER",
        action: "event.update",
        entityType: "EventSession",
        entityId: created.id,
        before: null,
        after: { sequence: created.sequence, name, startsAt, endsAt },
        ip,
      });
      return created.id;
    });
    revalidatePath(`/organizer/events/${eventId}`);
    return ok("Session added.", id);
  } catch (err) {
    return toResult(err);
  }
}

export async function createGate(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeOrganizer({ writable: true });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const eventId = String(formData.get("eventId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();
  if (!name || !code) return fail("A gate needs a name and a short code.");

  const event = await db.event.findFirst({
    where: { id: eventId, organizerId: ctx.organizerId },
    select: { id: true },
  });
  if (!event) return fail("Not found.");

  const ip = await requestIp();
  try {
    await db.$transaction(async (tx) => {
      const created = await tx.gate.create({
        data: { id: cuidish(), eventId: event.id, name, code },
        select: { id: true },
      });
      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ORGANIZER",
        action: "event.update",
        entityType: "Gate",
        entityId: created.id,
        before: null,
        after: { name, code },
        ip,
      });
    });
    revalidatePath(`/organizer/events/${eventId}/staff`);
    return ok("Gate added.");
  } catch (err) {
    if (isUniqueViolation(err)) return fail("That gate code is already used.");
    return toResult(err);
  }
}

// ---------------------------------------------------------------------------
// Staff (spec A1.4 / E4)
// ---------------------------------------------------------------------------

export async function assignStaff(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeOrganizer({ writable: true });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const eventId = String(formData.get("eventId") ?? "");
  const phone = String(formData.get("phone") ?? "").replace(/\D/g, "");
  const gateId = strOrNull(formData.get("gateId"));
  const canOverride = formData.get("canOverride") === "on";

  if (phone.length < 10) return fail("Enter the staff member's mobile number.");

  const event = await db.event.findFirst({
    where: { id: eventId, organizerId: ctx.organizerId },
    select: { id: true },
  });
  if (!event) return fail("Not found.");

  // A gate id arrives from a select the organizer just saw, but it still
  // arrives in a request — so it is re-checked against this event rather than
  // trusted.
  if (gateId) {
    const gate = await db.gate.findFirst({
      where: { id: gateId, eventId, event: { organizerId: ctx.organizerId } },
      select: { id: true },
    });
    if (!gate) return fail("That gate is not on this event.");
  }

  const user = await db.user.findFirst({
    where: { phone: { endsWith: phone.slice(-10) } },
    select: { id: true, name: true },
  });
  if (!user) {
    return fail(
      "No Entry Now account with that number. Ask them to sign in once, then add them.",
    );
  }

  const ip = await requestIp();
  try {
    await db.$transaction(async (tx) => {
      const created = await tx.staffAssignment.create({
        data: {
          id: cuidish(),
          userId: user.id,
          eventId: event.id,
          gateId,
          canOverride,
        },
        select: { id: true },
      });
      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ORGANIZER",
        action: "staff.assign",
        entityType: "StaffAssignment",
        entityId: created.id,
        before: null,
        after: { userId: user.id, eventId: event.id, gateId, canOverride },
        ip,
      });
    });
    revalidatePath(`/organizer/events/${eventId}/staff`);
    return ok(`${user.name ?? "Staff member"} can now scan at this event.`);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return fail("They are already assigned to this gate.");
    }
    return toResult(err);
  }
}

export async function revokeStaff(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeOrganizer({ writable: true });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const assignmentId = String(formData.get("assignmentId") ?? "");
  const existing = await db.staffAssignment.findFirst({
    where: { id: assignmentId, event: { organizerId: ctx.organizerId } },
    select: { id: true, eventId: true, userId: true, gateId: true },
  });
  if (!existing) return fail("Not found.");

  const ip = await requestIp();
  try {
    await db.$transaction(async (tx) => {
      const { count } = await tx.staffAssignment.deleteMany({
        where: { id: assignmentId, event: { organizerId: ctx.organizerId } },
      });
      if (count !== 1) throw new NotOwnedError("StaffAssignment", assignmentId);
      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ORGANIZER",
        action: "staff.revoke",
        entityType: "StaffAssignment",
        entityId: assignmentId,
        before: existing,
        after: null,
        ip,
      });
    });
    revalidatePath(`/organizer/events/${existing.eventId}/staff`);
    return ok("Access revoked.");
  } catch (err) {
    return toResult(err);
  }
}

// ---------------------------------------------------------------------------
// Promos
// ---------------------------------------------------------------------------

export async function upsertPromo(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeOrganizer({ writable: true });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const promoId = strOrNull(formData.get("promoId"));
  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();
  const description = strOrNull(formData.get("description"));
  const kind = String(formData.get("kind") ?? "PCT");
  const amount = Number(formData.get("amount") ?? NaN);
  const usageLimit = strOrNull(formData.get("usageLimit"));
  const eventId = strOrNull(formData.get("eventId"));

  if (!/^[A-Z0-9]{3,20}$/.test(code)) {
    return fail("Codes are 3–20 letters and digits.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return fail("Enter a discount greater than zero.");
  }
  if (kind === "PCT" && amount > 100) {
    return fail("A percentage discount cannot exceed 100.");
  }

  if (eventId) {
    const owned = await db.event.findFirst({
      where: { id: eventId, organizerId: ctx.organizerId },
      select: { id: true },
    });
    if (!owned) return fail("That event is not yours.");
  }

  const existing = promoId
    ? await db.promo.findFirst({
        where: {
          id: promoId,
          OR: [
            { organizerId: ctx.organizerId },
            { event: { organizerId: ctx.organizerId } },
          ],
        },
      })
    : null;
  if (promoId && !existing) return fail("Not found.");

  const data = {
    code,
    description,
    eventId,
    organizerId: ctx.organizerId,
    discountPct: kind === "PCT" ? amount : null,
    discountFlatPaise: kind === "FLAT" ? toPaise(amount) : null,
    usageLimit: usageLimit ? Number(usageLimit) : null,
  };

  const ip = await requestIp();
  try {
    await db.$transaction(async (tx) => {
      if (existing) {
        const { count } = await tx.promo.updateMany({
          where: {
            id: existing.id,
            OR: [
              { organizerId: ctx.organizerId },
              { event: { organizerId: ctx.organizerId } },
            ],
          },
          data,
        });
        if (count !== 1) throw new NotOwnedError("Promo", existing.id);
        await writeAudit(tx, {
          actorId: ctx.userId,
          actorType: "ORGANIZER",
          action: "promo.update",
          entityType: "Promo",
          entityId: existing.id,
          before: pick(existing, [
            "code",
            "discountPct",
            "discountFlatPaise",
            "usageLimit",
            "isActive",
          ]),
          after: data,
          ip,
        });
      } else {
        const created = await tx.promo.create({
          data: { id: cuidish(), ...data },
          select: { id: true },
        });
        await writeAudit(tx, {
          actorId: ctx.userId,
          actorType: "ORGANIZER",
          action: "promo.create",
          entityType: "Promo",
          entityId: created.id,
          before: null,
          after: data,
          ip,
        });
      }
    });
    revalidatePath("/organizer/promos");
    return ok("Promo saved.");
  } catch (err) {
    if (isUniqueViolation(err)) return fail("That code already exists.");
    return toResult(err);
  }
}

/**
 * Deactivate, never delete.
 *
 * `PromoRedemption` rows point at this promo and they are the evidence of a
 * discount someone actually received — deleting the promo either fails on the
 * foreign key or orphans the discount on a settled booking.
 */
export async function deactivatePromo(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeOrganizer({ writable: true });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const promoId = String(formData.get("promoId") ?? "");
  const existing = await db.promo.findFirst({
    where: {
      id: promoId,
      OR: [
        { organizerId: ctx.organizerId },
        { event: { organizerId: ctx.organizerId } },
      ],
    },
    select: { id: true, code: true, isActive: true },
  });
  if (!existing) return fail("Not found.");

  const ip = await requestIp();
  try {
    await db.$transaction(async (tx) => {
      const { count } = await tx.promo.updateMany({
        where: {
          id: promoId,
          OR: [
            { organizerId: ctx.organizerId },
            { event: { organizerId: ctx.organizerId } },
          ],
        },
        data: { isActive: !existing.isActive },
      });
      if (count !== 1) throw new NotOwnedError("Promo", promoId);
      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ORGANIZER",
        action: "promo.deactivate",
        entityType: "Promo",
        entityId: promoId,
        before: { isActive: existing.isActive },
        after: { isActive: !existing.isActive },
        ip,
      });
    });
    revalidatePath("/organizer/promos");
    return ok(existing.isActive ? "Promo paused." : "Promo reactivated.");
  } catch (err) {
    return toResult(err);
  }
}

// ---------------------------------------------------------------------------
// Announcements (spec E3 — 3 per event per week)
// ---------------------------------------------------------------------------

export async function sendAnnouncement(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeOrganizer({ writable: true });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const eventId = String(formData.get("eventId") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (subject.length < 3 || body.length < 10) {
    return fail("Write a subject and a message.");
  }

  const [event, cfg] = await Promise.all([
    db.event.findFirst({
      where: { id: eventId, organizerId: ctx.organizerId },
      select: { id: true, title: true },
    }),
    getBusinessConfig(),
  ]);
  if (!event) return fail("Not found.");

  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const sentThisWeek = await db.announcement.count({
    where: {
      eventId,
      organizerId: ctx.organizerId,
      bypassesCap: false,
      createdAt: { gte: weekAgo },
    },
  });
  if (sentThisWeek >= cfg.announcementsPerEventPerWeek) {
    return fail(
      `You have sent ${sentThisWeek} announcements for this event in the last ` +
        `7 days. The limit is ${cfg.announcementsPerEventPerWeek} — it protects ` +
        `your attendees' inbox, and yours.`,
    );
  }

  // Everyone holding a live ticket. Cancelled bookings are deliberately
  // excluded: they are not attending, and mailing them is a complaint.
  const recipients = await db.booking.findMany({
    where: { eventId, event: { organizerId: ctx.organizerId }, status: "CONFIRMED" },
    select: { userId: true },
    distinct: ["userId"],
  });

  const ip = await requestIp();
  try {
    await db.$transaction(async (tx) => {
      const created = await tx.announcement.create({
        data: {
          id: cuidish(),
          eventId,
          organizerId: ctx.organizerId,
          subject,
          body,
          audienceCount: recipients.length,
          sentAt: new Date(),
        },
        select: { id: true },
      });

      if (recipients.length) {
        await tx.notification.createMany({
          data: recipients.map((r) => ({
            id: cuidish(),
            userId: r.userId,
            kind: "ANNOUNCEMENT",
            title: subject,
            body,
            href: `/tickets`,
          })),
        });
      }

      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ORGANIZER",
        action: "announcement.send",
        entityType: "Announcement",
        entityId: created.id,
        before: null,
        after: { eventId, subject, audienceCount: recipients.length },
        ip,
      });
    });
    revalidatePath("/organizer/announcements");
    return ok(
      recipients.length
        ? `Sent to ${recipients.length} attendee${recipients.length === 1 ? "" : "s"}.`
        : "Saved — nobody has booked yet, so there was no one to notify.",
    );
  } catch (err) {
    return toResult(err);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  );
}

/** `EN-{shortCode}-0001` — three letters from the title, uppercase. */
function shortCodeFor(title: string): string {
  const letters = title.replace(/[^a-zA-Z]/g, "").toUpperCase();
  return (letters.slice(0, 3) || "EVT").padEnd(3, "X");
}

async function uniqueSlug(title: string): Promise<string> {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "event";
  for (let i = 0; i < 40; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    // tenant-ok: slugs are globally unique across all organizers, so this
    // lookup is deliberately unscoped — scoping it would mint a duplicate.
    const taken = await db.event.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------------
// Venues
// ---------------------------------------------------------------------------

/**
 * Resolve the point for a venue an organizer is adding.
 *
 * Three sources, in descending order of how much we should trust them:
 *
 * 1. **What they pasted.** A Maps link or a coordinate pair is the organizer
 *    telling us exactly where the gate is. Nothing beats that.
 * 2. **The geocoder.** Good for a real street address, and `GEOCODE_DRIVER`
 *    defaults to a small Ahmedabad gazetteer, so it will often find nothing.
 * 3. **The city centre.** Never silently — the caller surfaces a warning and
 *    the venue is still editable, because a pin in the middle of Ahmedabad is
 *    better than refusing to let someone list their event at all.
 *
 * A pasted point is checked against the city before it is accepted. A
 * transposed pair is a perfectly valid coordinate that lands in the Arabian
 * Sea, so range validation alone catches nothing.
 */
async function resolveVenuePoint(input: {
  pasted: string;
  name: string;
  addressLine: string;
  city: { name: string; lat: number; lng: number };
}): Promise<{ point: LatLng; source: "pasted" | "geocoded" | "city"; error?: string }> {
  const city = { lat: input.city.lat, lng: input.city.lng };

  if (input.pasted.trim()) {
    const parsed = parseLatLng(input.pasted);
    if (!parsed) {
      return {
        point: city,
        source: "city",
        error:
          "That location did not look like a Google Maps link or a “lat, lng” pair.",
      };
    }
    if (!isNearCity(parsed, city)) {
      return {
        point: city,
        source: "city",
        error: `Those coordinates are more than ${MAX_VENUE_DISTANCE_KM}km from ${input.city.name}. Check they are not the wrong way round.`,
      };
    }
    return { point: parsed, source: "pasted" };
  }

  try {
    const hits = await getGeocodeAdapter().search(
      `${input.name}, ${input.addressLine}, ${input.city.name}`,
      city,
    );
    const hit = hits.find((h) => isNearCity(h.center, city));
    if (hit) return { point: hit.center, source: "geocoded" };
  } catch {
    // Geocoding is an assist, never a gate — fall through to the city centre.
  }

  return { point: city, source: "city" };
}

export async function createVenue(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeOrganizer({ writable: true });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const name = String(formData.get("name") ?? "").trim();
  const addressLine = String(formData.get("addressLine") ?? "").trim();
  const pincode = String(formData.get("pincode") ?? "").trim();
  const localityId = String(formData.get("localityId") ?? "").trim();
  const pasted = String(formData.get("location") ?? "");
  const cityId = String(formData.get("cityId") ?? "").trim();

  if (name.length < 3) return fail("Give the venue a name of at least 3 characters.");
  if (addressLine.length < 6) return fail("Add a street address for the venue.");
  if (pincode && !/^\d{6}$/.test(pincode)) return fail("A pincode is six digits.");

  // The city is a form field, so it is validated against the catalogue rather
  // than trusted — an arbitrary id here would attach the venue to a city that
  // does not exist, or one we do not serve.
  const city = await db.city.findFirst({
    where: { id: cityId, isActive: true },
    select: { id: true, name: true, lat: true, lng: true },
  });
  if (!city) return fail("Pick a city we operate in.");

  // Same for locality: it must belong to the city that was chosen, or the
  // event lands in a filter bucket it has nothing to do with.
  if (localityId) {
    const loc = await db.locality.findFirst({
      where: { id: localityId, cityId: city.id },
      select: { id: true },
    });
    if (!loc) return fail("That locality is not in the selected city.");
  }

  const resolved = await resolveVenuePoint({
    pasted,
    name,
    addressLine,
    city: { name: city.name, lat: Number(city.lat), lng: Number(city.lng) },
  });
  if (resolved.error) return fail(resolved.error);

  const ip = await requestIp();

  try {
    const id = await db.$transaction(async (tx) => {
      const created = await tx.venue.create({
        data: {
          id: cuidish(),
          name,
          addressLine,
          pincode: pincode || null,
          cityId: city.id,
          localityId: localityId || null,
          lat: resolved.point.lat,
          lng: resolved.point.lng,
          // Authorship is what keeps this row out of every other organizer's
          // dropdown (D-040). Taken from the session, never the form.
          createdByOrganizerId: ctx.organizerId,
        },
        select: { id: true, name: true, addressLine: true, cityId: true },
      });

      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ORGANIZER",
        action: "venue.create",
        entityType: "Venue",
        entityId: created.id,
        before: null,
        after: { ...created, pointSource: resolved.source },
        ip,
      });

      return created.id;
    });

    revalidatePath("/organizer/venues");
    revalidatePath("/organizer/events");

    return ok(
      resolved.source === "city"
        ? `“${name}” added, but we could not place it on the map — the pin is on ${city.name} city centre. Paste a Google Maps link to fix it.`
        : `“${name}” added. Pick it in the venue list above.`,
      id,
    );
  } catch (err) {
    return toResult(err);
  }
}

export async function updateVenue(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeOrganizer({ writable: true });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const venueId = String(formData.get("venueId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const addressLine = String(formData.get("addressLine") ?? "").trim();
  const pincode = String(formData.get("pincode") ?? "").trim();
  const pasted = String(formData.get("location") ?? "");

  if (name.length < 3) return fail("Give the venue a name of at least 3 characters.");
  if (addressLine.length < 6) return fail("Add a street address for the venue.");
  if (pincode && !/^\d{6}$/.test(pincode)) return fail("A pincode is six digits.");

  // Ownership is part of the read, so a venue belonging to the platform or to
  // another organizer is simply not found rather than being edited.
  const current = await db.venue.findFirst({
    where: { id: venueId, createdByOrganizerId: ctx.organizerId },
    select: {
      id: true,
      name: true,
      addressLine: true,
      pincode: true,
      lat: true,
      lng: true,
      city: { select: { id: true, name: true, lat: true, lng: true } },
    },
  });
  if (!current) return fail("Not found.");

  const city = {
    name: current.city.name,
    lat: Number(current.city.lat),
    lng: Number(current.city.lng),
  };
  const resolved = pasted.trim()
    ? await resolveVenuePoint({ pasted, name, addressLine, city })
    : { point: { lat: Number(current.lat), lng: Number(current.lng) }, source: "pasted" as const };
  if ("error" in resolved && resolved.error) return fail(resolved.error);

  const ip = await requestIp();

  try {
    await db.$transaction(async (tx) => {
      // `updateMany`, with ownership in the filter. The singular `update`
      // needs a unique where-clause and there is no `@@unique([id,
      // createdByOrganizerId])`, so it has nowhere to put the check — the same
      // reason the rest of the portal uses the plural form.
      const { count } = await tx.venue.updateMany({
        where: { id: venueId, createdByOrganizerId: ctx.organizerId },
        data: {
          name,
          addressLine,
          pincode: pincode || null,
          lat: resolved.point.lat,
          lng: resolved.point.lng,
        },
      });
      // Returning here would COMMIT the transaction (D-023). It has to throw.
      if (count !== 1) throw new NotOwnedError("Venue", venueId);

      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ORGANIZER",
        action: "venue.update",
        entityType: "Venue",
        entityId: venueId,
        before: pick(current, ["name", "addressLine", "pincode"]),
        after: { name, addressLine, pincode: pincode || null },
        ip,
      });
    });

    revalidatePath("/organizer/venues");
    return ok("Venue updated.");
  } catch (err) {
    return toResult(err);
  }
}

/**
 * Retire a venue. Deactivates, never deletes — live events reference it
 * (spec G2), and a deleted row would orphan an event mid-sale.
 */
export async function setVenueActive(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeOrganizer({ writable: true });
  if (!auth.ok) return fail(auth.error);
  const { ctx } = auth;

  const venueId = String(formData.get("venueId") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";
  const ip = await requestIp();

  try {
    await db.$transaction(async (tx) => {
      const { count } = await tx.venue.updateMany({
        where: { id: venueId, createdByOrganizerId: ctx.organizerId },
        data: { isActive },
      });
      if (count !== 1) throw new NotOwnedError("Venue", venueId);

      await writeAudit(tx, {
        actorId: ctx.userId,
        actorType: "ORGANIZER",
        action: isActive ? "venue.restore" : "venue.retire",
        entityType: "Venue",
        entityId: venueId,
        before: { isActive: !isActive },
        after: { isActive },
        ip,
      });
    });

    revalidatePath("/organizer/venues");
    return ok(isActive ? "Venue restored." : "Venue retired.");
  } catch (err) {
    return toResult(err);
  }
}
