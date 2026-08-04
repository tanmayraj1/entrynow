import "server-only";

import { Queue, Worker, type ConnectionOptions, type Processor } from "bullmq";

/**
 * BullMQ wiring — the first real use of the queue.
 *
 * Everything scheduled here is a *backstop or a convenience*, never the sole
 * guarantee of a business rule. Inventory release, the one that can lose an
 * organizer money, is also swept synchronously by anyone trying to buy the
 * seat (D-022). A queue is infrastructure and infrastructure is down
 * sometimes; correctness must not be.
 */

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";

/**
 * BullMQ needs `maxRetriesPerRequest: null` on its blocking connections. The
 * shared `src/lib/redis.ts` client sets 3, which is right for a request-path
 * command and wrong for a worker that blocks on BRPOPLPUSH for minutes — so
 * the queue owns its own connection rather than borrowing that one.
 */
export const connection: ConnectionOptions = {
  url: REDIS_URL,
  maxRetriesPerRequest: null,
};

export const QUEUE_NAMES = {
  holdRelease: "hold-release",
  paymentReconcile: "payment-reconcile",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const queues = new Map<string, Queue>();

/** Lazily constructed, one per name, cached across dev hot-reloads. */
export function getQueue(name: QueueName): Queue {
  const existing = queues.get(name);
  if (existing) return existing;
  const q = new Queue(name, {
    connection,
    defaultJobOptions: {
      // Keep a short tail for debugging; BullMQ otherwise grows unbounded.
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 500 },
      attempts: 3,
      backoff: { type: "exponential", delay: 2_000 },
    },
  });
  queues.set(name, q);
  return q;
}

const workers = new Map<string, Worker>();

export function registerWorker(name: QueueName, processor: Processor): Worker {
  const existing = workers.get(name);
  if (existing) return existing;
  const w = new Worker(name, processor, { connection, concurrency: 4 });
  w.on("failed", (job, err) => {
    console.error(`[jobs:${name}] job ${job?.id} failed:`, err.message);
  });
  workers.set(name, w);
  return w;
}

/**
 * Enqueue without letting a queue outage fail the caller.
 *
 * Every scheduled job in this system has a synchronous fallback, so a failed
 * enqueue is a degradation to log, not an error to propagate into a booking
 * the user has already paid for.
 */
export async function enqueueSafely(
  name: QueueName,
  jobName: string,
  data: Record<string, unknown>,
  opts?: { delay?: number; jobId?: string },
): Promise<boolean> {
  try {
    await getQueue(name).add(jobName, data, opts);
    return true;
  } catch (err) {
    console.error(
      `[jobs:${name}] enqueue failed for ${jobName}; falling back to the ` +
        `synchronous sweep:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
