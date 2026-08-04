/**
 * Availability derivations (spec C3.2) and the trending score (spec C3.3).
 *
 * These run on the server for listing/card rendering. They are display logic
 * only — nothing here authorises a booking. The atomic hold in the booking
 * transaction is the sole authority on whether a seat exists (invariant I1).
 */

export type AvailabilityChip =
  | { kind: "SOLD_OUT"; label: "Sold out" }
  | { kind: "FEW_LEFT"; label: "Few left" }
  | { kind: "FILLING_FAST"; label: "Filling fast" }
  | { kind: "TODAY"; label: "Today" }
  | null;

export interface TierAvailability {
  quantityTotal: number;
  quantitySold: number;
  quantityHeld: number;
  isActive: boolean;
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
  pricePaise: number;
}

/** Seats a user could actually acquire right now. Held seats are unavailable
 *  even though they are not yet sold. */
export function tierRemaining(tier: TierAvailability): number {
  return Math.max(
    0,
    tier.quantityTotal - tier.quantitySold - tier.quantityHeld,
  );
}

export function isTierOnSale(tier: TierAvailability, now: Date = new Date()): boolean {
  if (!tier.isActive) return false;
  if (tier.saleStartsAt && now < tier.saleStartsAt) return false;
  if (tier.saleEndsAt && now > tier.saleEndsAt) return false;
  return true;
}

/** A tier is bookable when it is on sale AND has stock. */
export function isTierBookable(tier: TierAvailability, now: Date = new Date()): boolean {
  return isTierOnSale(tier, now) && tierRemaining(tier) > 0;
}

/** Sold fraction across the whole event, 0..1. Excludes inactive tiers so a
 *  disabled tier cannot drag the ratio down and hide a genuine "Few left". */
export function soldRatio(tiers: TierAvailability[]): number {
  const active = tiers.filter((t) => t.isActive);
  const total = active.reduce((s, t) => s + t.quantityTotal, 0);
  if (total === 0) return 0;
  const sold = active.reduce((s, t) => s + t.quantitySold, 0);
  return sold / total;
}

/**
 * The chip shown on an event card (spec C3.2).
 *
 *   sold/total >= 0.9            -> "Few left"
 *   sold/total >= 0.7            -> "Filling fast"
 *   every tier sold or window over -> "Sold out" (card stays listed, unbookable)
 *   event is today               -> "Today"
 *
 * Sold out wins over everything; "Today" wins over the two urgency chips,
 * because date is the more actionable fact once a user is browsing today.
 */
export function availabilityChip(args: {
  tiers: TierAvailability[];
  isToday: boolean;
  now?: Date;
}): AvailabilityChip {
  const now = args.now ?? new Date();
  const active = args.tiers.filter((t) => t.isActive);

  const anyBookable = active.some((t) => isTierBookable(t, now));
  if (active.length > 0 && !anyBookable) {
    return { kind: "SOLD_OUT", label: "Sold out" };
  }

  if (args.isToday) return { kind: "TODAY", label: "Today" };

  const ratio = soldRatio(args.tiers);
  if (ratio >= 0.9) return { kind: "FEW_LEFT", label: "Few left" };
  if (ratio >= 0.7) return { kind: "FILLING_FAST", label: "Filling fast" };
  return null;
}

/** Lowest bookable price across an event's tiers — the "From ₹499" figure. */
export function fromPricePaise(
  tiers: TierAvailability[],
  now: Date = new Date(),
): number | null {
  const bookable = tiers.filter((t) => isTierBookable(t, now));
  // Fall back to on-sale-but-empty tiers so a sold-out card still shows a price
  // rather than a blank where the price should be.
  const pool = bookable.length > 0 ? bookable : tiers.filter((t) => t.isActive);
  if (pool.length === 0) return null;
  return Math.min(...pool.map((t) => t.pricePaise));
}

/**
 * Trending score (spec C3.3):
 *   0.6 * normalized(sales_72h) + 0.4 * normalized(views_72h)
 *
 * Normalisation is min-max across the candidate set, so the score is only
 * meaningful relative to the batch it was computed with — which is why the
 * hourly job recomputes the whole city at once rather than per event.
 */
export function trendingScores(
  rows: { id: string; sales72h: number; views72h: number }[],
): Map<string, number> {
  const out = new Map<string, number>();
  if (rows.length === 0) return out;

  const maxSales = Math.max(...rows.map((r) => r.sales72h), 0);
  const maxViews = Math.max(...rows.map((r) => r.views72h), 0);

  for (const r of rows) {
    const s = maxSales === 0 ? 0 : r.sales72h / maxSales;
    const v = maxViews === 0 ? 0 : r.views72h / maxViews;
    out.set(r.id, 0.6 * s + 0.4 * v);
  }
  return out;
}
