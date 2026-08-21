import type { Metadata } from "next";
import { Banknote, Percent, TrendingUp, Wallet } from "lucide-react";
import {
  EmptyState,
  Pagination,
  StatusPill,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { StatCard } from "@/components/dash/stat-card";
import { requireOrganizer } from "@/lib/auth/rbac";
import {
  getOrganizerFinanceSummary,
  getRevenueByEvent,
  listOrganizerLedger,
  listOrganizerPayouts,
} from "@/lib/queries/organizer/finance";
import { formatIstDate } from "@/lib/ist";
import { inr } from "@/lib/money";

export const metadata: Metadata = { title: "Financials" };

export default async function OrganizerFinancialsPage({
  searchParams,
}: PageProps<"/organizer/financials">) {
  const ctx = await requireOrganizer({ allowUnverified: true });
  const sp = await searchParams;
  const page = Number(typeof sp.page === "string" ? sp.page : 1) || 1;

  const [summary, payouts, byEvent, ledger] = await Promise.all([
    getOrganizerFinanceSummary(ctx.organizerId),
    listOrganizerPayouts(ctx.organizerId),
    getRevenueByEvent(ctx.organizerId),
    listOrganizerLedger(ctx.organizerId, { page }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[20px] font-extrabold leading-tight">Financials</h1>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          Every figure here comes from the ledger, not from a booking total —
          so it is already net of commission and GST.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Unsettled"
          paise={summary.unsettledPaise}
          hint={
            summary.nextPayoutAt
              ? `Next run ${formatIstDate(summary.nextPayoutAt)}`
              : "Awaiting the next payout run"
          }
          Icon={Wallet}
          tone={summary.unsettledPaise < 0 ? "danger" : "positive"}
        />
        <StatCard
          label="Paid out"
          paise={summary.paidOutPaise}
          hint="Settled to your bank"
          Icon={Banknote}
        />
        <StatCard
          label="Lifetime net"
          paise={summary.lifetimeNetPaise}
          hint="After commission"
          Icon={TrendingUp}
        />
        <StatCard
          label="Commission paid"
          paise={summary.commissionPaise}
          hint="Platform fee + GST"
          Icon={Percent}
        />
      </div>

      {summary.unsettledPaise < 0 && (
        <div className="rounded-[var(--radius-card)] border border-danger/25 bg-danger-tint px-4 py-3">
          <p className="text-[13px] font-extrabold text-danger-dark">
            Negative balance
          </p>
          <p className="text-[12.5px] font-semibold text-danger-dark/85 mt-0.5">
            Refunds have exceeded sales in this period. The shortfall carries
            forward against your next settlement rather than being collected.
          </p>
        </div>
      )}

      <section className="bg-surface border border-border rounded-[var(--radius-card)] overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-[14px] font-extrabold">Revenue by event</h2>
          <p className="text-[11.5px] font-semibold text-ink-muted mt-0.5">
            Gross is what attendees paid. Commission is what Entry Now charged
            on it, including GST on the fee.
          </p>
        </div>
        {byEvent.length === 0 ? (
          <EmptyState
            title="No sales yet"
            body="Once an event sells its first ticket, the money shows up here."
          />
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Event</Th>
                <Th>Status</Th>
                <Th numeric>Bookings</Th>
                <Th numeric>Gross</Th>
                <Th numeric>Commission</Th>
                <Th numeric>After commission</Th>
              </Tr>
            </thead>
            <tbody>
              {byEvent.map((e) => (
                <Tr key={e.eventId}>
                  <Td className="max-w-[280px] truncate">{e.title}</Td>
                  <Td>
                    <StatusPill status={e.status} />
                  </Td>
                  <Td numeric>{e.bookings}</Td>
                  <Td numeric>{inr(e.grossPaise)}</Td>
                  {/* Negative-signed on screen, because this is money out.
                      The stored ledger legs are already negative; the query
                      reports magnitude, so the sign belongs here. */}
                  <Td numeric className="text-ink-muted">
                    {e.commissionPaise > 0 ? `−${inr(e.commissionPaise)}` : "—"}
                  </Td>
                  <Td numeric className="font-extrabold">
                    {inr(e.netPaise)}
                  </Td>
                </Tr>
              ))}
            </tbody>
            <tfoot>
              <Tr>
                <Td className="font-extrabold">Total</Td>
                <Td />
                <Td numeric className="font-extrabold">
                  {byEvent.reduce((s, e) => s + e.bookings, 0)}
                </Td>
                <Td numeric className="font-extrabold">
                  {inr(byEvent.reduce((s, e) => s + e.grossPaise, 0))}
                </Td>
                <Td numeric className="font-extrabold text-ink-muted">
                  −{inr(byEvent.reduce((s, e) => s + e.commissionPaise, 0))}
                </Td>
                <Td numeric className="font-extrabold">
                  {inr(byEvent.reduce((s, e) => s + e.netPaise, 0))}
                </Td>
              </Tr>
            </tfoot>
          </Table>
        )}
      </section>

      <section className="bg-surface border border-border rounded-[var(--radius-card)] overflow-hidden">
        <h2 className="text-[14px] font-extrabold px-4 py-3 border-b border-border">
          Payouts
        </h2>
        {payouts.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title="No payouts yet"
            body="Settlement runs after an event completes and its payout window closes."
          />
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Period</Th>
                <Th>Status</Th>
                <Th numeric>Amount</Th>
                <Th>Paid</Th>
                <Th>UTR</Th>
              </Tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <Tr key={p.id}>
                  <Td className="whitespace-nowrap">
                    {formatIstDate(p.periodStart)} – {formatIstDate(p.periodEnd)}
                  </Td>
                  <Td>
                    <StatusPill status={p.status} />
                    {p.frozenReason && (
                      <span className="block text-[10.5px] font-bold text-danger mt-1">
                        {p.frozenReason}
                      </span>
                    )}
                  </Td>
                  <Td numeric>{inr(p.amountPaise)}</Td>
                  <Td className="whitespace-nowrap text-ink-muted">
                    {p.paidAt ? formatIstDate(p.paidAt) : "—"}
                  </Td>
                  <Td className="tabular text-ink-muted">{p.utr ?? "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section className="bg-surface border border-border rounded-[var(--radius-card)] overflow-hidden">
        <h2 className="text-[14px] font-extrabold px-4 py-3 border-b border-border">
          Ledger
        </h2>
        {ledger.rows.length === 0 ? (
          <EmptyState
            title="Nothing recorded yet"
            body="Each confirmed booking writes a set of entries that sum to zero."
          />
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Entry</Th>
                <Th>Booking</Th>
                <Th numeric>Amount</Th>
                <Th>Settled</Th>
                <Th>When</Th>
              </Tr>
            </thead>
            <tbody>
              {ledger.rows.map((l) => (
                <Tr key={l.id}>
                  <Td>
                    {l.type.replace(/_/g, " ").toLowerCase()}
                    {l.memo && (
                      <span className="block text-[11px] font-semibold text-ink-muted">
                        {l.memo}
                      </span>
                    )}
                  </Td>
                  <Td className="tabular text-ink-muted">
                    {l.booking?.bookingNumber ?? "—"}
                  </Td>
                  <Td
                    numeric
                    className={l.amountPaise < 0 ? "text-danger" : undefined}
                  >
                    {inr(l.amountPaise)}
                  </Td>
                  <Td>
                    {l.payoutId ? (
                      <StatusPill tone="success" label="Paid out" />
                    ) : (
                      <StatusPill tone="pending" label="Unsettled" />
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-ink-muted">
                    {formatIstDate(l.createdAt)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <div className="px-4 pb-4">
          <Pagination
            page={page}
            pageCount={ledger.pageCount}
            total={ledger.total}
            basePath="/organizer/financials"
          />
        </div>
      </section>
    </div>
  );
}
