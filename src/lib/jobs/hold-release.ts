import "server-only";

import type { Job } from "bullmq";
import { QUEUE_NAMES, enqueueSafely, registerWorker } from "./queue";

/**
 * Hold release — the other half of the atomic hold (spec H, D-014).
 *
 * A booking that is never paid for must give its seats back, or every
 * abandoned checkout permanently burns inventory nobody can buy and nobody can
 * free. This is why the hold could not ship without it.
 *
 * `expireBooking` is imported lazily inside the handlers. `create.ts` imports
 * *this* module for `scheduleHoldRelease`, so a top-level import back into it
 * would be a cycle — and under Next's bundler a cycle here resolves to
 * `undefined` at call time rather than failing loudly at build.
 */

interface HoldReleasePayload {
  bookingId: string;
}

/**
 * Schedule the release for the moment the hold expires.
 *
 * `jobId` is the booking id, so BullMQ de-duplicates: a retry of the same
 * booking cannot queue a second release. A small grace period is added so the
 * job never fires a few milliseconds *before* `expiresAt` and expires a
 * booking whose payment is landing at that instant.
 */
export async function scheduleHoldRelease(
  bookingId: string,
  expiresAt: Date,
): Promise<boolean> {
  const GRACE_MS = 2_000;
  const delay = Math.max(0, expiresAt.getTime() - Date.now() + GRACE_MS);
  return enqueueSafely(
    QUEUE_NAMES.holdRelease,
    "release",
    { bookingId } satisfies HoldReleasePayload,
    { delay, jobId: `hold:${bookingId}` },
  );
}

/**
 * Cancel a scheduled release after a successful capture.
 *
 * Best-effort. If it fails the job still runs and finds the booking already
 * CONFIRMED, and `expireBooking`'s status guard makes that a no-op — the
 * cancellation is an optimisation, not a correctness requirement.
 */
export async function cancelHoldRelease(bookingId: string): Promise<void> {
  try {
    const { getQueue } = await import("./queue");
    const job = await getQueue(QUEUE_NAMES.holdRelease).getJob(
      `hold:${bookingId}`,
    );
    await job?.remove();
  } catch {
    /* the status guard covers us */
  }
}

export function registerHoldReleaseWorker() {
  return registerWorker(
    QUEUE_NAMES.holdRelease,
    async (job: Job<HoldReleasePayload>) => {
      const { expireBooking } = await import("@/lib/booking/create");
      const expired = await expireBooking(job.data.bookingId);
      return { bookingId: job.data.bookingId, expired };
    },
  );
}

/**
 * Periodic safety net: sweep every expired hold across all events.
 *
 * The per-event sweep in `createBooking` only reclaims events people are
 * actively trying to buy. This catches the rest — an event whose last
 * checkout was abandoned and which nobody visits again until tomorrow.
 */
export function registerHoldSweepWorker() {
  return registerWorker(QUEUE_NAMES.paymentReconcile, async () => {
    const { releaseExpiredHolds } = await import("@/lib/booking/create");
    const released = await releaseExpiredHolds();
    if (released > 0) {
      console.log(`[jobs:sweep] released ${released} expired hold(s)`);
    }
    return { released };
  });
}

/**
 * Every 10 minutes.
 *
 * Registered as a BullMQ "job scheduler" — the v5+ replacement for the old
 * `repeat` job option. The scheduler key de-duplicates, so calling this on
 * every boot (and on every dev hot-reload) does not stack schedules.
 */
export async function scheduleHoldSweep(): Promise<void> {
  try {
    const { getQueue } = await import("./queue");
    await getQueue(QUEUE_NAMES.paymentReconcile).upsertJobScheduler(
      "hold-sweep",
      { every: 10 * 60_000 },
      { name: "sweep" },
    );
  } catch (err) {
    console.error(
      "[jobs:sweep] could not register the repeat schedule; the " +
        "per-event sweep in createBooking still covers active events:",
      err instanceof Error ? err.message : err,
    );
  }
}
