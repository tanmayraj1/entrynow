import "server-only";

import type { ScanResult } from "@/generated/prisma";
import { db } from "@/lib/db";
import { cuidish } from "@/lib/booking/inventory";
import { isSessionScannable } from "@/lib/ist";
import { parseScannedToken } from "@/lib/qr";

/**
 * The gate.
 *
 * Two properties matter more than everything else in this file:
 *
 * **Invariant I2 — a ticket becomes SCANNED at most once, ever.** That is a
 * single guarded UPDATE whose `rowCount` is the answer:
 *
 *     UPDATE tickets SET status='SCANNED' … WHERE "qrTokenId"=$1 AND status='ACTIVE'
 *
 * The database evaluates the precondition and performs the write under one row
 * lock, so two scanners hitting the same QR at two gates in the same
 * millisecond cannot both win. `rowCount === 0` is not an error — it is the
 * branch that re-reads to say ALREADY_SCANNED (and when, and at which gate).
 * Read-then-write in application code would reintroduce exactly the race the
 * turnstile exists to prevent.
 *
 * **Spec F1.3's check order, first failure wins.** The order is not cosmetic;
 * it decides what the person on the gate is told, and the most actionable
 * reason must win. NOT_AUTHORIZED before everything else, because a staff
 * member scanning at the wrong event should be told *that* rather than
 * "invalid ticket" — otherwise they spend the evening arguing with attendees
 * whose tickets are fine.
 *
 *   NOT_AUTHORIZED → WRONG_SESSION → GATES_CLOSED → CANCELLED → EXPIRED →
 *   season-pass path → atomic claim
 *
 * Every attempt writes a `ScanLog` row, failures included. The failures are
 * the interesting ones: a burst of INVALID at one gate is how counterfeit
 * tickets announce themselves.
 */

export interface ScanInput {
  /** Raw QR contents — a signed JWS, or a legacy bare token. */
  token: string;
  eventId: string;
  gateId?: string | null;
  staffUserId: string;
  /** Device clock. Present for a replayed offline scan (spec F2.3). */
  deviceScannedAt?: Date | null;
  wasOffline?: boolean;
}

export interface ScanOutcome {
  result: ScanResult;
  /** Gate-facing message. Short — it is read at arm's length in the dark. */
  message: string;
  ticket?: {
    ticketNumber: string;
    attendeeName: string;
    tierName: string;
    sessionLabel: string | null;
    isSeasonPass: boolean;
  };
  /** Set on ALREADY_SCANNED, so the gate can say where and when. */
  previousScan?: { at: Date; gateName: string | null };
}

export async function scanTicket(input: ScanInput): Promise<ScanOutcome> {
  const now = new Date();

  // --- 0. Staff authorisation ------------------------------------------------
  // First, and deliberately before the token is even parsed: an unauthorised
  // device must learn nothing about whether a token is real.
  const assignment = await db.staffAssignment.findFirst({
    where: { userId: input.staffUserId, eventId: input.eventId },
    select: { id: true, gateId: true, canOverride: true },
  });
  const organiserOwns = await db.event.findFirst({
    where: {
      id: input.eventId,
      organizer: { user: { id: input.staffUserId } },
    },
    select: { id: true },
  });
  if (!assignment && !organiserOwns) {
    await logScan(input, "NOT_AUTHORIZED", null, null);
    return {
      result: "NOT_AUTHORIZED",
      message: "You are not on the staff list for this event.",
    };
  }

  // --- 1. Token ---------------------------------------------------------------
  const parsed = await parseScannedToken(input.token);
  if (parsed.kind === "invalid") {
    await logScan(input, parsed.reason === "EXPIRED" ? "EXPIRED" : "INVALID", null, null);
    return {
      result: parsed.reason === "EXPIRED" ? "EXPIRED" : "INVALID",
      message:
        parsed.reason === "EXPIRED"
          ? "This ticket has expired."
          : parsed.reason === "BAD_SIGNATURE"
            ? "Not a valid Entry Now ticket."
            : "Could not read that code.",
    };
  }

  // A signed token names its own event, so a ticket for the wrong event is
  // refused before any query.
  if (parsed.kind === "signed" && parsed.eventId !== input.eventId) {
    await logScan(input, "INVALID", null, null);
    return {
      result: "INVALID",
      message: "This ticket is for a different event.",
    };
  }

  const ticket = await db.ticket.findUnique({
    where: { qrTokenId: parsed.qrTokenId },
    select: {
      id: true,
      ticketNumber: true,
      attendeeName: true,
      status: true,
      eventId: true,
      sessionId: true,
      scannedAt: true,
      scannedGate: { select: { name: true } },
      tier: { select: { name: true, isSeasonPass: true } },
      session: {
        select: { id: true, sequence: true, startsAt: true, endsAt: true },
      },
      event: {
        select: {
          id: true,
          status: true,
          gatesClosedAt: true,
          sessions: {
            where: { isActive: true },
            orderBy: { startsAt: "asc" },
            select: { id: true, sequence: true, startsAt: true, endsAt: true },
          },
        },
      },
    },
  });

  if (!ticket || ticket.eventId !== input.eventId) {
    await logScan(input, "INVALID", null, null);
    return { result: "INVALID", message: "Not a ticket for this event." };
  }

  const info = {
    ticketNumber: ticket.ticketNumber,
    attendeeName: ticket.attendeeName,
    tierName: ticket.tier.name,
    sessionLabel: ticket.session ? `Night ${ticket.session.sequence}` : null,
    isSeasonPass: ticket.tier.isSeasonPass,
  };

  // --- 2. WRONG_SESSION -------------------------------------------------------
  // A session-bound ticket is only good during its own window. `isSessionScannable`
  // is an *instant* comparison against [start, end], never a date-key one — a
  // Garba night that runs 8 PM to 1 AM must keep admitting after midnight
  // (D-012, edge case I8).
  const graceMinutes = 30;
  if (ticket.session) {
    if (!isSessionScannable(ticket.session, now, graceMinutes)) {
      await logScan(input, "WRONG_SESSION", ticket.id, ticket.sessionId);
      return {
        result: "WRONG_SESSION",
        message: `This is a Night ${ticket.session.sequence} ticket.`,
        ticket: info,
      };
    }
  }

  // A season pass has no session of its own, so it needs *some* session to be
  // running right now — otherwise it would admit at 4pm on a rest day.
  const openSession =
    ticket.session ??
    ticket.event.sessions.find((s) => isSessionScannable(s, now, graceMinutes)) ??
    null;

  if (!openSession) {
    await logScan(input, "WRONG_SESSION", ticket.id, null);
    return {
      result: "WRONG_SESSION",
      message: "No session is running right now.",
      ticket: info,
    };
  }

  // --- 3. GATES_CLOSED --------------------------------------------------------
  if (ticket.event.gatesClosedAt) {
    await logScan(input, "GATES_CLOSED", ticket.id, openSession.id);
    return {
      result: "GATES_CLOSED",
      message: "Gates are closed for this event.",
      ticket: info,
    };
  }

  // --- 4. CANCELLED -----------------------------------------------------------
  if (ticket.status === "CANCELLED" || ticket.event.status === "CANCELLED") {
    await logScan(input, "CANCELLED", ticket.id, openSession.id);
    return {
      result: "CANCELLED",
      message: "This ticket was cancelled and refunded.",
      ticket: info,
    };
  }

  // --- 5. EXPIRED / TRANSFERRED -----------------------------------------------
  if (ticket.status === "EXPIRED" || ticket.status === "TRANSFERRED") {
    await logScan(input, "EXPIRED", ticket.id, openSession.id);
    return {
      result: "EXPIRED",
      message:
        ticket.status === "TRANSFERRED"
          ? "This ticket was transferred — the new holder has the live QR."
          : "This ticket has expired.",
      ticket: info,
    };
  }

  // --- 6. Season pass: once per night ----------------------------------------
  // A season pass is session-agnostic, so it must NOT flip to SCANNED — it has
  // eight more nights to admit. Uniqueness moves to `(ticketId, sessionId)`
  // and the claim becomes an INSERT … ON CONFLICT DO NOTHING (spec C7).
  if (ticket.tier.isSeasonPass) {
    const claimed = await db.$transaction(async (tx) => {
      const rows = await tx.$executeRaw`
        INSERT INTO session_scans (id, "ticketId", "sessionId", "gateId", "scannedAt", "scannedByUserId")
        VALUES (
          ${cuidish()}, ${ticket.id}, ${openSession.id},
          ${input.gateId ?? null}, ${input.deviceScannedAt ?? now}, ${input.staffUserId}
        )
        ON CONFLICT ("ticketId", "sessionId") DO NOTHING
      `;
      return rows === 1;
    });

    if (!claimed) {
      const prior = await db.sessionScan.findFirst({
        where: { ticketId: ticket.id, sessionId: openSession.id },
        select: { scannedAt: true, gate: { select: { name: true } } },
      });
      await logScan(input, "ALREADY_SCANNED", ticket.id, openSession.id);
      return {
        result: "ALREADY_SCANNED",
        message: "Season pass already used tonight.",
        ticket: info,
        previousScan: prior
          ? { at: prior.scannedAt, gateName: prior.gate?.name ?? null }
          : undefined,
      };
    }

    await logScan(input, "VALID", ticket.id, openSession.id);
    return {
      result: "VALID",
      message: `Season pass — Night ${openSession.sequence}`,
      ticket: info,
    };
  }

  // --- 7. The atomic claim (invariant I2) -------------------------------------
  const won = await db.$transaction(async (tx) => {
    const rows = await tx.$executeRaw`
      UPDATE tickets
         SET status            = 'SCANNED',
             "scannedAt"       = ${input.deviceScannedAt ?? now},
             "scannedGateId"   = ${input.gateId ?? null},
             "scannedByUserId" = ${input.staffUserId},
             "updatedAt"       = NOW()
       WHERE "qrTokenId" = ${parsed.qrTokenId}
         AND status = 'ACTIVE'
    `;
    return rows === 1;
  });

  if (!won) {
    // Lost the race, or the QR was already used. Re-read to say *when* and
    // *where* — "already scanned" without that is unarguable at a gate.
    const prior = await db.ticket.findUnique({
      where: { qrTokenId: parsed.qrTokenId },
      select: { scannedAt: true, scannedGate: { select: { name: true } } },
    });
    await logScan(input, "ALREADY_SCANNED", ticket.id, openSession.id);

    // A replayed offline scan that lost to a different gate is the accepted
    // risk of F2.2 made visible, rather than silently swallowed.
    if (input.wasOffline && prior?.scannedAt) {
      await recordConflict({
        ticketId: ticket.id,
        eventId: ticket.eventId,
        winningGateId: null,
        losingGateId: input.gateId ?? null,
        winningScanAt: prior.scannedAt,
        losingScanAt: input.deviceScannedAt ?? now,
      });
    }

    return {
      result: "ALREADY_SCANNED",
      message: "Already scanned.",
      ticket: info,
      previousScan: prior?.scannedAt
        ? { at: prior.scannedAt, gateName: prior.scannedGate?.name ?? null }
        : undefined,
    };
  }

  await logScan(input, "VALID", ticket.id, openSession.id);
  return {
    result: "VALID",
    message: openSession ? `Night ${openSession.sequence}` : "Admitted",
    ticket: info,
  };
}

/**
 * Every attempt, including every failure.
 *
 * Best-effort: a logging failure must never be the thing that turns away a
 * valid ticket at a gate. The turnstile decision has already been made and
 * committed by the time this runs.
 */
async function logScan(
  input: ScanInput,
  result: ScanResult,
  ticketId: string | null,
  sessionId: string | null,
): Promise<void> {
  try {
    await db.scanLog.create({
      data: {
        id: cuidish(),
        ticketId,
        eventId: input.eventId,
        sessionId,
        gateId: input.gateId ?? null,
        staffUserId: input.staffUserId,
        result,
        wasOffline: input.wasOffline ?? false,
        deviceScannedAt: input.deviceScannedAt ?? null,
        // The raw token is truncated: a full signed JWS in a widely-read table
        // is a replayable credential sitting in the logs.
        rawToken: input.token.slice(0, 24),
      },
    });
  } catch {
    // Swallowed on purpose — see the doc comment.
  }
}

async function recordConflict(args: {
  ticketId: string;
  eventId: string;
  winningGateId: string | null;
  losingGateId: string | null;
  winningScanAt: Date;
  losingScanAt: Date;
}): Promise<void> {
  try {
    await db.scanConflict.create({ data: { id: cuidish(), ...args } });
  } catch {
    // Same reasoning as logScan.
  }
}
