import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Find a ticket by its printed number, for manual entry.
 *
 * Returns the `qrTokenId` so the operator's confirmation can go through the
 * ordinary `/api/scan` path — the manual route must not become a second,
 * softer way to admit someone. Every check in `scanTicket` still runs.
 *
 * Gated on the same staff assignment as scanning, and scoped to one event, so
 * this cannot be walked to enumerate ticket holders. It is a lookup for a
 * ticket someone is physically holding.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to scan." }, { status: 401 });
  }

  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId") ?? "";
  const ticketNumber = (url.searchParams.get("ticketNumber") ?? "")
    .trim()
    .toUpperCase();

  if (!eventId || !ticketNumber) {
    return NextResponse.json({ error: "Missing parameters." }, { status: 400 });
  }

  const [assignment, owned] = await Promise.all([
    db.staffAssignment.findFirst({
      where: { userId: user.id, eventId },
      select: { id: true },
    }),
    db.event.findFirst({
      where: { id: eventId, organizer: { user: { id: user.id } } },
      select: { id: true },
    }),
  ]);
  if (!assignment && !owned) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const ticket = await db.ticket.findFirst({
    // Both halves matter: the number alone would serve any event's ticket to
    // anyone rostered on any event.
    where: { ticketNumber, eventId },
    select: {
      qrTokenId: true,
      ticketNumber: true,
      attendeeName: true,
      status: true,
      tier: { select: { name: true } },
      session: { select: { sequence: true } },
    },
  });

  if (!ticket) {
    return NextResponse.json(
      { error: "No ticket with that number at this event." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ticket: {
      qrToken: ticket.qrTokenId,
      ticketNumber: ticket.ticketNumber,
      attendeeName: ticket.attendeeName,
      tierName: ticket.tier.name,
      status: ticket.status,
      sessionLabel: ticket.session ? `Night ${ticket.session.sequence}` : null,
    },
  });
}
