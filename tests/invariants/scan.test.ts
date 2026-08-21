import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { scanTicket } from "@/lib/scan/engine";
import { signQr } from "@/lib/qr";
import { cuidish } from "@/lib/booking/inventory";

/**
 * Invariant I2 — a ticket becomes SCANNED at most once, ever — against a real
 * Postgres.
 *
 * Like the I1 tests, the thing under test IS the database's behaviour: whether
 * a guarded `UPDATE … WHERE status='ACTIVE'` truly serialises two gates
 * scanning the same QR in the same instant down to one winner. A mock would
 * answer "yes" by construction and prove nothing. The real failure mode —
 * read-then-write letting both scanners see ACTIVE — only appears against a
 * real connection pool.
 *
 * Edge case I2: the same QR presented at two gates concurrently. Exactly one
 * VALID, exactly one ALREADY_SCANNED, and one row in the `tickets` table with
 * one `scannedAt`.
 */

const CONTENDERS = 8;

let eventId: string;
let sessionId: string;
let tierId: string;
let seasonTierId: string;
let userId: string;
let staffUserId: string;
let gateAId: string;
let gateBId: string;
let assignmentId: string;
const createdTicketIds: string[] = [];

beforeAll(async () => {
  // A dedicated event, not a seeded one: these tests flip tickets to SCANNED,
  // and doing that to seed data would silently poison every later run.
  const seedEvent = await db.event.findFirstOrThrow({
    where: { status: "LIVE" },
    select: {
      organizerId: true,
      categoryId: true,
      cityId: true,
      venueId: true,
      organizer: { select: { userId: true } },
    },
  });

  const stamp = Date.now();
  const event = await db.event.create({
    data: {
      slug: `__test_scan_${stamp}`,
      title: `__test_scan_${stamp}`,
      shortCode: "TST",
      status: "LIVE",
      organizerId: seedEvent.organizerId,
      categoryId: seedEvent.categoryId,
      cityId: seedEvent.cityId,
      venueId: seedEvent.venueId,
      publishedAt: new Date(),
    },
    select: { id: true },
  });
  eventId = event.id;

  // A session that is running RIGHT NOW, so the WRONG_SESSION check passes and
  // the atomic claim is what is actually being exercised.
  const session = await db.eventSession.create({
    data: {
      eventId,
      sequence: 1,
      startsAt: new Date(Date.now() - 3_600_000),
      endsAt: new Date(Date.now() + 3_600_000),
    },
    select: { id: true },
  });
  sessionId = session.id;

  const [tier, seasonTier] = await Promise.all([
    db.ticketTier.create({
      data: {
        eventId,
        name: "__test_general",
        pricePaise: 10_000,
        quantityTotal: 100,
      },
      select: { id: true },
    }),
    db.ticketTier.create({
      data: {
        eventId,
        name: "__test_season",
        pricePaise: 50_000,
        quantityTotal: 100,
        isSeasonPass: true,
      },
      select: { id: true },
    }),
  ]);
  tierId = tier.id;
  seasonTierId = seasonTier.id;

  const [gateA, gateB] = await Promise.all([
    db.gate.create({
      data: { eventId, name: "Test Gate A", code: "TA" },
      select: { id: true },
    }),
    db.gate.create({
      data: { eventId, name: "Test Gate B", code: "TB" },
      select: { id: true },
    }),
  ]);
  gateAId = gateA.id;
  gateBId = gateB.id;

  const user = await db.user.findFirstOrThrow({ select: { id: true } });
  userId = user.id;
  staffUserId = seedEvent.organizer.userId;

  const assignment = await db.staffAssignment.create({
    data: { userId: staffUserId, eventId, gateId: gateAId },
    select: { id: true },
  });
  assignmentId = assignment.id;
});

afterAll(async () => {
  await db.scanLog.deleteMany({ where: { eventId } });
  await db.scanConflict.deleteMany({ where: { eventId } });
  await db.sessionScan.deleteMany({
    where: { ticketId: { in: createdTicketIds } },
  });
  await db.ticket.deleteMany({ where: { eventId } });
  await db.booking.deleteMany({ where: { eventId } });
  await db.staffAssignment.deleteMany({ where: { id: assignmentId } });
  await db.gate.deleteMany({ where: { eventId } });
  await db.ticketTier.deleteMany({ where: { eventId } });
  await db.eventSession.deleteMany({ where: { eventId } });
  await db.event.deleteMany({ where: { id: eventId } });
  if (foreignFixture) {
    await db.ticket.deleteMany({ where: { eventId: foreignFixture.eventId } });
    await db.booking.deleteMany({ where: { eventId: foreignFixture.eventId } });
    await db.ticketTier.deleteMany({ where: { eventId: foreignFixture.eventId } });
    await db.event.deleteMany({ where: { id: foreignFixture.eventId } });
  }
  await db.$disconnect();
});

/** A ticket with no booking behind it — this suite tests the gate, not sales. */
async function makeTicket(opts: { seasonPass?: boolean } = {}) {
  const ticket = await db.ticket.create({
    data: {
      id: cuidish(),
      ticketNumber: `EN-TST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      bookingId: await anyBookingId(),
      userId,
      eventId,
      tierId: opts.seasonPass ? seasonTierId : tierId,
      sessionId: opts.seasonPass ? null : sessionId,
      attendeeName: "Test Attendee",
      status: "ACTIVE",
    },
    select: { id: true, qrTokenId: true, ticketNumber: true },
  });
  createdTicketIds.push(ticket.id);
  const token = await signQr({ jti: ticket.qrTokenId, ev: eventId }, farFuture());
  return { ...ticket, token };
}

let cachedBookingId: string | null = null;
/**
 * A booking row for tickets to hang off. Created, not found: this suite used
 * to `findFirstOrThrow` whatever booking happened to be lying around, which
 * worked only because manual checkouts had left rows behind — the first run
 * against a freshly seeded database threw before a single assertion ran. A
 * test that depends on another surface's leftovers is a test of the leftovers.
 */
async function anyBookingId() {
  if (cachedBookingId) return cachedBookingId;
  const existing = await db.booking.findFirst({ select: { id: true } });
  if (existing) return (cachedBookingId = existing.id);
  const created = await db.booking.create({
    data: {
      id: cuidish(),
      bookingNumber: `EN9${Date.now().toString().slice(-5)}`,
      status: "CONFIRMED",
      userId,
      eventId,
      subtotalPaise: 0,
      bookingFeePaise: 0,
      gstOnFeePaise: 0,
      totalPaise: 0,
      gatewayPayablePaise: 0,
      commissionPctUsed: 0,
    },
    select: { id: true },
  });
  return (cachedBookingId = created.id);
}


let foreignFixture: { ticketId: string; qrTokenId: string; eventId: string } | null = null;
/**
 * A genuine ACTIVE ticket belonging to a DIFFERENT organizer's event.
 *
 * Built, not found — the previous version pulled `findFirstOrThrow({ eventId:
 * { not: eventId } })` and depended on some other suite or a manual checkout
 * having left a ticket behind, which a fresh seed does not.
 */
async function foreignTicket() {
  if (foreignFixture) return foreignFixture;
  const otherOrg = await db.event.findFirstOrThrow({
    where: { status: "LIVE", id: { not: eventId } },
    select: { id: true, organizerId: true, categoryId: true, cityId: true, venueId: true },
  });
  const stamp = Date.now();
  const ev = await db.event.create({
    data: {
      slug: `__test_foreign_${stamp}`,
      title: `__test_foreign_${stamp}`,
      shortCode: "TFO",
      status: "LIVE",
      organizerId: otherOrg.organizerId,
      categoryId: otherOrg.categoryId,
      cityId: otherOrg.cityId,
      venueId: otherOrg.venueId,
      publishedAt: new Date(),
    },
    select: { id: true },
  });
  const tier = await db.ticketTier.create({
    data: { eventId: ev.id, name: "__test_foreign", pricePaise: 10_000, quantityTotal: 10 },
    select: { id: true },
  });
  const booking = await db.booking.create({
    data: {
      id: cuidish(), bookingNumber: `EN8${Date.now().toString().slice(-5)}`,
      status: "CONFIRMED", userId, eventId: ev.id,
      subtotalPaise: 0, bookingFeePaise: 0, gstOnFeePaise: 0,
      totalPaise: 0, gatewayPayablePaise: 0, commissionPctUsed: 0,
    },
    select: { id: true },
  });
  const t = await db.ticket.create({
    data: {
      id: cuidish(), ticketNumber: `EN-TFO-0001`, bookingId: booking.id,
      userId, eventId: ev.id, tierId: tier.id, sessionId: null,
      attendeeName: "Foreign Attendee", status: "ACTIVE",
    },
    select: { id: true, qrTokenId: true },
  });
  foreignFixture = { ticketId: t.id, qrTokenId: t.qrTokenId, eventId: ev.id };
  return foreignFixture;
}

function farFuture() {
  return new Date(Date.now() + 30 * 86_400_000);
}

describe("I2 — a ticket is scanned at most once", () => {
  it("admits exactly one of N simultaneous scans of the same QR", async () => {
    const ticket = await makeTicket();

    // Edge case I2: the same code at two gates at once. Fired concurrently on
    // purpose — a sequential loop would pass even with a read-then-write
    // implementation and prove nothing.
    const outcomes = await Promise.all(
      Array.from({ length: CONTENDERS }, (_, i) =>
        scanTicket({
          token: ticket.token,
          eventId,
          gateId: i % 2 === 0 ? gateAId : gateBId,
          staffUserId,
        }),
      ),
    );

    const valid = outcomes.filter((o) => o.result === "VALID");
    const already = outcomes.filter((o) => o.result === "ALREADY_SCANNED");

    expect(valid).toHaveLength(1);
    expect(already).toHaveLength(CONTENDERS - 1);

    // And the database agrees — the invariant, not just the return values.
    const row = await db.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      select: { status: true, scannedAt: true, scannedGateId: true },
    });
    expect(row.status).toBe("SCANNED");
    expect(row.scannedAt).not.toBeNull();
    expect(row.scannedGateId).not.toBeNull();
  });

  it("tells the second scanner when and where it was already used", async () => {
    const ticket = await makeTicket();

    const first = await scanTicket({
      token: ticket.token,
      eventId,
      gateId: gateAId,
      staffUserId,
    });
    const second = await scanTicket({
      token: ticket.token,
      eventId,
      gateId: gateBId,
      staffUserId,
    });

    expect(first.result).toBe("VALID");
    expect(second.result).toBe("ALREADY_SCANNED");
    // "Already scanned" without a time and a gate is unarguable at a turnstile.
    expect(second.previousScan?.at).toBeInstanceOf(Date);
    expect(second.previousScan?.gateName).toBe("Test Gate A");
  });

  it("logs every attempt, failures included", async () => {
    const before = await db.scanLog.count({ where: { eventId } });
    const ticket = await makeTicket();

    await scanTicket({ token: ticket.token, eventId, gateId: gateAId, staffUserId });
    await scanTicket({ token: ticket.token, eventId, gateId: gateAId, staffUserId });

    const after = await db.scanLog.count({ where: { eventId } });
    expect(after).toBe(before + 2);

    const results = await db.scanLog.findMany({
      where: { eventId, ticketId: ticket.id },
      select: { result: true },
    });
    expect(results.map((r) => r.result).sort()).toEqual([
      "ALREADY_SCANNED",
      "VALID",
    ]);
  });
});

describe("season passes — valid every night, once per night (spec C7)", () => {
  it("admits once and refuses the second scan the same night", async () => {
    const pass = await makeTicket({ seasonPass: true });

    const outcomes = await Promise.all(
      Array.from({ length: CONTENDERS }, () =>
        scanTicket({
          token: pass.token,
          eventId,
          gateId: gateAId,
          staffUserId,
        }),
      ),
    );

    expect(outcomes.filter((o) => o.result === "VALID")).toHaveLength(1);
    expect(outcomes.filter((o) => o.result === "ALREADY_SCANNED")).toHaveLength(
      CONTENDERS - 1,
    );

    // Crucially the ticket itself is NOT burned — it has more nights to admit.
    const row = await db.ticket.findUniqueOrThrow({
      where: { id: pass.id },
      select: { status: true },
    });
    expect(row.status).toBe("ACTIVE");

    const scans = await db.sessionScan.count({
      where: { ticketId: pass.id, sessionId },
    });
    expect(scans).toBe(1);
  });
});

describe("the F1.3 check order", () => {
  it("refuses an unauthorised scanner before revealing anything about the token", async () => {
    const ticket = await makeTicket();
    const stranger = await db.user.findFirstOrThrow({
      where: { id: { not: staffUserId }, staffAssignments: { none: { eventId } } },
      select: { id: true },
    });

    const outcome = await scanTicket({
      token: ticket.token,
      eventId,
      gateId: gateAId,
      staffUserId: stranger.id,
    });

    expect(outcome.result).toBe("NOT_AUTHORIZED");
    // No ticket details leak to a device that is not on the staff list.
    expect(outcome.ticket).toBeUndefined();

    const row = await db.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      select: { status: true },
    });
    expect(row.status).toBe("ACTIVE");
  });

  it("refuses an organizer scanning at another organizer's event", async () => {
    // The concrete worry: organizer B opens the scanner and starts admitting
    // people at organizer A's gate. B is a real organizer with real staff of
    // their own, so "is this a legitimate user" is the wrong question — the
    // check has to be about *this* event.
    const other = await db.organizerProfile.findFirstOrThrow({
      where: { userId: { not: staffUserId } },
      select: { userId: true },
    });
    const ticket = await makeTicket();

    const outcome = await scanTicket({
      token: ticket.token,
      eventId,
      gateId: gateAId,
      staffUserId: other.userId,
    });

    expect(outcome.result).toBe("NOT_AUTHORIZED");
    // Not one byte about the attendee reaches the wrong organizer's screen.
    expect(outcome.ticket).toBeUndefined();
    const row = await db.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      select: { status: true },
    });
    expect(row.status).toBe("ACTIVE");
  });

  it("refuses a ticket sold by another organizer, presented at this gate", async () => {
    // The mirror image, and the one an authorisation check alone would miss:
    // the *scanner* is legitimate, and the ticket is genuine — it simply
    // belongs to somebody else's event. It must not admit, and it must not
    // burn the other event's ticket either.
    const foreign = await foreignTicket();
    const foreignToken = await signQr(
      { jti: foreign.qrTokenId, ev: foreign.eventId },
      farFuture(),
    );

    const outcome = await scanTicket({
      token: foreignToken,
      eventId,
      gateId: gateAId,
      staffUserId,
    });

    expect(outcome.result).toBe("INVALID");
    expect(outcome.message).toMatch(/different event/i);

    const row = await db.ticket.findUniqueOrThrow({
      where: { id: foreign.ticketId },
      select: { status: true, scannedAt: true },
    });
    expect(row.status).toBe("ACTIVE");
    expect(row.scannedAt).toBeNull();
  });

  it("refuses a foreign ticket even on a legacy unsigned token", async () => {
    // A signed token names its own event, so the check above short-circuits
    // before any query. A legacy bare token does not — the only thing standing
    // between it and admission is the `ticket.eventId !== input.eventId`
    // comparison after the lookup. Worth its own test, because that is the
    // line someone would delete as redundant.
    const foreign = await foreignTicket();

    const outcome = await scanTicket({
      token: foreign.qrTokenId,
      eventId,
      gateId: gateAId,
      staffUserId,
    });

    expect(outcome.result).toBe("INVALID");
    const row = await db.ticket.findUniqueOrThrow({
      where: { id: foreign.ticketId },
      select: { status: true },
    });
    expect(row.status).toBe("ACTIVE");
  });

  it("rejects a forged signature without touching the ticket", async () => {
    const ticket = await makeTicket();
    const forged = `${ticket.token.slice(0, -6)}AAAAAA`;

    const outcome = await scanTicket({
      token: forged,
      eventId,
      gateId: gateAId,
      staffUserId,
    });

    expect(outcome.result).toBe("INVALID");
    const row = await db.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      select: { status: true },
    });
    expect(row.status).toBe("ACTIVE");
  });

  it("refuses everything once the gates are closed", async () => {
    const ticket = await makeTicket();
    await db.event.update({
      where: { id: eventId },
      data: { gatesClosedAt: new Date() },
    });

    const outcome = await scanTicket({
      token: ticket.token,
      eventId,
      gateId: gateAId,
      staffUserId,
    });
    expect(outcome.result).toBe("GATES_CLOSED");

    await db.event.update({
      where: { id: eventId },
      data: { gatesClosedAt: null },
    });
  });

  it("keeps admitting a session that has run past midnight (D-012, edge case I8)", async () => {
    // A Garba night filed under yesterday's date, still running now. A
    // date-key comparison would refuse this; the instant comparison must not.
    const lateSession = await db.eventSession.create({
      data: {
        eventId,
        sequence: 2,
        startsAt: new Date(Date.now() - 5 * 3_600_000),
        endsAt: new Date(Date.now() + 3_600_000),
      },
      select: { id: true },
    });

    const ticket = await db.ticket.create({
      data: {
        id: cuidish(),
        ticketNumber: `EN-TST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        bookingId: await anyBookingId(),
        userId,
        eventId,
        tierId,
        sessionId: lateSession.id,
        attendeeName: "Late Night",
        status: "ACTIVE",
      },
      select: { id: true, qrTokenId: true },
    });
    createdTicketIds.push(ticket.id);

    const outcome = await scanTicket({
      token: await signQr({ jti: ticket.qrTokenId, ev: eventId }, farFuture()),
      eventId,
      gateId: gateAId,
      staffUserId,
    });

    expect(outcome.result).toBe("VALID");
  });
});
