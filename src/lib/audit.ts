import "server-only";

import { headers } from "next/headers";
import { Prisma } from "@/generated/prisma";
import { cuidish, type Tx } from "@/lib/booking/inventory";

/**
 * The audit trail (invariant I6, spec A1.7).
 *
 * Every admin or organizer mutation writes one row here with before/after JSON.
 * `scripts/audit.ts` check A13 fails the build if a portal server action
 * mutates without calling this, so the invariant is enforced rather than
 * remembered.
 *
 * **`tx` is the first parameter on purpose.** The audit row must be written
 * inside the same transaction as the change it describes, so the two commit or
 * roll back together. Writing it afterwards, outside the transaction, produces
 * exactly the two failure modes an audit trail exists to prevent: a change with
 * no record when the audit write fails, and a record of a change that never
 * happened when the transaction rolls back.
 *
 * The `AuditLog` columns `actorType`, `action` and `entityType` are free-text
 * in the schema, so the vocabulary lives here as string unions — the database
 * cannot stop a typo, but the compiler can.
 */

export type AuditActorType = "USER" | "ORGANIZER" | "ADMIN" | "SYSTEM";

export type AuditEntity =
  | "Event"
  | "EventSession"
  | "TicketTier"
  | "Gate"
  | "OrganizerProfile"
  | "Booking"
  | "Ticket"
  | "Refund"
  | "Payout"
  | "Promo"
  | "Dispute"
  | "Announcement"
  | "StaffAssignment"
  | "Banner"
  | "FeaturedSlot"
  | "Category"
  | "Festival"
  | "City"
  | "Locality"
  | "ConfigSetting"
  | "AdminRole";

export type AuditAction =
  // Event lifecycle
  | "event.create"
  | "event.update"
  | "event.submit"
  | "event.approve"
  | "event.reject"
  | "event.publish"
  | "event.pause"
  | "event.resume"
  | "event.cancel"
  | "event.delete_draft"
  | "event.pending_changes_apply"
  | "event.gates_closed"
  // Organizer lifecycle
  | "organizer.details_submit"
  | "organizer.plan_purchase"
  | "organizer.kyc_submit"
  | "organizer.kyc_approve"
  | "organizer.kyc_reject"
  | "organizer.suspend"
  | "organizer.reinstate"
  // Money
  | "payout.approve"
  | "payout.mark_paid"
  | "payout.freeze"
  | "payout.unfreeze"
  | "refund.issue"
  // Content and config
  | "promo.create"
  | "promo.update"
  | "promo.deactivate"
  | "announcement.send"
  | "staff.assign"
  | "staff.revoke"
  | "dispute.open"
  | "dispute.update"
  | "dispute.resolve"
  | "cms.create"
  | "cms.update"
  | "cms.deactivate"
  | "config.update"
  | "review.hide";

export interface AuditInput {
  actorId: string | null;
  actorType: AuditActorType;
  action: AuditAction;
  entityType: AuditEntity;
  entityId: string;
  /** State before the change. `null` for a create. */
  before?: unknown;
  /** State after the change. `null` for a delete. */
  after?: unknown;
  ip?: string | null;
}

export async function writeAudit(tx: Tx, input: AuditInput): Promise<void> {
  await tx.auditLog.create({
    data: {
      id: cuidish(),
      actorId: input.actorId,
      actorType: input.actorType,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: toJson(input.before),
      after: toJson(input.after),
      ip: input.ip ?? null,
    },
  });
}

/**
 * Narrow an object to the fields that actually changed.
 *
 * An audit row that dumps the whole record makes a real diff unreadable and
 * quietly stores things that should not be duplicated — bank account numbers,
 * KYC document URLs. Pass the field list you mean to record.
 */
export function pick<T extends object, K extends keyof T>(
  obj: T | null | undefined,
  keys: readonly K[],
): Pick<T, K> | null {
  if (!obj) return null;
  const out = {} as Pick<T, K>;
  for (const k of keys) out[k] = obj[k];
  return out;
}

/**
 * The caller's IP, for the audit row. Never throws — an audit write must not
 * be the thing that fails a mutation.
 */
export async function requestIp(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Field names never copied into an audit row.
 *
 * The audit log is append-only, long-lived and readable by every SUPER admin.
 * Duplicating KYC and banking PII into it creates a second, wider-read copy of
 * the most sensitive data in the system, for no investigative benefit — that a
 * bank account *changed* is the auditable fact; what it changed to lives on the
 * profile.
 */
const REDACT = new Set([
  "panNumber",
  "gstNumber",
  "panDocUrl",
  "gstDocUrl",
  "bankProofUrl",
  "bankAccountNumber",
  "bankIfsc",
  "bankAccountName",
  "passwordHash",
  "tokenHash",
  "qrTokenId",
]);

/**
 * A nullable Prisma `Json` column does not take a JS `null`.
 *
 * `Prisma.DbNull` writes a SQL NULL — "there was no before state" — whereas
 * `Prisma.JsonNull` would write the JSON value `null`, which reads back as a
 * recorded value that happened to be null. For an audit trail those mean
 * genuinely different things, and DbNull is the one we want.
 *
 * Two Prisma types need converting on the way in, and they fail *differently*:
 *
 *   - **BigInt** (`Payout.amountPaise`, `PayoutItem.grossPaise|netPaise`) makes
 *     `JSON.stringify` throw outright. Loud, and easy to catch.
 *   - **Decimal** (`commissionPctOverride`, `ratingAvg`, `refundPct`) does NOT
 *     throw. It serialises to its internal `{s,e,d}` representation, so the
 *     audit row silently records `{"s":1,"e":0,"d":[6]}` instead of `6`. That
 *     is the dangerous one: no error, just a corrupted record discovered
 *     whenever someone finally reads it.
 */
function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === undefined || value === null) return Prisma.DbNull;
  return JSON.parse(
    // A `function`, not an arrow, and it reads `this[key]` rather than the
    // `v` argument. `JSON.stringify` calls a value's own `toJSON()` BEFORE
    // handing it to the replacer, and `Prisma.Decimal.toJSON()` returns a
    // *string* — so by the time `v` arrives, `6.00` is already `"6"` and the
    // `toNumber` branch below can never fire. `this[key]` is the raw value,
    // pre-`toJSON`, which is the only place the real type is still visible.
    JSON.stringify(value, function (this: Record<string, unknown>, key, v) {
      const raw = this?.[key] ?? v;
      if (REDACT.has(key)) return raw == null ? raw : "[redacted]";
      if (typeof raw === "bigint") return Number(raw);
      // Decimal exposes `toNumber`; duck-typing keeps the runtime class out of
      // a module that is otherwise type-only.
      if (
        raw &&
        typeof raw === "object" &&
        typeof (raw as { toNumber?: unknown }).toNumber === "function"
      ) {
        return (raw as { toNumber: () => number }).toNumber();
      }
      return v;
    }),
  ) as Prisma.InputJsonValue;
}
