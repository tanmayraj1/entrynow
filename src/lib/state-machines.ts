import type {
  DisputeStatus,
  EventStatus,
  OrganizerStatus,
  PayoutStatus,
} from "@/generated/prisma";

/**
 * The state machines from spec Part B, as data (invariant I5: no state
 * transition happens outside the defined machines).
 *
 * Written as explicit adjacency maps rather than scattered `if` checks in the
 * routes that perform each transition. The point is that the *illegal* edges
 * are as visible as the legal ones — you can read this file and see that
 * CANCELLED has no outgoing edges at all, which is a business rule (a
 * cancellation has already refunded money and cannot be walked back) that no
 * amount of reading the admin routes would tell you.
 *
 * Every status write in the portals goes through `assertTransition`, in the
 * same transaction as its `writeAudit` row.
 */

// ---------------------------------------------------------------------------
// Event (spec B1)
// ---------------------------------------------------------------------------

const EVENT: Record<EventStatus, EventStatus[]> = {
  DRAFT: ["IN_REVIEW"],
  IN_REVIEW: ["LIVE", "REJECTED"],
  // A rejected event is edited and resubmitted; it does not go straight live.
  REJECTED: ["DRAFT", "IN_REVIEW"],
  // IN_REVIEW from LIVE is the pendingChanges re-review path: the event stays
  // BOOKABLE at its old values throughout (B1.editReview).
  LIVE: ["PAUSED", "IN_REVIEW", "COMPLETED", "CANCELLED"],
  PAUSED: ["LIVE", "CANCELLED", "COMPLETED"],
  // Terminal. A completed event's money is settling; a cancelled event has
  // already triggered refunds. Neither may be reopened.
  COMPLETED: [],
  CANCELLED: [],
};

// ---------------------------------------------------------------------------
// OrganizerProfile (spec B5)
// ---------------------------------------------------------------------------

const ORGANIZER: Record<OrganizerStatus, OrganizerStatus[]> = {
  SIGNUP: ["DETAILS_SUBMITTED"],
  DETAILS_SUBMITTED: ["FEE_PAID"],
  FEE_PAID: ["KYC_IN_REVIEW"],
  KYC_IN_REVIEW: ["VERIFIED", "KYC_REJECTED"],
  // Rejected KYC is re-submittable — this is a correction loop, not a ban.
  KYC_REJECTED: ["KYC_IN_REVIEW"],
  VERIFIED: ["SUSPENDED"],
  // Reinstatement returns to VERIFIED; suspension is reversible, unlike an
  // event cancellation, because no money has been moved by it.
  SUSPENDED: ["VERIFIED"],
};

// ---------------------------------------------------------------------------
// Payout (spec B6) and Dispute (spec G1)
// ---------------------------------------------------------------------------

const PAYOUT: Record<PayoutStatus, PayoutStatus[]> = {
  ACCRUING: ["SCHEDULED", "FROZEN"],
  SCHEDULED: ["PROCESSING", "FROZEN"],
  PROCESSING: ["PAID", "FAILED", "FROZEN"],
  // A failed payout is retried, not abandoned.
  FAILED: ["SCHEDULED", "FROZEN"],
  PAID: [],
  // Unfreezing returns to `statusBeforeFreeze`, so every prior state is legal
  // here; the column is what remembers which one.
  FROZEN: ["ACCRUING", "SCHEDULED", "PROCESSING", "FAILED"],
};

const DISPUTE: Record<DisputeStatus, DisputeStatus[]> = {
  OPEN: ["INVESTIGATING", "RESOLVED_REJECT"],
  INVESTIGATING: ["RESOLVED_REFUND", "RESOLVED_REJECT", "RESOLVED_PARTIAL"],
  RESOLVED_REFUND: [],
  RESOLVED_REJECT: [],
  RESOLVED_PARTIAL: [],
};

// ---------------------------------------------------------------------------

const MACHINES = {
  event: EVENT,
  organizer: ORGANIZER,
  payout: PAYOUT,
  dispute: DISPUTE,
} as const;

export type MachineName = keyof typeof MACHINES;

type StatusOf<M extends MachineName> = keyof (typeof MACHINES)[M] & string;

export function canTransition<M extends MachineName>(
  machine: M,
  from: StatusOf<M>,
  to: StatusOf<M>,
): boolean {
  const table = MACHINES[machine] as Record<string, string[]>;
  return table[from]?.includes(to) ?? false;
}

/** The states a given state may legally move to — for rendering the controls. */
export function allowedTransitions<M extends MachineName>(
  machine: M,
  from: StatusOf<M>,
): StatusOf<M>[] {
  const table = MACHINES[machine] as Record<string, string[]>;
  return (table[from] ?? []) as StatusOf<M>[];
}

export class IllegalTransitionError extends Error {
  constructor(
    readonly machine: MachineName,
    readonly from: string,
    readonly to: string,
  ) {
    super(
      `Illegal ${machine} transition ${from} → ${to}. ` +
        `Allowed from ${from}: ${
          (MACHINES[machine] as Record<string, string[]>)[from]?.join(", ") ||
          "(terminal state — none)"
        }.`,
    );
    this.name = "IllegalTransitionError";
  }
}

/**
 * Throws on an illegal edge.
 *
 * A throw, not a `false` return, because these run inside Prisma interactive
 * transactions where returning a value COMMITS the transaction (D-023) — a
 * soft failure here would persist the very half-state the machine exists to
 * prevent.
 */
export function assertTransition<M extends MachineName>(
  machine: M,
  from: StatusOf<M>,
  to: StatusOf<M>,
): void {
  if (!canTransition(machine, from, to)) {
    throw new IllegalTransitionError(machine, from, to);
  }
}

// ---------------------------------------------------------------------------
// Deletion policy
// ---------------------------------------------------------------------------

/**
 * Whether an event may be hard-deleted.
 *
 * Only a DRAFT that never went live. Anything past DRAFT has `Ticket`,
 * `Payment` and `LedgerEntry` rows pointing at it, and those rows are the
 * evidence of what was owed to whom — deleting the event either fails on the
 * foreign keys or orphans the money.
 *
 * The alternative for a bad event is `event.pause` (instant, tickets stay
 * valid), `event.cancel` (irreversible, triggers refunds) or suspending the
 * organizer (cascades to everything they run).
 */
export function canHardDeleteEvent(event: {
  status: EventStatus;
  publishedAt: Date | null;
}): boolean {
  return event.status === "DRAFT" && event.publishedAt === null;
}
