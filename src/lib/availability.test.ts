import { describe, expect, it } from "vitest";
import {
  availabilityChip,
  fromPricePaise,
  isTierBookable,
  tierRemaining,
  trendingScores,
  type TierAvailability,
} from "./availability";
import { toPaise } from "./money";

const tier = (over: Partial<TierAvailability> = {}): TierAvailability => ({
  quantityTotal: 100,
  quantitySold: 0,
  quantityHeld: 0,
  isActive: true,
  saleStartsAt: null,
  saleEndsAt: null,
  pricePaise: toPaise(499),
  ...over,
});

describe("remaining seats", () => {
  it("treats held seats as unavailable", () => {
    expect(tierRemaining(tier({ quantitySold: 60, quantityHeld: 10 }))).toBe(30);
  });

  it("never goes negative", () => {
    expect(tierRemaining(tier({ quantitySold: 100, quantityHeld: 5 }))).toBe(0);
  });
});

describe("sale windows", () => {
  const now = new Date("2026-09-01T12:00:00Z");

  it("is not bookable before the window opens", () => {
    expect(
      isTierBookable(tier({ saleStartsAt: new Date("2026-09-02T00:00:00Z") }), now),
    ).toBe(false);
  });

  it("is not bookable after the window closes", () => {
    expect(
      isTierBookable(tier({ saleEndsAt: new Date("2026-08-31T00:00:00Z") }), now),
    ).toBe(false);
  });

  it("is not bookable when the tier is inactive", () => {
    expect(isTierBookable(tier({ isActive: false }), now)).toBe(false);
  });

  it("is not bookable with zero stock even inside the window", () => {
    expect(isTierBookable(tier({ quantitySold: 100 }), now)).toBe(false);
  });
});

describe("availability chip — spec C3.2", () => {
  it("shows 'Few left' at 90% sold", () => {
    const chip = availabilityChip({
      tiers: [tier({ quantitySold: 90 })],
      isToday: false,
    });
    expect(chip?.kind).toBe("FEW_LEFT");
  });

  it("shows 'Filling fast' at 70% sold", () => {
    const chip = availabilityChip({
      tiers: [tier({ quantitySold: 70 })],
      isToday: false,
    });
    expect(chip?.kind).toBe("FILLING_FAST");
  });

  it("shows nothing below 70%", () => {
    expect(
      availabilityChip({ tiers: [tier({ quantitySold: 69 })], isToday: false }),
    ).toBeNull();
  });

  it("shows 'Sold out' when every tier is exhausted", () => {
    const chip = availabilityChip({
      tiers: [tier({ quantitySold: 100 }), tier({ quantitySold: 100 })],
      isToday: false,
    });
    expect(chip?.kind).toBe("SOLD_OUT");
  });

  it("shows 'Sold out' when the sale window has closed, even with stock", () => {
    const chip = availabilityChip({
      tiers: [tier({ saleEndsAt: new Date("2020-01-01T00:00:00Z") })],
      isToday: false,
    });
    expect(chip?.kind).toBe("SOLD_OUT");
  });

  it("sold out beats today", () => {
    const chip = availabilityChip({
      tiers: [tier({ quantitySold: 100 })],
      isToday: true,
    });
    expect(chip?.kind).toBe("SOLD_OUT");
  });

  it("today beats the urgency chips", () => {
    const chip = availabilityChip({
      tiers: [tier({ quantitySold: 95 })],
      isToday: true,
    });
    expect(chip?.kind).toBe("TODAY");
  });

  it("ignores inactive tiers when computing the ratio", () => {
    // A disabled 1000-seat tier must not dilute a genuinely nearly-sold event.
    const chip = availabilityChip({
      tiers: [
        tier({ quantitySold: 95 }),
        tier({ quantityTotal: 1000, quantitySold: 0, isActive: false }),
      ],
      isToday: false,
    });
    expect(chip?.kind).toBe("FEW_LEFT");
  });
});

describe("from price", () => {
  it("takes the cheapest bookable tier", () => {
    expect(
      fromPricePaise([
        tier({ pricePaise: toPaise(1499) }),
        tier({ pricePaise: toPaise(499) }),
      ]),
    ).toBe(toPaise(499));
  });

  it("skips a sold-out tier when a pricier one is still available", () => {
    expect(
      fromPricePaise([
        tier({ pricePaise: toPaise(349), quantitySold: 100 }),
        tier({ pricePaise: toPaise(899) }),
      ]),
    ).toBe(toPaise(899));
  });

  it("still reports a price when everything is sold out", () => {
    expect(
      fromPricePaise([tier({ pricePaise: toPaise(349), quantitySold: 100 })]),
    ).toBe(toPaise(349));
  });
});

describe("trending score — spec C3.3", () => {
  it("weights sales 0.6 and views 0.4", () => {
    const scores = trendingScores([
      { id: "a", sales72h: 100, views72h: 100 }, // both maxima
      { id: "b", sales72h: 0, views72h: 100 },
      { id: "c", sales72h: 100, views72h: 0 },
    ]);
    expect(scores.get("a")).toBeCloseTo(1.0);
    expect(scores.get("b")).toBeCloseTo(0.4);
    expect(scores.get("c")).toBeCloseTo(0.6);
  });

  it("handles an all-zero batch without dividing by zero", () => {
    const scores = trendingScores([{ id: "a", sales72h: 0, views72h: 0 }]);
    expect(scores.get("a")).toBe(0);
  });
});
