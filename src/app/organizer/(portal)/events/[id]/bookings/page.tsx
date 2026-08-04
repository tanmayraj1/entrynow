import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Ticket } from "lucide-react";
import {
  EmptyState,
  Pagination,
  StatusPill,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { requireOrganizer } from "@/lib/auth/rbac";
import {
  listEventBookings,
} from "@/lib/queries/organizer/events";
import { findOwnedEvent } from "@/lib/queries/organizer/scope";
import { formatIstDate } from "@/lib/ist";
import { inr } from "@/lib/money";
import { EventTabs } from "../event-tabs";

export const metadata: Metadata = { title: "Bookings" };

export default async function EventBookingsPage({
  params,
  searchParams,
}: PageProps<"/organizer/events/[id]/bookings">) {
  const ctx = await requireOrganizer({ allowUnverified: true });
  const { id } = await params;
  const sp = await searchParams;

  const event = await findOwnedEvent(ctx.organizerId, id);
  if (!event) notFound();

  const page = Number(typeof sp.page === "string" ? sp.page : 1) || 1;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const { rows, total, pageCount } = await listEventBookings(
    ctx.organizerId,
    id,
    { page, q },
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href={`/organizer/events/${id}`}
          className="inline-flex items-center gap-1.5 text-[12px] font-bold text-ink-muted hover:text-ink mb-2"
        >
          <ArrowLeft size={14} strokeWidth={2.6} />
          {event.title}
        </Link>
        <h1 className="text-[20px] font-extrabold leading-tight">Bookings</h1>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          {total.toLocaleString("en-IN")} in total
        </p>
      </div>

      <EventTabs eventId={id} active="bookings" />

      <form
        method="get"
        className="flex items-center gap-2 max-w-sm"
        role="search"
      >
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Booking number, name or phone"
          aria-label="Search bookings"
          className="w-full bg-surface text-ink placeholder:text-ink-muted border border-border rounded-[var(--radius-input)] px-3.5 py-2.5 text-[13px] font-semibold outline-none focus:border-primary"
        />
        <button
          type="submit"
          data-hit
          className="shrink-0 rounded-full bg-primary text-white px-4 py-2.5 text-[12.5px] font-extrabold cursor-pointer hover:bg-primary-dark transition-colors"
        >
          Search
        </button>
      </form>

      <div className="bg-surface border border-border rounded-[var(--radius-card)] overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title={q ? "No matches" : "No bookings yet"}
            body={
              q
                ? "Try a booking number, a buyer name, or the phone number they booked with."
                : "As soon as someone books, their row appears here."
            }
          />
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Booking</Th>
                <Th>Buyer</Th>
                <Th>Tiers</Th>
                <Th>Status</Th>
                <Th numeric>Tickets</Th>
                <Th numeric>Amount</Th>
                <Th>Booked</Th>
              </Tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <Tr key={b.id}>
                  <Td className="tabular font-extrabold">{b.bookingNumber}</Td>
                  <Td>
                    {b.buyerName ?? "—"}
                    {b.buyerPhone && (
                      <span className="block text-[11px] font-semibold text-ink-muted tabular">
                        {b.buyerPhone}
                      </span>
                    )}
                  </Td>
                  <Td className="max-w-[220px]">
                    <span className="text-[12px] font-semibold">
                      {b.items
                        .map(
                          (i) =>
                            `${i.quantity}× ${i.tier.name}${i.session ? ` (N${i.session.sequence})` : ""}`,
                        )
                        .join(", ")}
                    </span>
                  </Td>
                  <Td>
                    <StatusPill status={b.status} />
                  </Td>
                  <Td numeric>{b._count.tickets}</Td>
                  <Td numeric>{inr(b.totalPaise)}</Td>
                  <Td className="whitespace-nowrap text-ink-muted">
                    {formatIstDate(b.createdAt)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <Pagination
        page={page}
        pageCount={pageCount}
        total={total}
        basePath={`/organizer/events/${id}/bookings`}
        params={{ q }}
      />
    </div>
  );
}
