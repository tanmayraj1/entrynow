import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { manifestWindowOpensAt } from "@/lib/ist";

/**
 * The offline manifest (spec F2.1).
 *
 * A ground with 8,000 people has no usable mobile data by 8:30 PM, so the
 * scanner pre-downloads the night's valid tokens and keeps admitting without a
 * network. Two decisions shape what this returns:
 *
 * **It opens 30 minutes before gates, not earlier.** A manifest is a list of
 * every valid token for the night — the most sensitive artefact the platform
 * produces. Handing it out days ahead multiplies the windows in which a device
 * can be lost with it. `manifestWindowOpensAt` is the gate.
 *
 * **It ships `qrTokenId`s, never signed JWTs.** A leaked manifest full of
 * signed tokens would be a stack of forgeable tickets. Token *ids* are only
 * useful against this event's own turnstile, which already refuses a second
 * use of any of them.
 *
 * `since` makes the 60-second poll a delta rather than a re-download of
 * everything.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to sync." }, { status: 401 });
  }

  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId") ?? "";
  const sinceRaw = url.searchParams.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : null;

  const [assignment, owns] = await Promise.all([
    db.staffAssignment.findFirst({
      where: { userId: user.id, eventId },
      select: { id: true },
    }),
    db.event.findFirst({
      where: { id: eventId, organizer: { user: { id: user.id } } },
      select: { id: true },
    }),
  ]);
  // Same 404-not-403 reasoning as the portals: a distinct "forbidden" tells an
  // attacker the event id was right.
  if (!assignment && !owns) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      status: true,
      gatesClosedAt: true,
      sessions: {
        where: { isActive: true },
        orderBy: { startsAt: "asc" },
        select: { id: true, sequence: true, startsAt: true, endsAt: true },
      },
      gates: { select: { id: true, name: true, code: true } },
    },
  });
  if (!event) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const now = new Date();
  const next = event.sessions.find((s) => s.endsAt >= now) ?? event.sessions.at(-1);
  if (!next) {
    return NextResponse.json({ error: "No sessions scheduled." }, { status: 409 });
  }

  const opensAt = manifestWindowOpensAt(next.startsAt);
  if (now < opensAt) {
    return NextResponse.json(
      {
        error: "Manifest not open yet.",
        opensAt: opensAt.toISOString(),
        sessionStartsAt: next.startsAt.toISOString(),
      },
      { status: 425 },
    );
  }

  const tickets = await db.ticket.findMany({
    where: {
      eventId,
      status: { in: ["ACTIVE", "SCANNED"] },
      // A season pass has no sessionId and is valid every night, so it must be
      // in every night's manifest.
      OR: [{ sessionId: next.id }, { sessionId: null }],
      ...(since ? { updatedAt: { gt: since } } : {}),
    },
    select: {
      qrTokenId: true,
      ticketNumber: true,
      attendeeName: true,
      status: true,
      sessionId: true,
      updatedAt: true,
      tier: { select: { name: true, isSeasonPass: true } },
    },
    take: 20_000,
  });

  return NextResponse.json(
    {
      event: {
        id: event.id,
        title: event.title,
        status: event.status,
        gatesClosedAt: event.gatesClosedAt,
      },
      session: {
        id: next.id,
        sequence: next.sequence,
        startsAt: next.startsAt,
        endsAt: next.endsAt,
      },
      gates: event.gates,
      // The client keeps this and sends it back as `since` next poll.
      syncedAt: now.toISOString(),
      delta: Boolean(since),
      tickets: tickets.map((t) => ({
        qrTokenId: t.qrTokenId,
        ticketNumber: t.ticketNumber,
        attendeeName: t.attendeeName,
        status: t.status,
        tierName: t.tier.name,
        isSeasonPass: t.tier.isSeasonPass,
      })),
    },
    // Never cached by a proxy — it is per-staff-member and it is a list of
    // every valid token for the night.
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
