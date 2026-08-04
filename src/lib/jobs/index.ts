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

/**
 * Whether this process should run workers at all.
 *
 * On a serverless host every cold start boots a fresh instance, so without
 * this gate each one registers BullMQ workers and opens a Redis connection —
 * burning connection quota on workers that cannot survive the invocation
 * anyway, since BullMQ needs a long-lived process holding blocking Redis
 * commands.
 *
 * Default ON in development, so a single `npm run dev` still runs the whole
 * booking flow end to end. Default OFF in production unless a process
 * explicitly opts in with `RUN_WORKERS=true` — that flag is what marks the one
 * dedicated worker dyno, cron container or Render background service.
 */
export function shouldRunWorkers(): boolean {
  const flag = process.env.RUN_WORKERS;
  if (flag !== undefined) return flag === "true";
  return process.env.NODE_ENV !== "production";
}

export async function startWorkers(): Promise<void> {
  if (started) return;
  started = true;

  if (!shouldRunWorkers()) {
    // Not a warning. Expired holds are still reclaimed by the per-event sweep
    // at the top of every createBooking (D-022), so a web instance with no
    // worker is a supported configuration, not a degraded one.
    console.log(
      "[jobs] workers not started in this process (RUN_WORKERS is not true) — " +
        "expired holds are reclaimed by the sweep in createBooking",
    );
    return;
  }

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
