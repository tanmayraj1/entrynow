"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/**
 * The scanner's offline store.
 *
 * IndexedDB rather than `localStorage`, for one reason that matters at a gate:
 * `localStorage` is synchronous and string-only, so writing a queue entry
 * blocks the main thread — and the main thread is decoding camera frames. A
 * blocked frame is a missed scan and a person standing at a turnstile.
 *
 * Two stores:
 *   - **manifest** — the night's valid tokens, so a scan can be judged with no
 *     network at all.
 *   - **queue** — scans taken while offline, keyed by a client id so a partial
 *     sync can be resumed without double-sending.
 *
 * Nothing here is the source of truth. The manifest tells the gate what to
 * *show*; the server's atomic claim is what decides who was actually admitted,
 * and the queue is replayed through the identical code path on reconnect.
 */

export interface QueuedScan {
  clientId: string;
  eventId: string;
  token: string;
  gateId: string | null;
  deviceScannedAt: string;
  /** What the offline manifest said at the time — shown, never trusted. */
  optimisticResult: string;
}

export interface ManifestTicket {
  qrTokenId: string;
  ticketNumber: string;
  attendeeName: string;
  status: string;
  tierName: string;
  isSeasonPass: boolean;
}

interface ScanDB extends DBSchema {
  manifest: {
    key: string;
    value: {
      eventId: string;
      syncedAt: string;
      sessionId: string;
      sessionSequence: number;
      tickets: ManifestTicket[];
      /** Locally-scanned tokens, so a second offline scan of the same QR is
       *  caught by this device even before the server sees either. */
      usedTokens: string[];
    };
  };
  queue: {
    key: string;
    value: QueuedScan;
    indexes: { "by-event": string };
  };
}

let dbPromise: Promise<IDBPDatabase<ScanDB>> | null = null;

function getDb() {
  dbPromise ??= openDB<ScanDB>("entrynow-scan", 1, {
    upgrade(db) {
      db.createObjectStore("manifest", { keyPath: "eventId" });
      const q = db.createObjectStore("queue", { keyPath: "clientId" });
      q.createIndex("by-event", "eventId");
    },
  });
  return dbPromise;
}

export async function saveManifest(value: ScanDB["manifest"]["value"]) {
  const db = await getDb();
  await db.put("manifest", value);
}

export async function loadManifest(eventId: string) {
  const db = await getDb();
  return db.get("manifest", eventId);
}

/** Mark a token used locally so this device refuses an immediate re-scan. */
export async function markUsedLocally(eventId: string, qrTokenId: string) {
  const db = await getDb();
  const m = await db.get("manifest", eventId);
  if (!m) return;
  if (!m.usedTokens.includes(qrTokenId)) {
    m.usedTokens = [...m.usedTokens, qrTokenId];
    await db.put("manifest", m);
  }
}

export async function enqueue(scan: QueuedScan) {
  const db = await getDb();
  await db.put("queue", scan);
}

export async function queued(eventId: string): Promise<QueuedScan[]> {
  const db = await getDb();
  return db.getAllFromIndex("queue", "by-event", eventId);
}

export async function queuedCount(eventId: string): Promise<number> {
  return (await queued(eventId)).length;
}

/**
 * Drop the entries the server confirmed it processed.
 *
 * Keyed on `clientId` rather than clearing the whole store, because scans can
 * land in the queue *while* a sync is in flight — clearing wholesale would
 * silently lose the ones taken during the round trip.
 */
export async function dequeue(clientIds: string[]) {
  const db = await getDb();
  const tx = db.transaction("queue", "readwrite");
  await Promise.all([...clientIds.map((id) => tx.store.delete(id)), tx.done]);
}

export function newClientId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
