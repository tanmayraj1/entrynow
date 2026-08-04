/**
 * Next's startup hook. Runs once per server process, before the first request.
 *
 * The runtime guard is required: this file is also evaluated in the Edge
 * runtime, where `ioredis` and BullMQ (both Node-only) would fail to load and
 * take the whole server down at boot.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Before anything else: refuse to serve a production build that silently
  // accepts a fixed OTP and unverified email sign-ups.
  const { assertDemoModeIsIntentional } = await import("@/lib/demo");
  assertDemoModeIsIntentional();

  const { startWorkers } = await import("@/lib/jobs");
  await startWorkers();
}
