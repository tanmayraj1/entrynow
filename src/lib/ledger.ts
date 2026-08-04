import "server-only";

import {
  ledgerBalances,
  type LedgerRow,
} from "@/lib/money";
import { cuidish, type Tx } from "@/lib/booking/inventory";

/**
 * Ledger persistence.
 *
 * Invariant I3 — the entries for one booking sum to exactly zero — stops being
 * a property we test and becomes a property we *enforce*: `writeLedger` checks
 * the sum before inserting and throws if it is non-zero, inside the caller's
 * transaction, so an unbalanced booking rolls back rather than being written
 * and discovered at settlement time.
 *
 * Integer paise is what makes the check exact. With floating-point rupees the
 * sum would be 1.4210854715202004e-14 rather than 0 and this assertion could
 * never be written (D-011).
 */
export class LedgerImbalanceError extends Error {
  constructor(
    readonly bookingId: string,
    readonly sumPaise: number,
    readonly rows: LedgerRow[],
  ) {
    super(
      `Ledger for booking ${bookingId} sums to ${sumPaise} paise, not 0 ` +
        `(invariant I3). Rows: ${rows
          .map((r) => `${r.type}/${r.account}=${r.amountPaise}`)
          .join(", ")}`,
    );
    this.name = "LedgerImbalanceError";
  }
}

export async function writeLedger(
  tx: Tx,
  args: {
    bookingId: string;
    organizerId: string;
    rows: LedgerRow[];
  },
): Promise<void> {
  const { bookingId, organizerId, rows } = args;
  if (rows.length === 0) return;

  if (!ledgerBalances(rows)) {
    const sum = rows.reduce((s, r) => s + r.amountPaise, 0);
    throw new LedgerImbalanceError(bookingId, sum, rows);
  }

  await tx.ledgerEntry.createMany({
    data: rows.map((r) => ({
      id: cuidish(),
      bookingId,
      // Only the organizer's own legs belong to them. Attributing the platform
      // or external legs to the organizer would inflate what the payout run
      // believes it owes.
      organizerId: r.account === "ORGANIZER" ? organizerId : null,
      type: r.type,
      account: r.account,
      amountPaise: r.amountPaise,
      commissionPctUsed: r.commissionPctUsed ?? null,
      memo: r.memo ?? null,
    })),
  });
}

/**
 * Ledger rows that belong to no booking: `ONBOARDING_FEE` when an organizer
 * buys a plan, and `PAYOUT` when the platform settles.
 *
 * These need their own entry point because `writeLedger`'s zero-sum assertion
 * is *per booking* — that is invariant I3, and loosening its `bookingId` to
 * make these fit would delete the check for every real booking. The sum still
 * has to be zero here, it is just a different scope: a payout debits the
 * organizer and credits external by the same amount.
 *
 * `organizerId` is applied to the ORGANIZER legs only, exactly as in
 * `writeLedger` — the payout run reads `organizerId + payoutId: null` to decide
 * what it owes, so attributing an EXTERNAL leg to the organizer would make the
 * platform pay the same money twice.
 */
export async function writePlatformLedger(
  tx: Tx,
  args: {
    organizerId: string;
    rows: LedgerRow[];
    /** Set on every row when the entries are being written as part of a
     *  settlement, so they are born already-settled rather than being swept a
     *  second time by the next run. */
    payoutId?: string;
    /** Names the scope in the error, since there is no booking to name. */
    scope: string;
  },
): Promise<void> {
  const { organizerId, rows, payoutId, scope } = args;
  if (rows.length === 0) return;

  if (!ledgerBalances(rows)) {
    const sum = rows.reduce((s, r) => s + r.amountPaise, 0);
    throw new LedgerImbalanceError(scope, sum, rows);
  }

  await tx.ledgerEntry.createMany({
    data: rows.map((r) => ({
      id: cuidish(),
      bookingId: null,
      organizerId: r.account === "ORGANIZER" ? organizerId : null,
      type: r.type,
      account: r.account,
      amountPaise: r.amountPaise,
      commissionPctUsed: r.commissionPctUsed ?? null,
      memo: r.memo ?? null,
      payoutId: payoutId ?? null,
    })),
  });
}

/**
 * Re-check I3 against what is actually stored, not against what we intended to
 * store. Used by tests and, from iteration 8, by the payout run before it
 * settles anything.
 */
export async function assertBookingLedgerBalances(
  tx: Tx,
  bookingId: string,
): Promise<number> {
  const rows = await tx.ledgerEntry.findMany({
    where: { bookingId },
    select: { amountPaise: true },
  });
  return rows.reduce((s, r) => s + r.amountPaise, 0);
}
