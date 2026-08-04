import Link from "next/link";
import type { Metadata } from "next";
import {
  CalendarClock,
  IndianRupee,
  Plus,
  Ticket,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { EmptyState, Table, Td, Th, Tr } from "@/components/ui";
import { SalesSpark, StatCard } from "@/components/dash/stat-card";
import { requireOrganizer } from "@/lib/auth/rbac";
import {
  getOrganizerOverview,
  getOrganizerRecentBookings,
  getOrganizerSalesSeries,
} from "@/lib/queries/organizer/dashboard";
import { formatIstDate, formatIstTime } from "@/lib/ist";
import { inr } from "@/lib/money";

export const metadata: Metadata = { title: "Dashboard" };

export default async function OrganizerDashboardPage() {
  const ctx = await requireOrganizer({ allowUnverified: true });

  const [overview, series, recent] = await Promise.all([
    getOrganizerOverview(ctx.organizerId),
    getOrganizerSalesSeries(ctx.organizerId),
    getOrganizerRecentBookings(ctx.organizerId),
  ]);

  const weekPaise = series.slice(-7).reduce((s, d) => s + d.paise, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-extrabold leading-tight">
            Dashboard
          </h1>
          <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
            {overview.bookingsToday > 0
              ? `${overview.bookingsToday} booking${overview.bookingsToday === 1 ? "" : "s"} today`
              : "No bookings yet today"}
          </p>
        </div>
        {!ctx.readOnly && (
          <Link
            href="/organizer/events/new"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary text-white px-4 py-2 text-[12.5px] font-extrabold shadow-[var(--shadow-cta-themed)] hover:bg-primary-dark transition-colors"
          >
            <Plus size={15} strokeWidth={2.6} />
            New event
          </Link>
        )}
      </div>

      {ctx.status !== "VERIFIED" && ctx.status !== "SUSPENDED" && (
        <div className="rounded-[var(--radius-card)] border border-status-warning-fg/25 bg-status-warning-bg px-4 py-3">
          <p className="text-[13px] font-extrabold text-status-warning-fg">
            Finish onboarding to publish
          </p>
          <p className="text-[12px] font-semibold text-status-warning-fg/85 mt-0.5">
            You can build events now — publishing opens once your KYC is
            verified.{" "}
            <Link href="/organizer/settings" className="underline">
              Continue onboarding
            </Link>
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Unsettled"
          paise={overview.unsettledPaise}
          hint="Net of commission, awaiting payout"
          Icon={Wallet}
          tone={overview.unsettledPaise < 0 ? "danger" : "positive"}
        />
        <StatCard
          label="Gross sales"
          paise={overview.grossPaise}
          hint="All confirmed bookings"
          Icon={IndianRupee}
        />
        <StatCard
          label="Tickets sold"
          value={overview.ticketsSold.toLocaleString("en-IN")}
          hint={`${overview.liveEvents} live event${overview.liveEvents === 1 ? "" : "s"}`}
          Icon={Ticket}
        />
        <StatCard
          label="Last 7 days"
          paise={weekPaise}
          hint="Confirmed bookings"
          Icon={TrendingUp}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-surface border border-border rounded-[var(--radius-card)] p-4">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="text-[14px] font-extrabold">Sales, last 14 days</h2>
            <span className="text-[11.5px] font-bold text-ink-muted tabular">
              {inr(series.reduce((s, d) => s + d.paise, 0))}
            </span>
          </div>
          <SalesSpark series={series} />
          <div className="flex justify-between mt-2 text-[10.5px] font-bold text-ink-muted">
            <span>{series[0]?.day.slice(5)}</span>
            <span>{series.at(-1)?.day.slice(5)}</span>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-[var(--radius-card)] p-4">
          <h2 className="text-[14px] font-extrabold mb-3">Next up</h2>
          {overview.nextSession ? (
            <Link
              href={`/organizer/events/${overview.nextSession.eventId}/live`}
              className="block group"
            >
              <div className="flex items-start gap-2.5">
                <span className="grid place-items-center size-9 rounded-[10px] bg-primary-tint text-primary-dark shrink-0">
                  <CalendarClock size={16} strokeWidth={2.3} />
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-extrabold leading-snug group-hover:text-primary transition-colors">
                    {overview.nextSession.eventTitle}
                  </p>
                  <p className="text-[11.5px] font-semibold text-ink-muted mt-0.5">
                    {formatIstDate(overview.nextSession.startsAt)} ·{" "}
                    {formatIstTime(overview.nextSession.startsAt)}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11.5px] font-bold text-primary">
                Open the live gate board →
              </p>
            </Link>
          ) : (
            <p className="text-[12.5px] font-semibold text-ink-muted">
              No upcoming sessions scheduled.
            </p>
          )}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-[var(--radius-card)] overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <h2 className="text-[14px] font-extrabold">Recent bookings</h2>
          <Link
            href="/organizer/events"
            className="text-[12px] font-bold text-primary hover:underline"
          >
            All events
          </Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title="No bookings yet"
            body="Once your event is live and someone books, they show up here within seconds."
          />
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Booking</Th>
                <Th>Event</Th>
                <Th>Buyer</Th>
                <Th numeric>Tickets</Th>
                <Th numeric>Amount</Th>
                <Th>When</Th>
              </Tr>
            </thead>
            <tbody>
              {recent.map((b) => (
                <Tr key={b.id}>
                  <Td>
                    <span className="tabular font-extrabold">
                      {b.bookingNumber}
                    </span>
                  </Td>
                  <Td className="max-w-[220px] truncate">{b.event.title}</Td>
                  <Td>{b.buyerName ?? "—"}</Td>
                  <Td numeric>{b._count.tickets}</Td>
                  <Td numeric>{inr(b.totalPaise)}</Td>
                  <Td className="whitespace-nowrap text-ink-muted">
                    {b.confirmedAt ? formatIstDate(b.confirmedAt) : "—"}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      {overview.draftEvents > 0 && (
        <p className="text-[12.5px] font-semibold text-ink-muted">
          You have {overview.draftEvents} draft
          {overview.draftEvents === 1 ? "" : "s"} waiting.{" "}
          <Link href="/organizer/events?status=DRAFT" className="text-primary font-bold hover:underline">
            Finish one
          </Link>
        </p>
      )}
    </div>
  );
}
