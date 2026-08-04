import { describe, expect, it } from "vitest";
import {
  allowedTransitions,
  assertTransition,
  canHardDeleteEvent,
  canTransition,
  IllegalTransitionError,
} from "./state-machines";

/**
 * These tests assert the ILLEGAL edges as hard as the legal ones.
 *
 * A state machine that only ever gets tested along its happy path is not a
 * constraint, it is documentation. The rules worth money here are the ones
 * that say "no": a cancelled event cannot be un-cancelled, a paid payout
 * cannot be re-paid, a LIVE event cannot skip back to DRAFT.
 */

describe("event state machine (spec B1)", () => {
  it("walks the happy path", () => {
    expect(canTransition("event", "DRAFT", "IN_REVIEW")).toBe(true);
    expect(canTransition("event", "IN_REVIEW", "LIVE")).toBe(true);
    expect(canTransition("event", "LIVE", "COMPLETED")).toBe(true);
  });

  it("lets a LIVE event go back to IN_REVIEW for a pendingChanges re-review", () => {
    // The event stays bookable at its old values throughout (B1.editReview);
    // this edge is what makes that possible.
    expect(canTransition("event", "LIVE", "IN_REVIEW")).toBe(true);
  });

  it("treats CANCELLED and COMPLETED as terminal", () => {
    expect(allowedTransitions("event", "CANCELLED")).toEqual([]);
    expect(allowedTransitions("event", "COMPLETED")).toEqual([]);
    // The specific one that would refund money twice.
    expect(canTransition("event", "CANCELLED", "LIVE")).toBe(false);
  });

  it("refuses to skip review", () => {
    expect(canTransition("event", "DRAFT", "LIVE")).toBe(false);
    expect(canTransition("event", "REJECTED", "LIVE")).toBe(false);
  });

  it("refuses to walk a published event back to DRAFT", () => {
    expect(canTransition("event", "LIVE", "DRAFT")).toBe(false);
    expect(canTransition("event", "PAUSED", "DRAFT")).toBe(false);
  });

  it("throws rather than returning false, so a transaction rolls back", () => {
    // Returning a value from a Prisma interactive transaction commits it
    // (D-023), so a soft failure here would persist the half-state.
    expect(() => assertTransition("event", "CANCELLED", "LIVE")).toThrow(
      IllegalTransitionError,
    );
    expect(() => assertTransition("event", "DRAFT", "IN_REVIEW")).not.toThrow();
  });

  it("names the legal moves in the error, including terminal states", () => {
    try {
      assertTransition("event", "COMPLETED", "LIVE");
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toContain("terminal state");
    }
  });
});

describe("organizer state machine (spec B5)", () => {
  it("runs the onboarding gates in order and cannot skip one", () => {
    expect(canTransition("organizer", "SIGNUP", "DETAILS_SUBMITTED")).toBe(true);
    expect(canTransition("organizer", "DETAILS_SUBMITTED", "FEE_PAID")).toBe(true);
    expect(canTransition("organizer", "FEE_PAID", "KYC_IN_REVIEW")).toBe(true);
    expect(canTransition("organizer", "KYC_IN_REVIEW", "VERIFIED")).toBe(true);

    // E1.gates: the gates cannot be skipped.
    expect(canTransition("organizer", "SIGNUP", "VERIFIED")).toBe(false);
    expect(canTransition("organizer", "DETAILS_SUBMITTED", "KYC_IN_REVIEW")).toBe(false);
  });

  it("allows KYC rejection to be corrected and resubmitted", () => {
    expect(canTransition("organizer", "KYC_IN_REVIEW", "KYC_REJECTED")).toBe(true);
    expect(canTransition("organizer", "KYC_REJECTED", "KYC_IN_REVIEW")).toBe(true);
    // But not straight to verified without another review.
    expect(canTransition("organizer", "KYC_REJECTED", "VERIFIED")).toBe(false);
  });

  it("makes suspension reversible, unlike an event cancellation", () => {
    expect(canTransition("organizer", "VERIFIED", "SUSPENDED")).toBe(true);
    expect(canTransition("organizer", "SUSPENDED", "VERIFIED")).toBe(true);
  });

  it("does not let an unverified organizer be suspended", () => {
    // There is nothing to suspend — they were never able to sell.
    expect(canTransition("organizer", "SIGNUP", "SUSPENDED")).toBe(false);
  });
});

describe("payout state machine (spec B6)", () => {
  it("can freeze from every non-terminal state", () => {
    for (const from of ["ACCRUING", "SCHEDULED", "PROCESSING", "FAILED"] as const) {
      expect(canTransition("payout", from, "FROZEN")).toBe(true);
    }
  });

  it("cannot freeze or re-pay a PAID payout", () => {
    expect(allowedTransitions("payout", "PAID")).toEqual([]);
    expect(canTransition("payout", "PAID", "FROZEN")).toBe(false);
    expect(canTransition("payout", "PAID", "PROCESSING")).toBe(false);
  });

  it("retries a failure instead of abandoning it", () => {
    expect(canTransition("payout", "FAILED", "SCHEDULED")).toBe(true);
  });

  it("unfreezes back to any prior state, since statusBeforeFreeze decides", () => {
    expect(canTransition("payout", "FROZEN", "SCHEDULED")).toBe(true);
    expect(canTransition("payout", "FROZEN", "PROCESSING")).toBe(true);
    // But never straight to PAID — that would skip the actual transfer.
    expect(canTransition("payout", "FROZEN", "PAID")).toBe(false);
  });
});

describe("dispute state machine (spec G1)", () => {
  it("cannot refund straight from OPEN without investigating", () => {
    expect(canTransition("dispute", "OPEN", "RESOLVED_REFUND")).toBe(false);
    expect(canTransition("dispute", "OPEN", "INVESTIGATING")).toBe(true);
    // Rejecting outright is allowed — an obviously invalid claim.
    expect(canTransition("dispute", "OPEN", "RESOLVED_REJECT")).toBe(true);
  });

  it("treats every resolution as terminal", () => {
    for (const s of ["RESOLVED_REFUND", "RESOLVED_REJECT", "RESOLVED_PARTIAL"] as const) {
      expect(allowedTransitions("dispute", s)).toEqual([]);
    }
  });
});

describe("hard-delete policy", () => {
  it("permits deleting only a DRAFT that never went live", () => {
    expect(canHardDeleteEvent({ status: "DRAFT", publishedAt: null })).toBe(true);
  });

  it("refuses anything that was ever published", () => {
    // Its tickets, payments and ledger rows are the record of what was owed.
    expect(
      canHardDeleteEvent({ status: "DRAFT", publishedAt: new Date() }),
    ).toBe(false);
    for (const status of ["LIVE", "PAUSED", "COMPLETED", "CANCELLED", "IN_REVIEW"] as const) {
      expect(canHardDeleteEvent({ status, publishedAt: null })).toBe(false);
    }
  });
});
