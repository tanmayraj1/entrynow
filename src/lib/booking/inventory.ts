import "server-only";

import type { Prisma } from "@/generated/prisma";

/**
 * The concurrency primitives. Everything that can oversell lives here.
 *
 * Every function is a single guarded `UPDATE … WHERE <precondition>` whose
 * `rowCount` IS the answer. That is the whole design:
 *
 *   - The database evaluates the precondition and performs the write in one
 *     statement, under one row lock. There is no window between "check" and
 *     "act" for a second request to slip into.
 *   - `rowCount === 0` is never an error to swallow. It is the branch that
 *     means "someone else got there first", and each caller has a real answer
 *     for that case — per-tier availability, `ALREADY_SCANNED`, a dropped
 *     duplicate webhook.
 *
 * Prisma's fluent API cannot express this. `update({ where: { id }, data: {
 * quantityHeld: { increment: n } } })` has no room for the `WHERE` clause that
 * makes it safe, and read-then-write in application code reintroduces exactly
 * the race we are eliminating. Do not "simplify" these into Prisma calls.
 *
 * Column names are quoted camelCase: the schema maps table names but not
 * column names, so `quantityHeld` really is `"quantityHeld"` in Postgres.
 */

/** A Prisma transaction client. All of these MUST run inside `$transaction`. */
export type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Tier inventory — invariant I1: quantitySold + quantityHeld <= quantityTotal
// ---------------------------------------------------------------------------

/**
 * Take a hold on `quantity` seats.
 *
 * The guard is the invariant itself, restated as a precondition. If the tier
 * cannot satisfy it the UPDATE matches no rows and nothing changes — no
 * partial hold, no negative remainder.
 */
export async function holdSeats(
  tx: Tx,
  tierId: string,
  quantity: number,
): Promise<boolean> {
  const rows = await tx.$executeRaw`
    UPDATE ticket_tiers
       SET "quantityHeld" = "quantityHeld" + ${quantity},
           "updatedAt"    = NOW()
     WHERE id = ${tierId}
       AND "isActive" = true
       AND "quantityTotal" - "quantitySold" - "quantityHeld" >= ${quantity}
  `;
  return rows === 1;
}

/**
 * Give held seats back — an expired hold, a failed payment, an abandoned
 * checkout.
 *
 * `GREATEST(0, …)` is deliberate. A double release (the delayed job fires
 * while the sweep is already running) must not drive `quantityHeld` negative,
 * because a negative held count would silently *inflate* availability and
 * oversell the tier. Clamping makes release idempotent in the only direction
 * that matters.
 */
export async function releaseSeats(
  tx: Tx,
  tierId: string,
  quantity: number,
): Promise<boolean> {
  const rows = await tx.$executeRaw`
    UPDATE ticket_tiers
       SET "quantityHeld" = GREATEST(0, "quantityHeld" - ${quantity}),
           "updatedAt"    = NOW()
     WHERE id = ${tierId}
  `;
  return rows === 1;
}

/**
 * Convert a hold into a sale at capture: held goes down, sold goes up, and the
 * total never moves.
 *
 * Guarded on `"quantityHeld" >= quantity` so a capture arriving *after* its
 * hold was already released cannot mint seats out of nothing. The caller
 * treats a false return as "re-acquire or refund" (spec C4.7).
 */
export async function commitSeats(
  tx: Tx,
  tierId: string,
  quantity: number,
): Promise<boolean> {
  const rows = await tx.$executeRaw`
    UPDATE ticket_tiers
       SET "quantityHeld" = "quantityHeld" - ${quantity},
           "quantitySold" = "quantitySold" + ${quantity},
           "updatedAt"    = NOW()
     WHERE id = ${tierId}
       AND "quantityHeld" >= ${quantity}
  `;
  return rows === 1;
}

/**
 * Sell directly, with no prior hold.
 *
 * The late-capture recovery path: the hold expired and was released, but the
 * money arrived anyway. If seats are still there we take them; if not, the
 * caller auto-refunds rather than admitting someone to a full ground
 * (spec C4.7, edge case I5).
 */
export async function sellSeatsDirect(
  tx: Tx,
  tierId: string,
  quantity: number,
): Promise<boolean> {
  const rows = await tx.$executeRaw`
    UPDATE ticket_tiers
       SET "quantitySold" = "quantitySold" + ${quantity},
           "updatedAt"    = NOW()
     WHERE id = ${tierId}
       AND "quantityTotal" - "quantitySold" - "quantityHeld" >= ${quantity}
  `;
  return rows === 1;
}

/** Put sold seats back on sale after a cancellation (spec C6.2). */
export async function restoreSoldSeats(
  tx: Tx,
  tierId: string,
  quantity: number,
): Promise<boolean> {
  const rows = await tx.$executeRaw`
    UPDATE ticket_tiers
       SET "quantitySold" = GREATEST(0, "quantitySold" - ${quantity}),
           "updatedAt"    = NOW()
     WHERE id = ${tierId}
  `;
  return rows === 1;
}

/**
 * Change a tier's capacity without ever breaking I1.
 *
 * The organizer's tier form can lower `quantityTotal`, and the naive Prisma
 * write would happily set a total of 50 on a tier that has already sold 80 —
 * producing a permanently negative remainder, a listing that says "sold out"
 * forever, and 30 attendees whose tickets the ground cannot seat.
 *
 * The guard is the invariant restated: the new total must still cover
 * everything already committed. A `false` return is not an error — it is the
 * branch that tells the organizer "you have already sold 80 of these", which is
 * the only useful thing to say.
 *
 * Raising capacity always passes the guard, which is correct: adding seats
 * cannot violate `sold + held <= total`.
 */
export async function setTierCapacity(
  tx: Tx,
  tierId: string,
  quantityTotal: number,
): Promise<boolean> {
  const rows = await tx.$executeRaw`
    UPDATE ticket_tiers
       SET "quantityTotal" = ${quantityTotal},
           "updatedAt"     = NOW()
     WHERE id = ${tierId}
       AND "quantitySold" + "quantityHeld" <= ${quantityTotal}
  `;
  return rows === 1;
}

// ---------------------------------------------------------------------------
// Promo counters
// ---------------------------------------------------------------------------

/**
 * Reserve one use of a promo at order-creation.
 *
 * Spec C4.4 counts usage at capture; edge case I7 requires the limit to hold
 * against concurrent checkouts. Both are needed, so the counter is split:
 * `reservedCount` is claimed here and `usedCount` at capture, and the limit is
 * tested against their sum (D-005).
 */
export async function reservePromo(tx: Tx, promoId: string): Promise<boolean> {
  const rows = await tx.$executeRaw`
    UPDATE promos
       SET "reservedCount" = "reservedCount" + 1,
           "updatedAt"     = NOW()
     WHERE id = ${promoId}
       AND "isActive" = true
       AND ("usageLimit" IS NULL OR "usedCount" + "reservedCount" < "usageLimit")
  `;
  return rows === 1;
}

/** Hand a reservation back — expiry, failure, or the user removing the code. */
export async function releasePromo(tx: Tx, promoId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE promos
       SET "reservedCount" = GREATEST(0, "reservedCount" - 1),
           "updatedAt"     = NOW()
     WHERE id = ${promoId}
  `;
}

/** Reservation becomes a real use at capture. Net effect on the sum: zero. */
export async function consumePromo(tx: Tx, promoId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE promos
       SET "reservedCount" = GREATEST(0, "reservedCount" - 1),
           "usedCount"     = "usedCount" + 1,
           "updatedAt"     = NOW()
     WHERE id = ${promoId}
  `;
}

// ---------------------------------------------------------------------------
// Ticket numbering
// ---------------------------------------------------------------------------

/**
 * Reserve a contiguous block of `count` ticket numbers for an event.
 *
 * Returns the LAST value after incrementing, so the block is
 * `[seq - count + 1 … seq]`. Doing it as one `UPDATE … RETURNING` is what
 * makes it safe: deriving the sequence from `COUNT(*)` of existing tickets
 * would let two concurrent captures read the same count and mint duplicate
 * ticket numbers, which the unique index would then reject — turning a
 * successful payment into a failed booking (D-021).
 */
export async function reserveTicketNumbers(
  tx: Tx,
  eventId: string,
  count: number,
): Promise<number> {
  const rows = await tx.$queryRaw<{ ticketSeq: number }[]>`
    UPDATE events
       SET "ticketSeq" = "ticketSeq" + ${count}
     WHERE id = ${eventId}
     RETURNING "ticketSeq"
  `;
  if (rows.length !== 1) {
    throw new Error(`reserveTicketNumbers: event ${eventId} not found`);
  }
  return rows[0].ticketSeq;
}

/** `EN-GRB-0412` (D-001, D-017). */
export function formatTicketNumber(shortCode: string, seq: number): string {
  return `EN-${shortCode.toUpperCase()}-${String(seq).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Webhook idempotency
// ---------------------------------------------------------------------------

/**
 * Claim a gateway event exactly once.
 *
 * `ON CONFLICT DO NOTHING` against the unique `gatewayEventId` is the whole
 * idempotency mechanism: the first caller to insert owns the event, every
 * replay gets `rowCount === 0` and returns early. Gateways retry on any
 * non-2xx and can deliver out of order, so this is not an edge case — it is
 * the normal operating condition (spec C4.6, edge case I3).
 */
export async function claimWebhookEvent(
  tx: Tx,
  args: { gatewayEventId: string; eventType: string; payload: unknown },
): Promise<boolean> {
  const rows = await tx.$executeRaw`
    INSERT INTO webhook_events (id, "gatewayEventId", "eventType", payload, "createdAt")
    VALUES (
      ${cuidish()},
      ${args.gatewayEventId},
      ${args.eventType},
      ${JSON.stringify(args.payload)}::jsonb,
      NOW()
    )
    ON CONFLICT ("gatewayEventId") DO NOTHING
  `;
  return rows === 1;
}

/**
 * An id for raw INSERTs, which bypass Prisma's `@default(cuid())`.
 * Not a real cuid2 — it only has to be unique and sortable, and the column is
 * an opaque text primary key.
 */
export function cuidish(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
