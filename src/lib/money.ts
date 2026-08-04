/**
 * Money. Every amount in this system is an integer number of **paise**.
 *
 * Rationale: invariant I3 requires `sum(LedgerEntries per booking) = 0` exactly.
 * Floating-point rupees cannot guarantee that — 0.1 + 0.2 !== 0.3 — so rupees
 * exist only at the formatting boundary (`inr`) and at parse time (`toPaise`).
 *
 * Invariant I4: the client never supplies a price. Every function here takes
 * server-loaded tier prices and server-loaded config.
 */

export const PAISE_PER_RUPEE = 100;

/** Round half away from zero. JS `Math.round` rounds -0.5 to -0, which would
 *  silently break the sign symmetry that refund reversals depend on. */
export function roundPaise(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function toPaise(rupees: number): number {
  return roundPaise(rupees * PAISE_PER_RUPEE);
}

export function toRupees(paise: number): number {
  return paise / PAISE_PER_RUPEE;
}

/**
 * Format for display with Indian digit grouping — ₹1,00,000 not ₹100,000.
 * Whole rupees render without decimals (the design shows "₹499", "₹998");
 * fractional amounts render both paise digits ("₹941.30").
 */
export function inr(paise: number, opts?: { forceDecimals?: boolean }): string {
  const showDecimals = opts?.forceDecimals || paise % PAISE_PER_RUPEE !== 0;
  const formatted = toRupees(Math.abs(paise)).toLocaleString("en-IN", {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  });
  return `${paise < 0 ? "-" : ""}₹${formatted}`;
}

/** Percentage of an amount, rounded to whole paise. */
export function pctOf(paise: number, pct: number): number {
  return roundPaise((paise * pct) / 100);
}

// ---------------------------------------------------------------------------
// Business constants (spec A3). Defaults only — the live values are read from
// the ConfigSetting table so admins can edit them without a deploy.
// ---------------------------------------------------------------------------

export interface MoneyConfig {
  /** Charged to the user. Spec A3: 3.5% of subtotal, min ₹15, max ₹99. */
  bookingFeePct: number;
  bookingFeeMinPaise: number;
  bookingFeeMaxPaise: number;
  /** Applied to the booking fee AND to the platform commission invoice. */
  gstPct: number;
  /** Deducted from the organizer. Per-organizer override is allowed. */
  platformCommissionPct: number;
}

export const DEFAULT_MONEY_CONFIG: MoneyConfig = {
  bookingFeePct: 3.5,
  bookingFeeMinPaise: toPaise(15),
  bookingFeeMaxPaise: toPaise(99),
  gstPct: 18,
  platformCommissionPct: 8,
};

/**
 * Booking fee — 3.5% of the **pre-discount** subtotal, clamped to [₹15, ₹99].
 *
 * The base is deliberately the gross subtotal, not the discounted one. Spec A3
 * says "3.5% of subtotal" and the D1 worked example is decisive: a ₹1,000
 * subtotal with a ₹100 promo yields a ₹35 fee (3.5% × 1000), not ₹31.50.
 * This contradicts the design README's "3.5% of discounted subtotal" — the
 * system spec wins. See DECISIONS.md.
 */
export function bookingFee(subtotalPaise: number, cfg: MoneyConfig): number {
  const raw = pctOf(subtotalPaise, cfg.bookingFeePct);
  return Math.min(Math.max(raw, cfg.bookingFeeMinPaise), cfg.bookingFeeMaxPaise);
}

export function gst(paise: number, cfg: MoneyConfig): number {
  return pctOf(paise, cfg.gstPct);
}

// ---------------------------------------------------------------------------
// Order totals
// ---------------------------------------------------------------------------

export interface OrderLine {
  tierId: string;
  /** Server-loaded unit price. Never accepted from the client (I4). */
  unitPricePaise: number;
  quantity: number;
}

export interface OrderTotals {
  subtotalPaise: number;
  discountPaise: number;
  bookingFeePaise: number;
  gstOnFeePaise: number;
  /** What the user owes in total, before any wallet offset. */
  totalPaise: number;
  /** Portion settled from wallet balance. */
  walletAppliedPaise: number;
  /** Portion that must go through the payment gateway. Zero => wallet-only
   *  booking, which skips gateway order creation entirely (spec C4.5). */
  gatewayPayablePaise: number;
}

export function computeOrderTotals(args: {
  lines: OrderLine[];
  discountPaise?: number;
  walletBalancePaise?: number;
  useWallet?: boolean;
  config: MoneyConfig;
}): OrderTotals {
  const { lines, config } = args;

  const subtotalPaise = lines.reduce(
    (sum, l) => sum + l.unitPricePaise * l.quantity,
    0,
  );

  // A promo can never exceed the subtotal — a discount must not manufacture
  // money by eating into the platform's fee.
  const discountPaise = Math.min(
    Math.max(args.discountPaise ?? 0, 0),
    subtotalPaise,
  );

  const bookingFeePaise = bookingFee(subtotalPaise, config);
  const gstOnFeePaise = gst(bookingFeePaise, config);
  const totalPaise =
    subtotalPaise - discountPaise + bookingFeePaise + gstOnFeePaise;

  // Wallet is usable up to 100% of the order (spec A3).
  const walletAppliedPaise = args.useWallet
    ? Math.min(args.walletBalancePaise ?? 0, totalPaise)
    : 0;

  return {
    subtotalPaise,
    discountPaise,
    bookingFeePaise,
    gstOnFeePaise,
    totalPaise,
    walletAppliedPaise,
    gatewayPayablePaise: totalPaise - walletAppliedPaise,
  };
}

// ---------------------------------------------------------------------------
// Ledger (spec D1)
// ---------------------------------------------------------------------------

export type LedgerAccount = "EXTERNAL" | "ORGANIZER" | "PLATFORM";

export type LedgerEntryType =
  | "PAYMENT_IN"
  | "WALLET_REDEEM"
  | "TICKET_SALE"
  | "COMMISSION"
  | "GST_COMMISSION"
  | "BOOKING_FEE"
  | "GST_BOOKING_FEE"
  | "REFUND_BOOKING_FEE"
  | "PAYOUT"
  /** No booking attached — an organizer buying a plan. Written through
   *  `writePlatformLedger`, not `writeLedger`. */
  | "ONBOARDING_FEE";

export interface LedgerRow {
  type: LedgerEntryType;
  account: LedgerAccount;
  /** Signed. Positive = credit to that account, negative = debit. */
  amountPaise: number;
  /** Snapshotted so a later commission-rate change cannot retroactively
   *  rewrite settled bookings (spec G2). */
  commissionPctUsed?: number;
  memo?: string;
}

/**
 * Build the ledger for a captured booking.
 *
 * Worked example from spec D1 — 2 × ₹500, promo −₹100, fee ₹35, GST ₹6.30,
 * user pays ₹941.30, commission 8% of ₹900:
 *
 *   PAYMENT_IN        EXTERNAL   -941.30
 *   TICKET_SALE       ORGANIZER  +900.00
 *   COMMISSION        ORGANIZER   -72.00   PLATFORM  +72.00
 *   GST_COMMISSION    ORGANIZER   -12.96   PLATFORM  +12.96
 *   BOOKING_FEE       PLATFORM    +35.00
 *   GST_BOOKING_FEE   PLATFORM     +6.30
 *                                --------
 *   organizer 815.04 · platform 126.26 · sum 0  ✓ (invariant I3)
 *
 * Note the `PAYMENT_IN` row. Spec D1 lists only the five business rows, which
 * sum to +941.30 rather than 0 and so cannot satisfy I3 as written. The
 * user/gateway leg is the missing half of the double entry; we add it. See
 * DECISIONS.md.
 */
export function buildCaptureLedger(args: {
  totals: OrderTotals;
  commissionPct: number;
  config: MoneyConfig;
}): LedgerRow[] {
  const { totals, commissionPct, config } = args;

  // Commission is charged on what the organizer actually sold — subtotal net
  // of the promo, since the discount comes out of the organizer's revenue.
  const netSalePaise = totals.subtotalPaise - totals.discountPaise;
  const commissionPaise = pctOf(netSalePaise, commissionPct);
  const gstOnCommissionPaise = gst(commissionPaise, config);

  const rows: LedgerRow[] = [];

  // Inbound money. Split so the wallet portion stays distinguishable from the
  // gateway portion during reconciliation; both are user-provided funds.
  if (totals.gatewayPayablePaise > 0) {
    rows.push({
      type: "PAYMENT_IN",
      account: "EXTERNAL",
      amountPaise: -totals.gatewayPayablePaise,
      memo: "Gateway capture",
    });
  }
  if (totals.walletAppliedPaise > 0) {
    rows.push({
      type: "WALLET_REDEEM",
      account: "EXTERNAL",
      amountPaise: -totals.walletAppliedPaise,
      memo: "Wallet redemption",
    });
  }

  rows.push({
    type: "TICKET_SALE",
    account: "ORGANIZER",
    amountPaise: netSalePaise,
  });

  rows.push(
    {
      type: "COMMISSION",
      account: "ORGANIZER",
      amountPaise: -commissionPaise,
      commissionPctUsed: commissionPct,
    },
    {
      type: "COMMISSION",
      account: "PLATFORM",
      amountPaise: commissionPaise,
      commissionPctUsed: commissionPct,
    },
    {
      type: "GST_COMMISSION",
      account: "ORGANIZER",
      amountPaise: -gstOnCommissionPaise,
      commissionPctUsed: commissionPct,
    },
    {
      type: "GST_COMMISSION",
      account: "PLATFORM",
      amountPaise: gstOnCommissionPaise,
      memo: "Remitted to govt",
      commissionPctUsed: commissionPct,
    },
  );

  rows.push(
    {
      type: "BOOKING_FEE",
      account: "PLATFORM",
      amountPaise: totals.bookingFeePaise,
    },
    {
      type: "GST_BOOKING_FEE",
      account: "PLATFORM",
      amountPaise: totals.gstOnFeePaise,
      memo: "Remitted to govt",
    },
  );

  return rows;
}

/**
 * Reverse a captured ledger for a refund.
 *
 * `fraction` is the proportion of the sale being refunded (1 = full).
 * Spec D1: a partial user refund reverses only the sale/commission rows. The
 * booking fee is returned solely when the fault is the organizer's or the
 * platform's, which is what `refundBookingFee` expresses.
 */
export function buildRefundLedger(args: {
  captureRows: LedgerRow[];
  fraction: number;
  refundBookingFee: boolean;
}): LedgerRow[] {
  const { captureRows, fraction, refundBookingFee } = args;
  const f = Math.min(Math.max(fraction, 0), 1);

  const saleTypes: LedgerEntryType[] = [
    "TICKET_SALE",
    "COMMISSION",
    "GST_COMMISSION",
  ];
  const inboundTypes: LedgerEntryType[] = ["PAYMENT_IN", "WALLET_REDEEM"];

  const rows: LedgerRow[] = captureRows
    .filter((r) => saleTypes.includes(r.type))
    .map((r) => ({
      ...r,
      amountPaise: -roundPaise(r.amountPaise * f),
      memo: `Refund reversal (${Math.round(f * 100)}%)`,
    }));

  if (refundBookingFee) {
    const fee = captureRows.find((r) => r.type === "BOOKING_FEE");
    const feeGst = captureRows.find((r) => r.type === "GST_BOOKING_FEE");
    if (fee) {
      rows.push({
        type: "REFUND_BOOKING_FEE",
        account: "PLATFORM",
        amountPaise: -fee.amountPaise,
        memo: "Organizer/admin-fault cancellation",
      });
    }
    if (feeGst) {
      rows.push({
        type: "REFUND_BOOKING_FEE",
        account: "PLATFORM",
        amountPaise: -feeGst.amountPaise,
        memo: "GST on refunded booking fee",
      });
    }
  }

  // Balancing leg — money flowing back out to the user. Derived as the exact
  // negation of everything reversed above rather than recomputed from the
  // organizer's net, so it stays correct under any rounding of the fraction.
  const outbound = -rows.reduce((sum, r) => sum + r.amountPaise, 0);
  const inboundType = captureRows.find((r) => inboundTypes.includes(r.type));
  rows.push({
    type: inboundType?.type ?? "PAYMENT_IN",
    account: "EXTERNAL",
    amountPaise: outbound,
    memo: "Refund to user",
  });

  return rows;
}

/** Invariant I3. Call in tests and in the payout run before settling. */
export function ledgerBalances(rows: LedgerRow[]): boolean {
  return rows.reduce((sum, r) => sum + r.amountPaise, 0) === 0;
}

export function accountBalance(
  rows: LedgerRow[],
  account: LedgerAccount,
): number {
  return rows
    .filter((r) => r.account === account)
    .reduce((sum, r) => sum + r.amountPaise, 0);
}
