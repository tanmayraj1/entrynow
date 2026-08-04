import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createBooking, expireBooking, releaseExpiredHolds } from "@/lib/booking/create";
import { captureBooking } from "@/lib/booking/capture";
import { releaseSeats } from "@/lib/booking/inventory";

/**
 * Invariant I1 — `quantitySold + quantityHeld <= quantityTotal`, under any
 * concurrency — against a real Postgres.
 *
 * These are not unit tests. The thing being tested IS the database's
 * behaviour: whether a guarded `UPDATE … WHERE remaining >= n` actually
 * serialises N simultaneous buyers down to the number of seats that exist. A
 * mock cannot answer that question, and the answer is the difference between
 * a marketplace and a lawsuit.
 *
 * Fixtures are created per run against a seeded event and torn down after, so
 * repeated runs neither accumulate rows nor depend on the last run's leftovers.
 */

const CAPACITY = 5;
const CONTENDERS = 12;

let eventId: string;
let eventSlug: string;
let tierId: string;
let userId: string;

beforeAll(async () => {
  const event = await db.event.findFirst({
    where: { status: "LIVE" },
    select: { id: true, slug: true },
  });
  if (!event) throw new Error("No LIVE event seeded — run `npm run db:seed`.");
  eventId = event.id;
  eventSlug = event.slug;

  const tier = await db.ticketTier.create({
    data: {
      eventId,
      name: `__test_hold_${Date.now()}`,
      pricePaise: 10_000,
      quantityTotal: CAPACITY,
      // High enough that the per-user cap never masks a genuine I1 failure.
      perUserLimit: 99,
      isActive: true,
    },
  });
  tierId = tier.id;

  const user = await db.user.findFirst({ select: { id: true } });
  if (!user) throw new Error("No user seeded — run `npm run db:seed`.");
  userId = user.id;
});

afterAll(async () => {
  // Children first — bookings reference the tier.
  const bookings = await db.booking.findMany({
    where: { items: { some: { tierId } } },
    select: { id: true },
  });
  const ids = bookings.map((b) => b.id);
  if (ids.length) {
    await db.ledgerEntry.deleteMany({ where: { bookingId: { in: ids } } });
    await db.walletTxn.deleteMany({ where: { bookingId: { in: ids } } });
    await db.promoRedemption.deleteMany({ where: { bookingId: { in: ids } } });
    await db.ticket.deleteMany({ where: { bookingId: { in: ids } } });
    await db.payment.deleteMany({ where: { bookingId: { in: ids } } });
    await db.attendee.deleteMany({ where: { bookingId: { in: ids } } });
    await db.bookingItem.deleteMany({ where: { bookingId: { in: ids } } });
    await db.booking.deleteMany({ where: { id: { in: ids } } });
  }
  await db.ticketTier.deleteMany({ where: { id: tierId } });
  await db.webhookEvent.deleteMany({
    where: { gatewayEventId: { startsWith: "evt_test_" } },
  });
  await db.$disconnect();
});

async function tier() {
  const t = await db.ticketTier.findUniqueOrThrow({ where: { id: tierId } });
  return t;
}

describe("I1 — inventory holds under concurrency", () => {
  it("admits exactly the number of seats that exist, no matter how many buyers race", async () => {
    // Edge case 1: N users, one seat left each, all at once.
    const results = await Promise.all(
      Array.from({ length: CONTENDERS }, () =>
        createBooking({
          userId,
          eventSlug,
          lines: [{ tierId, quantity: 1 }],
        }),
      ),
    );

    const won = results.filter((r) => r.ok);
    const lost = results.filter((r) => !r.ok);

    expect(won).toHaveLength(CAPACITY);
    expect(lost).toHaveLength(CONTENDERS - CAPACITY);
    // Every loser gets a real reason and the per-tier availability, not a 500.
    for (const l of lost) {
      if (l.ok) continue;
      expect(l.code).toBe("SOLD_OUT");
      expect(l.availability?.some((a) => a.tierId === tierId)).toBe(true);
    }

    const t = await tier();
    expect(t.quantityHeld).toBe(CAPACITY);
    expect(t.quantitySold).toBe(0);
    // The invariant itself.
    expect(t.quantitySold + t.quantityHeld).toBeLessThanOrEqual(t.quantityTotal);
  });

  it("gives every seat back when the holds expire", async () => {
    // Push every live hold into the past, then sweep.
    await db.booking.updateMany({
      where: { status: "PENDING_PAYMENT", items: { some: { tierId } } },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const released = await releaseExpiredHolds(eventId);
    expect(released).toBeGreaterThanOrEqual(CAPACITY);

    const t = await tier();
    expect(t.quantityHeld).toBe(0);
    expect(t.quantitySold).toBe(0);
  });

  it("never lets a double release drive held below zero", async () => {
    const created = await createBooking({
      userId,
      eventSlug,
      lines: [{ tierId, quantity: 2 }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect((await tier()).quantityHeld).toBe(2);

    // First expiry wins and releases.
    expect(await expireBooking(created.bookingId)).toBe(true);
    // Second finds the status guard already flipped and must NOT touch stock.
    expect(await expireBooking(created.bookingId)).toBe(false);

    expect((await tier()).quantityHeld).toBe(0);

    // And even a raw double release clamps rather than going negative — a
    // negative held count would silently inflate availability and oversell.
    await db.$transaction(async (tx) => {
      await releaseSeats(tx, tierId, 5);
    });
    expect((await tier()).quantityHeld).toBe(0);
  });

  it("holds and releases are all-or-nothing across tiers", async () => {
    // One tier can satisfy the request, the other cannot. Nothing may be held.
    const second = await db.ticketTier.create({
      data: {
        eventId,
        name: `__test_hold2_${Date.now()}`,
        pricePaise: 5_000,
        quantityTotal: 1,
        perUserLimit: 99,
      },
    });

    const result = await createBooking({
      userId,
      eventSlug,
      lines: [
        { tierId, quantity: 1 },
        { tierId: second.id, quantity: 4 },
      ],
    });

    expect(result.ok).toBe(false);
    // The first tier's hold must have rolled back with the transaction.
    expect((await tier()).quantityHeld).toBe(0);
    const s = await db.ticketTier.findUniqueOrThrow({ where: { id: second.id } });
    expect(s.quantityHeld).toBe(0);

    await db.ticketTier.delete({ where: { id: second.id } });
  });
});

describe("capture — idempotency and the ledger (I3)", () => {
  it("survives a replayed webhook: one set of tickets, one balanced ledger", async () => {
    const created = await createBooking({
      userId,
      eventSlug,
      lines: [{ tierId, quantity: 2 }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const gatewayEventId = `evt_test_${created.bookingId}`;
    const input = {
      gatewayEventId,
      eventType: "payment.captured",
      payload: { test: true },
      bookingId: created.bookingId,
      gatewayOrderId: `order_test_${created.bookingId}`,
      gatewayPaymentId: `pay_test_${created.bookingId}`,
      amountPaise: 20_000,
    };

    const first = await captureBooking(input);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.replayed).toBe(false);
      expect(first.ticketCount).toBe(2);
    }

    // Edge case 3: the gateway delivers the same event again.
    const replay = await captureBooking(input);
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.replayed).toBe(true);

    // Exactly two tickets, not four.
    const tickets = await db.ticket.count({
      where: { bookingId: created.bookingId },
    });
    expect(tickets).toBe(2);

    // Held converted to sold — the total never moved.
    const t = await tier();
    expect(t.quantitySold).toBe(2);
    expect(t.quantityHeld).toBe(0);
    expect(t.quantitySold + t.quantityHeld).toBeLessThanOrEqual(t.quantityTotal);

    // Invariant I3, checked against what is actually stored.
    const rows = await db.ledgerEntry.findMany({
      where: { bookingId: created.bookingId },
      select: { amountPaise: true },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.reduce((s, r) => s + r.amountPaise, 0)).toBe(0);

    // Ticket numbers are unique and correctly formatted.
    const issued = await db.ticket.findMany({
      where: { bookingId: created.bookingId },
      select: { ticketNumber: true },
    });
    const numbers = issued.map((t) => t.ticketNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const n of numbers) expect(n).toMatch(/^EN-[A-Z0-9]+-\d{4}$/);
  });

  it("mints no duplicate ticket numbers when two captures race on one event", async () => {
    const a = await createBooking({
      userId,
      eventSlug,
      lines: [{ tierId, quantity: 1 }],
    });
    const b = await createBooking({
      userId,
      eventSlug,
      lines: [{ tierId, quantity: 1 }],
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    await Promise.all(
      [a, b].map((r) =>
        captureBooking({
          gatewayEventId: `evt_test_race_${r.bookingId}`,
          eventType: "payment.captured",
          payload: {},
          bookingId: r.bookingId,
          gatewayOrderId: `order_test_${r.bookingId}`,
          gatewayPaymentId: `pay_test_${r.bookingId}`,
          amountPaise: 10_000,
        }),
      ),
    );

    const numbers = await db.ticket.findMany({
      where: { bookingId: { in: [a.bookingId, b.bookingId] } },
      select: { ticketNumber: true },
    });
    expect(numbers).toHaveLength(2);
    expect(new Set(numbers.map((n) => n.ticketNumber)).size).toBe(2);
  });
});
