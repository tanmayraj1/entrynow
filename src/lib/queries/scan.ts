import "server-only";

import { db } from "@/lib/db";
import { isSessionScannable } from "@/lib/ist";

/**
 * What a scanner-staff user is allowed to see.
 *
 * Scoped by `StaffAssignment`, plus the organizer's own events — an organizer
 * turning up to their own gate should not have to assign themselves. Both
 * paths are re-checked inside `scanTicket`, so this only decides what the
 * picker *lists*.
 */
export async function listScannableEvents(userId: string) {
  const [assignments, owned] = await Promise.all([
    db.staffAssignment.findMany({
      where: { userId },
      select: {
        canOverride: true,
        gate: { select: { id: true, name: true, code: true } },
        event: {
          select: {
            id: true,
            title: true,
            status: true,
            gatesClosedAt: true,
            city: { select: { name: true } },
            venue: { select: { name: true } },
            sessions: {
              where: { isActive: true },
              orderBy: { startsAt: "asc" },
              select: { id: true, sequence: true, startsAt: true, endsAt: true },
            },
            gates: { select: { id: true, name: true, code: true } },
          },
        },
      },
    }),
    db.event.findMany({
      where: {
        organizer: { user: { id: userId } },
        status: { in: ["LIVE", "PAUSED"] },
      },
      select: {
        id: true,
        title: true,
        status: true,
        gatesClosedAt: true,
        city: { select: { name: true } },
        venue: { select: { name: true } },
        sessions: {
          where: { isActive: true },
          orderBy: { startsAt: "asc" },
          select: { id: true, sequence: true, startsAt: true, endsAt: true },
        },
        gates: { select: { id: true, name: true, code: true } },
      },
    }),
  ]);

  const now = new Date();
  const byId = new Map<
    string,
    {
      id: string;
      title: string;
      status: string;
      venueName: string;
      cityName: string;
      gatesClosedAt: Date | null;
      gates: { id: string; name: string; code: string }[];
      assignedGate: { id: string; name: string; code: string } | null;
      canOverride: boolean;
      liveSession: { id: string; sequence: number; endsAt: Date } | null;
      nextSessionAt: Date | null;
    }
  >();

  const add = (
    e: (typeof owned)[number],
    assignedGate: { id: string; name: string; code: string } | null,
    canOverride: boolean,
  ) => {
    const live = e.sessions.find((s) => isSessionScannable(s, now, 30)) ?? null;
    const upcoming = e.sessions.find((s) => s.startsAt > now) ?? null;
    const existing = byId.get(e.id);
    byId.set(e.id, {
      id: e.id,
      title: e.title,
      status: e.status,
      venueName: e.venue.name,
      cityName: e.city.name,
      gatesClosedAt: e.gatesClosedAt,
      gates: e.gates,
      // An organizer who is also assigned to a specific gate keeps that gate.
      assignedGate: assignedGate ?? existing?.assignedGate ?? null,
      canOverride: canOverride || (existing?.canOverride ?? false),
      liveSession: live
        ? { id: live.id, sequence: live.sequence, endsAt: live.endsAt }
        : null,
      nextSessionAt: upcoming?.startsAt ?? null,
    });
  };

  for (const e of owned) add(e, null, true);
  for (const a of assignments) add(a.event, a.gate, a.canOverride);

  // Tonight's gates first — that is what someone standing at one needs.
  return [...byId.values()].sort((a, b) => {
    if (Boolean(a.liveSession) !== Boolean(b.liveSession)) {
      return a.liveSession ? -1 : 1;
    }
    return (
      (a.nextSessionAt?.getTime() ?? Infinity) -
      (b.nextSessionAt?.getTime() ?? Infinity)
    );
  });
}

/** Live counters for the scanner's status strip. */
export async function getScanStats(eventId: string) {
  const [scanned, active, recent] = await Promise.all([
    db.ticket.count({ where: { eventId, status: "SCANNED" } }),
    db.ticket.count({ where: { eventId, status: "ACTIVE" } }),
    db.scanLog.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        result: true,
        createdAt: true,
        ticket: { select: { ticketNumber: true, attendeeName: true } },
        gate: { select: { code: true } },
      },
    }),
  ]);
  return { scanned, active, recent };
}
