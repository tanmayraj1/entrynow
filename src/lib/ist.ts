/**
 * Time. Invariant I7: all timestamps are stored UTC; all business logic —
 * sale windows, session dates, "today", refund cut-offs — is evaluated in
 * Asia/Kolkata.
 *
 * Nothing in this codebase may call `new Date().getHours()`, `toDateString()`,
 * or compare calendar dates directly. Those read the *server's* zone, which is
 * UTC in production and the developer's local zone in dev — a class of bug
 * that shows up as tickets rejected at the gate at 5:30 AM IST.
 */

import { TZDate } from "@date-fns/tz";
import { addDays, addHours, endOfDay, format, startOfDay } from "date-fns";

export const IST_TZ = "Asia/Kolkata";

/** Reinterpret an instant in IST. The underlying instant is unchanged. */
export function ist(date: Date | string | number = new Date()): TZDate {
  return new TZDate(new Date(date), IST_TZ);
}

/** IST calendar day key, e.g. "2026-10-12". The unit every "is it today?"
 *  comparison should use. */
export function istDateKey(date: Date | string | number = new Date()): string {
  return format(ist(date), "yyyy-MM-dd");
}

export function istStartOfDay(date: Date | string | number = new Date()): Date {
  return new Date(startOfDay(ist(date)).getTime());
}

export function istEndOfDay(date: Date | string | number = new Date()): Date {
  return new Date(endOfDay(ist(date)).getTime());
}

export function isSameIstDay(a: Date | string, b: Date | string): boolean {
  return istDateKey(a) === istDateKey(b);
}

export function isTodayIst(date: Date | string): boolean {
  return istDateKey(date) === istDateKey();
}

// ---------------------------------------------------------------------------
// Session windows
// ---------------------------------------------------------------------------

/**
 * Whether a session is "on" for gate purposes right now.
 *
 * Spec edge case I8: a Garba session running 8 PM–1 AM belongs to its **start**
 * date, and the scanner must keep accepting until the session *ends* — not
 * until the calendar date rolls over at midnight. So this is a pure instant
 * comparison against [start, end], never a date-key comparison.
 *
 * `graceMinutes` covers the queue that is still outside the gate at close.
 */
export function isSessionScannable(
  session: { startsAt: Date; endsAt: Date },
  now: Date = new Date(),
  graceMinutes = 0,
): boolean {
  const openFrom = session.startsAt.getTime();
  const openUntil = session.endsAt.getTime() + graceMinutes * 60_000;
  const t = now.getTime();
  return t >= openFrom && t <= openUntil;
}

/**
 * The IST calendar date a session is filed under — its start date, even when
 * the session runs past midnight (spec I8).
 */
export function sessionDateKey(session: { startsAt: Date }): string {
  return istDateKey(session.startsAt);
}

/** Sessions belonging to "today" in IST, by start date (spec F1.3's
 *  WRONG_SESSION check). */
export function isSessionToday(
  session: { startsAt: Date },
  now: Date = new Date(),
): boolean {
  return sessionDateKey(session) === istDateKey(now);
}

// ---------------------------------------------------------------------------
// Policy windows
// ---------------------------------------------------------------------------

/**
 * Hours between now and a session start, as an exact fraction. Positive =
 * session is in the future.
 *
 * Deliberately NOT `differenceInHours`, which truncates toward zero: a
 * cancellation 6h30m before a session would read as 6h and fail a `> 6` check,
 * silently burning the attendee's seats. Every threshold in this file is a
 * boundary someone loses money at, so they all compare exact fractions.
 *
 * Spec edge case I12: the refund policy is evaluated at the **request
 * submission timestamp**, server-side, in IST. Pass the submission time
 * explicitly rather than defaulting to "now" at some later point in the
 * transaction, or a request made at 72h+1min can settle as 72h−1min.
 */
export function hoursUntil(target: Date, from: Date = new Date()): number {
  return (target.getTime() - from.getTime()) / 3_600_000;
}

export function minutesUntil(target: Date, from: Date = new Date()): number {
  return (target.getTime() - from.getTime()) / 60_000;
}

/** Spec C6.2: inventory is restored on cancellation only when there is still
 *  more than 6h before the session — otherwise the seats stay burned, which
 *  stops last-minute cancel-and-resell gaming. */
export function isInventoryRestorable(
  sessionStartsAt: Date,
  at: Date = new Date(),
  thresholdHours = 6,
): boolean {
  return hoursUntil(sessionStartsAt, at) > thresholdHours;
}

/** Spec C5.1: transfers close 2h before the session. */
export function isTransferAllowedByTime(
  sessionStartsAt: Date,
  at: Date = new Date(),
  thresholdHours = 2,
): boolean {
  return hoursUntil(sessionStartsAt, at) > thresholdHours;
}

/** Spec F2.1: the scanner pulls its offline manifest 30 min before gates open. */
export function manifestWindowOpensAt(
  sessionStartsAt: Date,
  leadMinutes = 30,
): Date {
  return new Date(sessionStartsAt.getTime() - leadMinutes * 60_000);
}

/** Spec B1: an event completes once `now > last session end + 6h`. */
export function isEventComplete(
  lastSessionEndsAt: Date,
  now: Date = new Date(),
  bufferHours = 6,
): boolean {
  return now > addHours(lastSessionEndsAt, bufferHours);
}

/** Spec D2.1: payouts run `PAYOUT_DELAY_DAYS` after completion. */
export function payoutEligibleAt(completedAt: Date, delayDays: number): Date {
  return addDays(completedAt, delayDays);
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/** "Sun, 12 Oct 2026" — the format the ticket and listing designs use. */
export function formatIstDate(date: Date | string): string {
  return format(ist(date), "EEE, d MMM yyyy");
}

/** "7:30 PM" */
export function formatIstTime(date: Date | string): string {
  return format(ist(date), "h:mm a");
}

/** "12 Oct" — day chips and the festival night navigator. */
export function formatIstShortDate(date: Date | string): string {
  return format(ist(date), "d MMM");
}

/** "12 – 20 Oct" — multi-night event date ranges. */
export function formatIstDateRange(start: Date | string, end: Date | string): string {
  const s = ist(start);
  const e = ist(end);
  if (istDateKey(s) === istDateKey(e)) return formatIstShortDate(s);
  return format(s, "d") === format(e, "d") && format(s, "MMM") === format(e, "MMM")
    ? formatIstShortDate(s)
    : `${format(s, "MMM") === format(e, "MMM") ? format(s, "d") : format(s, "d MMM")} – ${format(e, "d MMM")}`;
}

/** mm:ss for the 8-minute booking hold countdown. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
