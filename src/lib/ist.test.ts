import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  formatIstDate,
  formatIstTime,
  hoursUntil,
  isEventComplete,
  isInventoryRestorable,
  isSessionScannable,
  isSessionToday,
  isTransferAllowedByTime,
  istDateKey,
  manifestWindowOpensAt,
  sessionDateKey,
} from "./ist";

/** IST wall-clock -> UTC instant, matching the seed's helper. */
const ist = (y: number, m: number, d: number, hh = 0, mm = 0) =>
  new Date(Date.UTC(y, m - 1, d, hh, mm) - 5.5 * 3600 * 1000);

describe("IST conversion — invariant I7", () => {
  it("reads the IST calendar day, not the server's", () => {
    // 20:00 UTC on 11 Oct is already 01:30 IST on 12 Oct.
    expect(istDateKey(new Date("2026-10-11T20:00:00Z"))).toBe("2026-10-12");
  });

  it("formats dates and times in IST", () => {
    const d = ist(2026, 10, 12, 19, 30);
    expect(formatIstDate(d)).toBe("Mon, 12 Oct 2026");
    expect(formatIstTime(d)).toBe("7:30 PM");
  });
});

describe("midnight-spanning Garba session — edge case I8", () => {
  // Night 1 of Rangilo Re: 12 Oct 19:30 -> 13 Oct 01:00 IST.
  const session = {
    startsAt: ist(2026, 10, 12, 19, 30),
    endsAt: ist(2026, 10, 13, 1, 0),
  };

  it("is filed under its START date, even though it ends the next day", () => {
    expect(sessionDateKey(session)).toBe("2026-10-12");
    expect(istDateKey(session.endsAt)).toBe("2026-10-13");
  });

  it("stays scannable after midnight — the date rolling over must not reject", () => {
    // 00:30 IST on 13 Oct: the calendar date has changed, the session has not.
    expect(isSessionScannable(session, ist(2026, 10, 13, 0, 30))).toBe(true);
  });

  it("accepts right up to the session end", () => {
    expect(isSessionScannable(session, ist(2026, 10, 13, 0, 59))).toBe(true);
    expect(isSessionScannable(session, ist(2026, 10, 13, 1, 0))).toBe(true);
  });

  it("rejects after the end, and before the start", () => {
    expect(isSessionScannable(session, ist(2026, 10, 13, 1, 1))).toBe(false);
    expect(isSessionScannable(session, ist(2026, 10, 12, 19, 29))).toBe(false);
  });

  it("honours a grace period for the queue still outside at close", () => {
    expect(isSessionScannable(session, ist(2026, 10, 13, 1, 10), 15)).toBe(true);
    expect(isSessionScannable(session, ist(2026, 10, 13, 1, 20), 15)).toBe(false);
  });

  it("counts as 'today' on its start date only — drives WRONG_SESSION", () => {
    expect(isSessionToday(session, ist(2026, 10, 12, 21, 0))).toBe(true);
    // At 00:30 on the 13th the session is still running but the IST day has
    // changed, which is exactly why the gate check uses isSessionScannable and
    // never this.
    expect(isSessionToday(session, ist(2026, 10, 13, 0, 30))).toBe(false);
  });
});

describe("policy windows", () => {
  const sessionStart = ist(2026, 10, 12, 19, 30);

  it("evaluates the 72h refund boundary at the submission timestamp — I12", () => {
    const justInside = ist(2026, 10, 9, 19, 29); // 72h 1min before
    const justOutside = ist(2026, 10, 9, 19, 31); // 71h 59min before
    expect(hoursUntil(sessionStart, justInside)).toBeGreaterThanOrEqual(72);
    expect(hoursUntil(sessionStart, justOutside)).toBeLessThan(72);
  });

  it("restores inventory only more than 6h out — spec C6.2", () => {
    expect(isInventoryRestorable(sessionStart, ist(2026, 10, 12, 13, 0))).toBe(true);
    expect(isInventoryRestorable(sessionStart, ist(2026, 10, 12, 14, 0))).toBe(false);
    expect(isInventoryRestorable(sessionStart, ist(2026, 10, 12, 18, 0))).toBe(false);
  });

  it("closes transfers 2h before the session — spec C5.1", () => {
    expect(isTransferAllowedByTime(sessionStart, ist(2026, 10, 12, 17, 0))).toBe(true);
    expect(isTransferAllowedByTime(sessionStart, ist(2026, 10, 12, 17, 31))).toBe(false);
  });

  it("opens the scanner manifest window 30min before gates — spec F2.1", () => {
    expect(manifestWindowOpensAt(sessionStart).toISOString()).toBe(
      ist(2026, 10, 12, 19, 0).toISOString(),
    );
  });

  it("completes an event 6h after its last session ends — spec B1", () => {
    const lastEnd = ist(2026, 10, 21, 1, 0);
    expect(isEventComplete(lastEnd, ist(2026, 10, 21, 6, 59))).toBe(false);
    expect(isEventComplete(lastEnd, ist(2026, 10, 21, 7, 1))).toBe(true);
  });
});

describe("countdown formatting", () => {
  it("renders the 8-minute hold as mm:ss", () => {
    expect(formatCountdown(480)).toBe("8:00");
    expect(formatCountdown(59)).toBe("0:59");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});
