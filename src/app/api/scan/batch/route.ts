import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { scanTicket } from "@/lib/scan/engine";

/**
 * Replay an offline queue (spec F2.3).
 *
 * **Ordered by the device clock, not by arrival.** Two gates that both went
 * offline reconnect in whatever order their signal returns, but the person who
 * physically walked through first must be the one recorded as admitted —
 * otherwise the attendance record contradicts what happened at the door.
 *
 * Each scan runs through the identical `scanTicket` path an online scan takes.
 * There is no "offline mode" branch in the engine, so a rule cannot hold at the
 * gate and quietly not hold on replay; `wasOffline` only affects logging and
 * conflict recording.
 *
 * Cross-gate duplicates are the accepted risk of F2.2 — two offline gates
 * cannot see each other. The loser becomes a `ScanConflict` row for the
 * organizer to review, rather than being silently dropped.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to sync." }, { status: 401 });
  }

  let body: {
    eventId?: string;
    scans?: {
      token: string;
      gateId?: string | null;
      deviceScannedAt: string;
      clientId?: string;
    }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const { eventId, scans } = body;
  if (!eventId || !Array.isArray(scans)) {
    return NextResponse.json({ error: "Missing eventId or scans." }, { status: 400 });
  }
  // A bounded batch. An unbounded one lets a stuck device hold a connection
  // open for minutes at exactly the moment a gate needs the server responsive.
  if (scans.length > 500) {
    return NextResponse.json(
      { error: "Send at most 500 scans per batch." },
      { status: 413 },
    );
  }

  const ordered = [...scans].sort(
    (a, b) =>
      new Date(a.deviceScannedAt).getTime() -
      new Date(b.deviceScannedAt).getTime(),
  );

  const results: {
    clientId?: string;
    token: string;
    result: string;
    message: string;
  }[] = [];

  // Sequential, not `Promise.all`. These compete for the same rows by design,
  // and firing them concurrently would make the device-clock ordering above
  // meaningless — the whole point is that the earliest scan wins.
  for (const s of ordered) {
    const outcome = await scanTicket({
      token: s.token,
      eventId,
      gateId: s.gateId ?? null,
      staffUserId: user.id,
      deviceScannedAt: new Date(s.deviceScannedAt),
      wasOffline: true,
    });
    results.push({
      clientId: s.clientId,
      token: s.token.slice(0, 12),
      result: outcome.result,
      message: outcome.message,
    });
  }

  const admitted = results.filter((r) => r.result === "VALID").length;
  return NextResponse.json({
    synced: results.length,
    admitted,
    conflicts: results.filter((r) => r.result === "ALREADY_SCANNED").length,
    results,
  });
}
