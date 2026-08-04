import { describe, expect, it } from "vitest";
import {
  DEFAULT_MONEY_CONFIG,
  accountBalance,
  bookingFee,
  buildCaptureLedger,
  buildRefundLedger,
  computeOrderTotals,
  inr,
  ledgerBalances,
  toPaise,
} from "./money";

const cfg = DEFAULT_MONEY_CONFIG;

describe("inr — Indian digit grouping", () => {
  it("groups in lakhs, not thousands", () => {
    expect(inr(toPaise(100000))).toBe("₹1,00,000");
    expect(inr(toPaise(499))).toBe("₹499");
  });

  it("shows paise only when the amount is fractional", () => {
    expect(inr(94130)).toBe("₹941.30");
    expect(inr(toPaise(998))).toBe("₹998");
    expect(inr(toPaise(998), { forceDecimals: true })).toBe("₹998.00");
  });
});

describe("bookingFee — spec A3", () => {
  it("is 3.5% of the PRE-discount subtotal (D1 is decisive)", () => {
    // ₹1000 subtotal with a ₹100 promo still yields ₹35, not ₹31.50.
    expect(bookingFee(toPaise(1000), cfg)).toBe(toPaise(35));
  });

  it("clamps to the ₹15 floor", () => {
    expect(bookingFee(toPaise(100), cfg)).toBe(toPaise(15));
  });

  it("clamps to the ₹99 ceiling", () => {
    expect(bookingFee(toPaise(50000), cfg)).toBe(toPaise(99));
  });
});

describe("spec D1 — the worked ledger example", () => {
  // 2 × ₹500 Garba tickets, promo −₹100, commission 8%.
  const totals = computeOrderTotals({
    lines: [{ tierId: "t1", unitPricePaise: toPaise(500), quantity: 2 }],
    discountPaise: toPaise(100),
    config: cfg,
  });

  it("computes the user-facing total as ₹941.30", () => {
    expect(totals.subtotalPaise).toBe(toPaise(1000));
    expect(totals.discountPaise).toBe(toPaise(100));
    expect(totals.bookingFeePaise).toBe(toPaise(35));
    expect(totals.gstOnFeePaise).toBe(630); // 18% of ₹35 = ₹6.30
    expect(totals.totalPaise).toBe(94130);
    expect(inr(totals.totalPaise)).toBe("₹941.30");
  });

  const rows = buildCaptureLedger({ totals, commissionPct: 8, config: cfg });

  it("accrues ₹815.04 to the organizer", () => {
    expect(accountBalance(rows, "ORGANIZER")).toBe(81504);
    expect(inr(accountBalance(rows, "ORGANIZER"))).toBe("₹815.04");
  });

  it("accrues ₹126.26 to the platform", () => {
    expect(accountBalance(rows, "PLATFORM")).toBe(12626);
    expect(inr(accountBalance(rows, "PLATFORM"))).toBe("₹126.26");
  });

  it("balances to zero — invariant I3", () => {
    // Only holds because we add the PAYMENT_IN leg the spec's D1 table omits.
    expect(ledgerBalances(rows)).toBe(true);
  });

  it("records the commission pct used, so later rate changes cannot rewrite it", () => {
    const commission = rows.find((r) => r.type === "COMMISSION");
    expect(commission?.commissionPctUsed).toBe(8);
  });

  describe("full organizer-fault refund", () => {
    const refund = buildRefundLedger({
      captureRows: rows,
      fraction: 1,
      refundBookingFee: true,
    });

    it("mirror-reverses every row and returns the booking fee", () => {
      expect(ledgerBalances([...rows, ...refund])).toBe(true);
      expect(accountBalance([...rows, ...refund], "ORGANIZER")).toBe(0);
      expect(accountBalance([...rows, ...refund], "PLATFORM")).toBe(0);
    });
  });

  describe("50% user-initiated refund", () => {
    const refund = buildRefundLedger({
      captureRows: rows,
      fraction: 0.5,
      refundBookingFee: false,
    });

    it("reverses half the sale rows and keeps the booking fee", () => {
      const combined = [...rows, ...refund];
      expect(ledgerBalances(combined)).toBe(true);
      expect(accountBalance(combined, "ORGANIZER")).toBe(81504 / 2);
      // Platform keeps the full ₹35 fee + ₹6.30 GST, loses half the commission.
      expect(accountBalance(combined, "PLATFORM")).toBe(
        toPaise(35) + 630 + (7200 + 1296) / 2,
      );
    });
  });
});

describe("wallet", () => {
  it("a 100%-wallet order leaves nothing payable at the gateway", () => {
    const totals = computeOrderTotals({
      lines: [{ tierId: "t1", unitPricePaise: toPaise(500), quantity: 1 }],
      walletBalancePaise: toPaise(2000),
      useWallet: true,
      config: cfg,
    });
    expect(totals.gatewayPayablePaise).toBe(0);
    expect(totals.walletAppliedPaise).toBe(totals.totalPaise);

    const rows = buildCaptureLedger({ totals, commissionPct: 8, config: cfg });
    expect(rows.some((r) => r.type === "PAYMENT_IN")).toBe(false);
    expect(rows.some((r) => r.type === "WALLET_REDEEM")).toBe(true);
    expect(ledgerBalances(rows)).toBe(true);
  });

  it("a partial wallet order still balances", () => {
    const totals = computeOrderTotals({
      lines: [{ tierId: "t1", unitPricePaise: toPaise(2500), quantity: 2 }],
      walletBalancePaise: toPaise(300),
      useWallet: true,
      config: cfg,
    });
    expect(totals.walletAppliedPaise).toBe(toPaise(300));
    expect(totals.gatewayPayablePaise).toBe(totals.totalPaise - toPaise(300));
    expect(
      ledgerBalances(buildCaptureLedger({ totals, commissionPct: 8, config: cfg })),
    ).toBe(true);
  });
});

describe("invariant guards", () => {
  it("a discount can never exceed the subtotal", () => {
    const totals = computeOrderTotals({
      lines: [{ tierId: "t1", unitPricePaise: toPaise(200), quantity: 1 }],
      discountPaise: toPaise(500),
      config: cfg,
    });
    expect(totals.discountPaise).toBe(toPaise(200));
    expect(totals.totalPaise).toBeGreaterThan(0);
  });

  it("balances at a 6% Pro-plan commission override", () => {
    const totals = computeOrderTotals({
      lines: [{ tierId: "t1", unitPricePaise: toPaise(1499), quantity: 3 }],
      config: cfg,
    });
    const rows = buildCaptureLedger({ totals, commissionPct: 6, config: cfg });
    expect(ledgerBalances(rows)).toBe(true);
    expect(rows.find((r) => r.type === "COMMISSION")?.commissionPctUsed).toBe(6);
  });
});
