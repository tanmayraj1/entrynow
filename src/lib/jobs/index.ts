import "server-only";

import {
  registerHoldReleaseWorker,
  registerHoldSweepWorker,
  scheduleHoldSweep,
} from "./hold-release";

/**
 * Worker bootstrap.
 *
 * Called once from `src/instrumentation.ts`, which Next runs in the Node
 * runtime before serving. In production these would run as a separate process
 * — a worker sharing a web dyno competes with request handling and dies with
 * it — but in development, in-process is what makes the whole booking flow
 * work end to end with a single `npm run dev`.
 *
 * A failure to start is logged, never thrown. Every job here has a synchronous
 * fallback (D-022); the site must serve without Redis.
 */

let started = false;

export async function startWorkers(): Promise<void> {
  if (started) return;
  started = true;

  try {
    registerHoldReleaseWorker();
    registerHoldSweepWorker();
    await scheduleHoldSweep();
    console.log("[jobs] workers registered: hold-release, hold-sweep");
  } catch (err) {
    console.error(
      "[jobs] failed to start workers — expired holds will still be " +
        "reclaimed by the per-event sweep in createBooking:",
      err instanceof Error ? err.message : err,
    );
  }
}
