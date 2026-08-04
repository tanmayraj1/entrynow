import "server-only";

import type { Tx } from "@/lib/booking/inventory";
import { db } from "@/lib/db";

/**
 * Tenant scoping for the organizer portal.
 *
 * The rule the whole portal rests on:
 *
 * > An organizer's id comes from their **session**, never from a URL, a body,
 * > or a form field.
 *
 * Three layers enforce it, because any one alone is escapable:
 *
 * 1. **A branded type.** `OrganizerId` is nominally distinct from `string`, and
 *    `organizerScope()` — its only mint site — is called from
 *    `src/lib/auth/rbac.ts` and nowhere else. A route that tries to pass
 *    `params.organizerId` straight through does not compile.
 * 2. **Ownership-checked accessors.** Reads go through `findFirst` with the
 *    organizer in the `where`; writes go through `updateMany`/`deleteMany`,
 *    which accept a non-unique filter, so ownership is part of the statement
 *    rather than a check someone remembered to write first.
 * 3. **Audit check A12**, which fails the build if a query in this directory
 *    touches Prisma without an `organizerId` in scope.
 *
 * Why writes must use `updateMany`: Prisma's `update`/`delete` require a
 * *unique* where-clause, and there is no `@@unique([id, organizerId])` on
 * `Event`. So `update({ where: { id } })` is the only shape that compiles —
 * and it has nowhere to put the ownership filter. `updateMany` takes an
 * arbitrary filter and returns a count, which is exactly the check we need.
 */

declare const brand: unique symbol;

/** A `string` that provably came from a verified session. */
export type OrganizerId = string & { readonly [brand]: "organizer" };

/**
 * The ONLY place an `OrganizerId` is created.
 *
 * Called from `requireOrganizer` / `authorizeOrganizer` in
 * `src/lib/auth/rbac.ts`, which read it from the session. Calling it anywhere
 * else — especially on a value that arrived in a request — defeats the brand,
 * and A12 flags it.
 */
export function organizerScope(idFromSession: string): OrganizerId {
  return idFromSession as OrganizerId;
}

/**
 * Thrown when a write matched no rows for this organizer.
 *
 * A throw, not a `false`, because these run inside Prisma interactive
 * transactions where returning a value COMMITS the transaction (D-023) — a
 * soft failure would leave whatever else the transaction had already done.
 */
export class NotOwnedError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} does not belong to this organizer.`);
    this.name = "NotOwnedError";
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Null when the event does not exist OR belongs to someone else — the caller
 *  cannot tell the two apart, and neither should the requester. */
export async function findOwnedEvent(orgId: OrganizerId, eventId: string) {
  return db.event.findFirst({ where: { id: eventId, organizerId: orgId } });
}

export async function assertOwnsEvent(
  orgId: OrganizerId,
  eventId: string,
): Promise<void> {
  const found = await db.event.findFirst({
    where: { id: eventId, organizerId: orgId },
    select: { id: true },
  });
  if (!found) throw new NotOwnedError("Event", eventId);
}

/**
 * Columns that belong to the guarded raw SQL in `src/lib/booking/inventory.ts`
 * and to nothing else (invariant I1, D-021).
 *
 * Subtracted from these helpers' `data` types so a tier form that round-trips
 * the whole row is a **compile error**, not a runtime oversell. Audit check
 * A13 greps for the same names, but a grep only sees the shapes it was taught
 * — it cannot see a spread, a variable, or a helper call. The type can.
 */
type NoInventory<T> = Omit<T, "quantitySold" | "quantityHeld" | "ticketSeq">;

type EventData = NoInventory<Parameters<Tx["event"]["updateMany"]>[0]["data"]>;
type TierData = NoInventory<
  Parameters<Tx["ticketTier"]["updateMany"]>[0]["data"]
>;

export async function updateOwnedEvent(
  tx: Tx,
  orgId: OrganizerId,
  eventId: string,
  data: EventData,
): Promise<void> {
  const { count } = await tx.event.updateMany({
    where: { id: eventId, organizerId: orgId },
    data,
  });
  if (count !== 1) throw new NotOwnedError("Event", eventId);
}

// ---------------------------------------------------------------------------
// Children of an event
// ---------------------------------------------------------------------------

/**
 * `TicketTier`, `EventSession`, `Gate`, `EventFaq`, `ScheduleItem` and
 * `EventImage` carry no `organizerId` column, so ownership is expressed
 * through the relation. `updateMany` supports a nested filter, which means the
 * whole ownership chain is one where-clause the database evaluates — not a
 * separate lookup that a caller could skip.
 *
 * Tier writes cannot include `quantitySold` or `quantityHeld` — `NoInventory`
 * removes them from the accepted type, so passing one does not compile. They
 * move only through the guarded raw SQL in `src/lib/booking/inventory.ts`
 * (invariant I1); `setTierCapacity` there is how `quantityTotal` changes
 * safely.
 */
export async function updateOwnedTier(
  tx: Tx,
  orgId: OrganizerId,
  tierId: string,
  data: TierData,
): Promise<void> {
  const { count } = await tx.ticketTier.updateMany({
    where: { id: tierId, event: { organizerId: orgId } },
    data,
  });
  if (count !== 1) throw new NotOwnedError("TicketTier", tierId);
}

export async function updateOwnedSession(
  tx: Tx,
  orgId: OrganizerId,
  sessionId: string,
  data: Parameters<Tx["eventSession"]["updateMany"]>[0]["data"],
): Promise<void> {
  const { count } = await tx.eventSession.updateMany({
    where: { id: sessionId, event: { organizerId: orgId } },
    data,
  });
  if (count !== 1) throw new NotOwnedError("EventSession", sessionId);
}

export async function deleteOwnedGate(
  tx: Tx,
  orgId: OrganizerId,
  gateId: string,
): Promise<void> {
  const { count } = await tx.gate.deleteMany({
    where: { id: gateId, event: { organizerId: orgId } },
  });
  if (count !== 1) throw new NotOwnedError("Gate", gateId);
}

// ---------------------------------------------------------------------------
// Reusable where-fragments
// ---------------------------------------------------------------------------

/** Every booking for this organizer, across all their events. */
export const bookingsOf = (orgId: OrganizerId) => ({
  event: { organizerId: orgId },
});

/** Every ticket for this organizer. */
export const ticketsOf = (orgId: OrganizerId) => ({
  event: { organizerId: orgId },
});

/**
 * Unsettled ledger rows.
 *
 * `payoutId: null` IS the "not yet paid out" flag, and `organizerId` is set
 * only on ORGANIZER-account legs (`src/lib/ledger.ts`), so this sums the
 * organizer's own money without double-counting the platform or external legs.
 * Served exactly by `@@index([organizerId, payoutId])`.
 */
export const unsettledLedgerOf = (orgId: OrganizerId) => ({
  organizerId: orgId,
  payoutId: null,
});
