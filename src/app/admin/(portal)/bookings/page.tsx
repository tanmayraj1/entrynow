import Link from "next/link";
import type { Metadata } from "next";
import { Ticket as TicketIcon } from "lucide-react";
import {
  EmptyState,
  Pagination,
  StatusPill,
  Table,
  Tabs,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { StatCard } from "@/components/dash/stat-card";
import { requireAdmin } from "@/lib/auth/rbac";
import { listAllBookings } from "@/lib/queries/admin/queries";
import { formatIstDate } from "@/lib/ist";
import { inr } from "@/lib/money";

export const metadata: Metadata = { title: "Bookings & tickets" };

/**
 * Every booking on the platform.
 *
 * The overview already counted tickets sold; this is the page it should have
 * linked to. Support answers "where is my ticket" by booking number, finance
 * answers "what did we earn on that" by commission, and neither had a screen.
 */

const TABS = [
  { key: "ALL", label: "All" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "PENDING_PAYMENT", label: "Pending" },
  { key: "REFUNDED", label: "Refunded" },
  { key: "CANCELLED_BY_USER", label: "Cancelled" },
  { key: "EXPIRED", label: "Expired" },
  { key: "FAILED", label: "Failed" },
];

export default async function AdminBookingsPage({
  searchParams,
}: PageProps<"/admin/bookings">) {
  await requireAdmin("SUPPORT");
  const sp = await searchParams;

  const status = typeof sp.status === "string" ? sp.status : "ALL";
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const page = Number(typeof sp.page === "string" ? sp.page : 1) || 1;

  const { rows, total, pageCount, grossPaise, ticketTotal } =
    await listAllBookings({ status, q, page });

  const commissionOnPage = rows.reduce((s, r) => s + r.commissionPaise, 0);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[20px] font-extrabold leading-tight">
          Bookings &amp; tickets
        </h1>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          Every organizer&apos;s. Search by booking number, buyer, event or
          organizer — guest checkouts included.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard
          label={status === "ALL" ? "Bookings" : `Bookings · ${status.toLowerCase()}`}
          value={total}
          hint={q ? `matching “${q}”` : "across the platform"}
        />
        <StatCard label="Tickets issued" value={ticketTotal} hint="in this filter" />
        <StatCard
          label="Gross"
          paise={grossPaise}
          hint="what attendees paid, this filter"
        />
      </div>

      <Tabs
        ariaLabel="Booking status"
        items={TABS.map((t) => ({
          href:
            t.key === "ALL" ? "/admin/bookings" : `/admin/bookings?status=${t.key}`,
          label: t.label,
          active: status === t.key,
        }))}
      />

      <form method="get" className="flex items-center gap-2 max-w-sm" role="search">
        {status !== "ALL" && <input type="hidden" name="status" value={status} />}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="EN123456, name, phone, event…"
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
            icon={TicketIcon}
            title="No bookings match"
            body="Try a booking number, a buyer's phone, or clear the status filter."
          />
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Booking</Th>
                <Th>Event</Th>
                <Th>Organizer</Th>
                <Th>Buyer</Th>
                <Th>Status</Th>
                <Th numeric>Tickets</Th>
                <Th numeric>Gross</Th>
                <Th numeric>Commission</Th>
              </Tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                /* A guest checkout has no account name, so the buyer columns
                   fall back to the linked user rather than rendering blank
                   (D-036). */
                const name = b.buyerName ?? b.user.name ?? "Guest";
                const contact =
                  b.buyerPhone ?? b.user.phone ?? b.buyerEmail ?? b.user.email;
                return (
                  <Tr key={b.id}>
                    <Td className="whitespace-nowrap">
                      <span className="tabular font-extrabold">
                        {b.bookingNumber}
                      </span>
                      <span className="block text-[11.5px] font-semibold text-ink-muted">
                        {formatIstDate(b.confirmedAt ?? b.createdAt)}
                      </span>
                    </Td>
                    <Td className="max-w-[220px]">
                      <Link
                        href={`/admin/events/${b.event.id}`}
                        className="hover:text-primary transition-colors block truncate"
                      >
                        {b.event.title}
                      </Link>
                    </Td>
                    <Td className="max-w-[150px] truncate">
                      <Link
                        href={`/admin/organizers/${b.event.organizer.id}`}
                        className="hover:text-primary transition-colors"
                      >
                        {b.event.organizer.name}
                      </Link>
                    </Td>
                    <Td className="max-w-[160px]">
                      <span className="block truncate">{name}</span>
                      <span className="block text-[11.5px] font-semibold text-ink-muted truncate">
                        {contact ?? "—"}
                      </span>
                    </Td>
                    <Td>
                      <StatusPill status={b.status} />
                    </Td>
                    <Td numeric>
                      {b.ticketCount}
                      {/* Attendance, not inventory: how many of this booking's
                          tickets actually walked through a gate. */}
                      {b.scannedCount > 0 && (
                        <span className="block text-[11px] font-bold text-positive">
                          {b.scannedCount} scanned
                        </span>
                      )}
                    </Td>
                    <Td numeric>{inr(b.totalPaise)}</Td>
                    <Td numeric className="font-extrabold">
                      {b.commissionPaise > 0 ? inr(b.commissionPaise) : "—"}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
            <tfoot>
              <Tr>
                <Td className="font-extrabold" colSpan={6}>
                  Commission on this page
                </Td>
                <Td />
                <Td numeric className="font-extrabold">
                  {inr(commissionOnPage)}
                </Td>
              </Tr>
            </tfoot>
          </Table>
        )}
      </div>

      <Pagination
        page={page}
        pageCount={pageCount}
        total={total}
        basePath="/admin/bookings"
        params={{
          ...(status !== "ALL" ? { status } : {}),
          ...(q ? { q } : {}),
        }}
      />
    </div>
  );
}
