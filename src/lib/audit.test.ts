import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma";
import { pick, writeAudit } from "./audit";
import type { Tx } from "./booking/inventory";

/**
 * Serialisation is tested here rather than through the database because the
 * failure it guards against is silent.
 *
 * `Prisma.Decimal` does not throw on `JSON.stringify` — it produces its
 * internal `{s,e,d}` form. An audit row written that way looks fine, inserts
 * fine, and is only discovered to be garbage when somebody finally reads it
 * during an investigation, which is the worst possible moment.
 */

/** A `Tx` stand-in that records what `writeAudit` tried to insert. */
function captureTx() {
  const created: { data: Record<string, unknown> }[] = [];
  const tx = {
    auditLog: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        created.push(args);
        return args.data;
      }),
    },
  } as unknown as Tx;
  return { tx, created };
}

const BASE = {
  actorId: "user_1",
  actorType: "ADMIN" as const,
  action: "organizer.kyc_approve" as const,
  entityType: "OrganizerProfile" as const,
  entityId: "org_1",
};

describe("writeAudit serialisation", () => {
  it("converts Decimal to a number instead of its internal form", async () => {
    const { tx, created } = captureTx();
    await writeAudit(tx, {
      ...BASE,
      after: { commissionPctUsed: new Prisma.Decimal("6.00") },
    });

    const after = created[0].data.after as Record<string, unknown>;
    expect(after.commissionPctUsed).toBe(6);
    // The silent-corruption shape.
    expect(JSON.stringify(after)).not.toContain('"d":');
  });

  it("converts BigInt, which would otherwise throw", async () => {
    const { tx, created } = captureTx();
    await expect(
      writeAudit(tx, {
        ...BASE,
        action: "payout.mark_paid",
        entityType: "Payout",
        after: { amountPaise: BigInt(1_234_567) },
      }),
    ).resolves.not.toThrow();

    const after = created[0].data.after as Record<string, unknown>;
    expect(after.amountPaise).toBe(1_234_567);
  });

  it("redacts KYC and banking fields", async () => {
    const { tx, created } = captureTx();
    await writeAudit(tx, {
      ...BASE,
      before: { bankAccountNumber: "50100123456789", panNumber: "ABCDE1234F" },
      after: { bankAccountNumber: "50100999999999", panNumber: "ABCDE1234F" },
    });

    const serialised = JSON.stringify(created[0].data);
    expect(serialised).not.toContain("50100123456789");
    expect(serialised).not.toContain("ABCDE1234F");
    expect(serialised).toContain("[redacted]");
  });

  it("writes SQL NULL, not a JSON null, when there is no before state", async () => {
    const { tx, created } = captureTx();
    await writeAudit(tx, { ...BASE, action: "event.create", entityType: "Event" });
    // DbNull means "no prior state"; JsonNull would mean "the prior state was
    // literally null" — different facts in an audit trail.
    expect(created[0].data.before).toBe(Prisma.DbNull);
    expect(created[0].data.after).toBe(Prisma.DbNull);
  });

  it("survives nested and array values", async () => {
    const { tx, created } = captureTx();
    await writeAudit(tx, {
      ...BASE,
      entityType: "Event",
      action: "event.update",
      after: {
        tiers: [{ pricePaise: 49900, ratingAvg: new Prisma.Decimal("4.80") }],
      },
    });
    const after = created[0].data.after as { tiers: { ratingAvg: number }[] };
    expect(after.tiers[0].ratingAvg).toBe(4.8);
  });
});

describe("pick", () => {
  it("narrows to the named fields only", () => {
    const row = { id: "e1", title: "Garba", pricePaise: 499_00, secret: "x" };
    expect(pick(row, ["id", "title"])).toEqual({ id: "e1", title: "Garba" });
  });

  it("passes null through, so a create records no before state", () => {
    // The generic is named explicitly: inference cannot recover T from a
    // `{...} | null` argument, so `keys` would widen to `never[]`.
    const missing: { id: string } | null = null;
    expect(pick<{ id: string }, "id">(missing, ["id"])).toBeNull();
  });
});
