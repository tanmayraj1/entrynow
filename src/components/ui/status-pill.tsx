import { cn } from "@/lib/cn";

/**
 * Status chip for tables and cards. The colour pairs resolve from the active
 * theme, so Confirmed reads teal-green in the marketplace and pink in the
 * dashboards exactly as the two palettes specify — without a per-surface
 * component.
 */
export type StatusTone =
  | "confirmed"
  | "pending"
  | "cancelled"
  | "success"
  | "warning"
  | "danger";

const tones: Record<StatusTone, string> = {
  confirmed: "bg-status-confirmed-bg text-status-confirmed-fg",
  pending: "bg-status-pending-bg text-status-pending-fg",
  cancelled: "bg-status-cancelled-bg text-status-cancelled-fg",
  success: "bg-status-success-bg text-status-success-fg",
  warning: "bg-status-warning-bg text-status-warning-fg",
  danger: "bg-status-danger-bg text-status-danger-fg",
};

/** Maps every domain status the spec defines onto a visual tone. */
export const STATUS_TONE: Record<string, StatusTone> = {
  // Booking (spec B2)
  CONFIRMED: "confirmed",
  PENDING_PAYMENT: "pending",
  EXPIRED: "cancelled",
  FAILED: "danger",
  CANCELLED_BY_USER: "cancelled",
  CANCELLED_BY_ORGANIZER: "cancelled",
  CANCELLED_BY_ADMIN: "cancelled",
  REFUNDED: "success",
  // Ticket (spec B3)
  ACTIVE: "confirmed",
  SCANNED: "success",
  CANCELLED: "cancelled",
  TRANSFERRED: "pending",
  // Event (spec B1)
  DRAFT: "cancelled",
  IN_REVIEW: "pending",
  REJECTED: "danger",
  LIVE: "success",
  PAUSED: "warning",
  COMPLETED: "confirmed",
  // Organizer (spec B5). The three onboarding states read as "cancelled" —
  // the neutral grey — rather than "pending" amber: an organizer who has not
  // finished signing up is not waiting on *us*, and amber in the admin KYC
  // queue must mean "your turn".
  SIGNUP: "cancelled",
  DETAILS_SUBMITTED: "cancelled",
  FEE_PAID: "cancelled",
  VERIFIED: "success",
  KYC_IN_REVIEW: "pending",
  KYC_REJECTED: "danger",
  SUSPENDED: "danger",
  // Payout (spec B6)
  ACCRUING: "pending",
  SCHEDULED: "pending",
  PROCESSING: "warning",
  PAID: "success",
  FROZEN: "danger",
  // Dispute (spec G1). All three resolutions are terminal, but they are not
  // interchangeable: a refund moved money, a rejection did not, and a partial
  // did both — so they must not share one colour.
  OPEN: "danger",
  INVESTIGATING: "warning",
  RESOLVED_REFUND: "success",
  RESOLVED_REJECT: "cancelled",
  RESOLVED_PARTIAL: "confirmed",
};

/**
 * "CANCELLED_BY_ORGANIZER" -> "Cancelled by organizer"
 *
 * Acronyms are restored afterwards. Sentence-casing the whole string turned
 * `KYC_IN_REVIEW` into "Kyc in review", which is the sort of thing that makes
 * an otherwise careful screen look machine-generated — and it sat on the
 * approvals queue, the first admin screen anyone opens.
 */
const ACRONYMS = /\b(kyc|gst|upi|qr|id|sms|gmv)\b/gi;

export function humanizeStatus(status: string): string {
  const s = status.replace(/_/g, " ").toLowerCase();
  return (s.charAt(0).toUpperCase() + s.slice(1)).replace(ACRONYMS, (m) =>
    m.toUpperCase(),
  );
}

export function StatusPill({
  status,
  tone,
  label,
  className,
}: {
  status?: string;
  tone?: StatusTone;
  label?: string;
  className?: string;
}) {
  const resolved = tone ?? (status ? STATUS_TONE[status] : undefined) ?? "pending";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1",
        "text-[11px] font-extrabold whitespace-nowrap",
        tones[resolved],
        className,
      )}
    >
      {label ?? (status ? humanizeStatus(status) : "")}
    </span>
  );
}
