import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { StatusPill, Table, Td, Th, Tr } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/rbac";
import { getAdminEvent } from "@/lib/queries/admin/queries";
import { previewEventRefund } from "@/lib/refunds";
import { formatIstDate, formatIstTime } from "@/lib/ist";
import { inr } from "@/lib/money";
import { CancelEventForm, PauseControls } from "./event-controls";

export const metadata: Metadata = { title: "Event" };

export default async function AdminEventDetailPage({
  params,
}: PageProps<"/admin/events/[id]">) {
  await requireAdmin("SUPPORT");
  const { id } = await params;

  const event = await getAdminEvent(id);
  if (!event) notFound();

  // Computed before the button is rendered, not after it is clicked — the
  // dialog has to state the real cost of an irreversible action.
  const refundPreview =
    event.status === "CANCELLED" ? null : await previewEventRefund(id);

  const terminal = event.status === "CANCELLED" || event.status === "COMPLETED";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/admin/events"
          className="inline-flex items-center gap-1.5 text-[12px] font-bold text-ink-muted hover:text-ink mb-2"
        >
          <ArrowLeft size={14} strokeWidth={2.6} />
          All events
        </Link>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[20px] font-extrabold leading-tight">
            {event.title}
          </h1>
          <StatusPill status={event.status} />
        </div>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          <Link
            href={`/admin/organizers/${event.organizer.id}`}
            className="hover:text-primary transition-colors"
          >
            {event.organizer.name}
          </Link>{" "}
          · {event.venue.name}, {event.city.name} · {event._count.bookings}{" "}
          bookings · {event._count.tickets} tickets
        </p>
      </div>

      {event.cancelledAt && (
        <div className="rounded-[var(--radius-card)] border border-danger/25 bg-danger-tint px-4 py-3">
          <p className="text-[13px] font-extrabold text-danger-dark">
            Cancelled {formatIstDate(event.cancelledAt)}
          </p>
          <p className="text-[12.5px] font-semibold text-danger-dark/85 mt-0.5">
            {event.cancelReason}
          </p>
        </div>
      )}

      {event.pendingChanges !== null && (
        <div className="rounded-[var(--radius-card)] border border-status-warning-fg/25 bg-status-warning-bg px-4 py-3">
          <p className="text-[13px] font-extrabold text-status-warning-fg">
            An edit is awaiting review
          </p>
          <Link
            href="/admin/approvals"
            className="text-[12.5px] font-bold text-status-warning-fg underline"
          >
            Open the approvals queue
          </Link>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="bg-surface border border-border rounded-[var(--radius-card)] p-4 lg:p-5">
          <h2 className="text-[14.5px] font-extrabold mb-3.5">Sessions</h2>
          {event.sessions.length === 0 ? (
            <p className="text-[12.5px] font-semibold text-ink-muted">None.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {event.sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-baseline justify-between gap-3 text-[12.5px]"
                >
                  <span className="font-bold">Night {s.sequence}</span>
                  <span className="font-semibold text-ink-muted whitespace-nowrap">
                    {formatIstDate(s.startsAt)} · {formatIstTime(s.startsAt)} –{" "}
                    {formatIstTime(s.endsAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-surface border border-border rounded-[var(--radius-card)] p-4 lg:p-5">
          <h2 className="text-[14.5px] font-extrabold mb-3.5">Inventory</h2>
          <Table>
            <thead>
              <Tr>
                <Th>Tier</Th>
                <Th numeric>Price</Th>
                <Th numeric>Sold</Th>
                <Th numeric>Total</Th>
              </Tr>
            </thead>
            <tbody>
              {event.tiers.map((t) => (
                <Tr key={t.id}>
                  <Td>{t.name}</Td>
                  <Td numeric>{inr(t.pricePaise)}</Td>
                  <Td numeric>{t.quantitySold}</Td>
                  <Td numeric>{t.quantityTotal}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </section>
      </div>

      <section className="bg-surface border border-border rounded-[var(--radius-card)] p-4 lg:p-5">
        <h2 className="text-[14.5px] font-extrabold mb-1">Take it down</h2>
        <p className="text-[11.5px] font-semibold text-ink-muted mb-4">
          There is no hard delete. Tickets, payments and ledger rows point at
          this event, and those rows are the evidence of what is owed to whom.
        </p>

        {terminal ? (
          <p className="text-[12.5px] font-semibold text-ink-muted">
            This event is {event.status.toLowerCase()} — a terminal state with no
            outgoing transitions.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            <PauseControls eventId={event.id} status={event.status} />

            {refundPreview && (
              <div className="pt-5 border-t border-divider">
                <p className="flex items-start gap-2 text-[12.5px] font-extrabold text-danger mb-2">
                  <AlertTriangle
                    size={15}
                    strokeWidth={2.4}
                    className="shrink-0 mt-px"
                  />
                  Cancelling refunds {refundPreview.bookingCount} booking
                  {refundPreview.bookingCount === 1 ? "" : "s"} —{" "}
                  {inr(refundPreview.refundPaise)} to{" "}
                  {refundPreview.attendeeCount} attendee
                  {refundPreview.attendeeCount === 1 ? "" : "s"}, including the
                  booking fee.
                </p>
                <p className="text-[11.5px] font-semibold text-ink-muted mb-3.5">
                  Refunds land in attendee wallets instantly and{" "}
                  {refundPreview.ticketCount} live ticket
                  {refundPreview.ticketCount === 1 ? "" : "s"} are voided. This
                  cannot be undone.
                </p>
                <CancelEventForm eventId={event.id} title={event.title} />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
