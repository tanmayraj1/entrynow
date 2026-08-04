import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { scanTicket } from "@/lib/scan/engine";

/**
 * One scan.
 *
 * The staff user comes from the **session cookie**, never from the body — a
 * scanner that accepted a `staffUserId` in its payload would let anyone admit
 * anyone. `scanTicket` re-checks the assignment against the event regardless.
 *
 * Always 200, even for a refused ticket. The gate's answer is in the body:
 * a non-2xx would make the PWA's offline queue treat a legitimate
 * ALREADY_SCANNED as a network failure and retry it forever.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { result: "NOT_AUTHORIZED", message: "Sign in to scan." },
      { status: 401 },
    );
  }

  let body: {
    token?: string;
    eventId?: string;
    gateId?: string | null;
    deviceScannedAt?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { result: "INVALID", message: "Malformed request." },
      { status: 400 },
    );
  }

  if (!body.token || !body.eventId) {
    return NextResponse.json(
      { result: "INVALID", message: "Missing token or event." },
      { status: 400 },
    );
  }

  const outcome = await scanTicket({
    token: body.token,
    eventId: body.eventId,
    gateId: body.gateId ?? null,
    staffUserId: user.id,
    deviceScannedAt: body.deviceScannedAt ? new Date(body.deviceScannedAt) : null,
    wasOffline: false,
  });

  return NextResponse.json(outcome);
}
