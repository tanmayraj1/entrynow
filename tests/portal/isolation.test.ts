import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  bookingsOf,
  organizerScope,
  unsettledLedgerOf,
  updateOwnedEvent,
  updateOwnedTier,
  NotOwnedError,
} from "@/lib/queries/organizer/scope";
import { listOrganizerEvents, getOrganizerEvent } from "@/lib/queries/organizer/events";
import { getOrganizerOverview } from "@/lib/queries/organizer/dashboard";
import { setTierCapacity } from "@/lib/booking/inventory";

/**
 * Tenant isolation, as behaviour rather than as a code-review promise.
 *
 * Audit check A12 proves the *shape* is right — that every query in the scoped
 * directory names an organizer. These prove the shape actually works: given
 * two organizers with real rows, B's queries return nothing of A's and B's
 * writes match nothing of A's.
 *
 * `organizerScope` is called directly here, which A12 forbids anywhere in
 * `src/` outside `rbac.ts`. That is fine — A12 scans `src/`, and this is
 * `tests/`. A test that cannot construct the branded type cannot test the
 * thing the brand protects.
 */

let orgA: string;
let orgB: string;
let eventOfA: string;
let tierOfA: string;

beforeAll(async () => {
  const organizers = await db.organizerProfile.findMany({
    take: 2,
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (organizers.length < 2) {
    throw new Error(
      "Isolation tests need two organizers — run `npm run db:seed`.",
    );
  }
  orgA = organizers[0].id;
  orgB = organizers[1].id;

  const event = await db.event.findFirst({
    where: { organizerId: orgA },
    select: { id: true, tiers: { select: { id: true }, take: 1 } },
  });
  if (!event) throw new Error("Organizer A has no events — run `npm run db:seed`.");
  eventOfA = event.id;
  tierOfA = event.tiers[0]?.id ?? "";
});

afterAll(async () => {
  await db.$disconnect();
});

describe("organizer isolation", () => {
  it("does not list another organizer's events", async () => {
    const a = await listOrganizerEvents(organizerScope(orgA), { perPage: 200 });
    const b = await listOrganizerEvents(organizerScope(orgB), { perPage: 200 });

    const idsB = new Set(b.rows.map((r) => r.id));
    expect(a.rows.length).toBeGreaterThan(0);
    // The real assertion: not merely "different lists" but *disjoint* ones.
    for (const row of a.rows) expect(idsB.has(row.id)).toBe(false);
  });

  it("returns null for another organizer's event by id", async () => {
    // The id is correct and exists. Only the scope is wrong — which is exactly
    // the attack an IDOR check has to survive.
    expect(await getOrganizerEvent(organizerScope(orgB), eventOfA)).toBeNull();
    expect(await getOrganizerEvent(organizerScope(orgA), eventOfA)).not.toBeNull();
  });

  it("refuses a write to another organizer's event", async () => {
    await expect(
      db.$transaction((tx) =>
        updateOwnedEvent(tx, organizerScope(orgB), eventOfA, {
          summary: "hijacked",
        }),
      ),
    ).rejects.toBeInstanceOf(NotOwnedError);

    // And nothing changed — the rejection is not merely reported, it rolls back.
    const after = await db.event.findUniqueOrThrow({
      where: { id: eventOfA },
      select: { summary: true },
    });
    expect(after.summary).not.toBe("hijacked");
  });

  it("refuses a write to a tier hanging off another organizer's event", async () => {
    if (!tierOfA) return;
    await expect(
      db.$transaction((tx) =>
        updateOwnedTier(tx, organizerScope(orgB), tierOfA, { name: "hijacked" }),
      ),
    ).rejects.toBeInstanceOf(NotOwnedError);
  });

  it("scopes bookings and the ledger by organizer", async () => {
    const bookingsA = await db.booking.count({
      where: bookingsOf(organizerScope(orgA)),
    });
    // `AND`, not a spread.
    //
    // This was written as `{ ...bookingsOf(orgB), event: { organizerId: orgA } }`
    // — and both halves set the same `event` key, so the literal silently
    // overwrote the spread and the query reduced to "bookings belonging to A".
    // It asserted that count was zero, which happened to be true only because
    // the first-created organizer had no bookings in the seed. The moment one
    // arrived the test failed, having never once checked what it claimed to.
    //
    // Under `AND` the two conditions cannot collapse into each other.
    const crossed = await db.booking.count({
      where: {
        AND: [bookingsOf(organizerScope(orgB)), { event: { organizerId: orgA } }],
      },
    });
    expect(bookingsA).toBeGreaterThanOrEqual(0);
    // No booking can belong to both organizers at once.
    expect(crossed).toBe(0);

    const ledgerA = await db.ledgerEntry.findMany({
      where: unsettledLedgerOf(organizerScope(orgA)),
      select: { organizerId: true },
      take: 50,
    });
    for (const row of ledgerA) expect(row.organizerId).toBe(orgA);
  });

  it("gives each organizer their own dashboard totals", async () => {
    const [a, b] = await Promise.all([
      getOrganizerOverview(organizerScope(orgA)),
      getOrganizerOverview(organizerScope(orgB)),
    ]);
    const total = await db.event.count();
    // Neither organizer can see the whole platform.
    expect(a.totalEvents).toBeLessThan(total);
    expect(b.totalEvents).toBeLessThan(total);
  });
});

describe("inventory guards (invariant I1)", () => {
  it("refuses a capacity below what is already sold or held", async () => {
    const tier = await db.ticketTier.create({
      data: {
        eventId: eventOfA,
        name: `__test_cap_${Date.now()}`,
        pricePaise: 10_000,
        quantityTotal: 10,
      },
      select: { id: true },
    });

    try {
      // Simulate five committed seats through the guarded path.
      await db.$executeRaw`
        UPDATE ticket_tiers SET "quantitySold" = 5 WHERE id = ${tier.id}
      `;

      const tooLow = await db.$transaction((tx) =>
        setTierCapacity(tx, tier.id, 4),
      );
      expect(tooLow).toBe(false);

      const exact = await db.$transaction((tx) =>
        setTierCapacity(tx, tier.id, 5),
      );
      expect(exact).toBe(true);

      const raised = await db.$transaction((tx) =>
        setTierCapacity(tx, tier.id, 50),
      );
      expect(raised).toBe(true);

      const row = await db.ticketTier.findUniqueOrThrow({
        where: { id: tier.id },
        select: { quantityTotal: true, quantitySold: true, quantityHeld: true },
      });
      expect(row.quantitySold + row.quantityHeld).toBeLessThanOrEqual(
        row.quantityTotal,
      );
    } finally {
      await db.ticketTier.deleteMany({ where: { id: tier.id } });
    }
  });
});
