import Link from "next/link";
import type { Metadata } from "next";
import { Banknote } from "lucide-react";
import { EmptyState, StatusPill, Table, Tabs, Td, Th, Tr } from "@/components/ui";
import { StatCard } from "@/components/dash/stat-card";
import { requireAdmin } from "@/lib/auth/rbac";
import {
  getUnsettledByOrganizer,
  listPayouts,
} from "@/lib/queries/admin/queries";
import { formatIstDate } from "@/lib/ist";
import { inr } from "@/lib/money";
import { PayoutActions } from "./payout-actions";

export const metadata: Metadata = { title: "Payouts" };

const TABS = [
  { key: "ALL", label: "All" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "PROCESSING", label: "Processing" },
  { key: "FROZEN", label: "Frozen" },
  { key: "PAID", label: "Paid" },
];

export default async function AdminFinancePage({
  searchParams,
}: PageProps<"/admin/finance">) {
  await requireAdmin("FINANCE");
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "ALL";

  const [payouts, unsettled] = await Promise.all([
    listPayouts(status),
    getUnsettledByOrganizer(),
  ]);

  const owed = unsettled.reduce((s, u) => s + u.unsettledPaise, 0);
  const scheduled = payouts
    .filter((p) => p.status === "SCHEDULED")
    .reduce((s, p) => s + p.amountPaise, 0);
  const frozen = payouts
    .filter((p) => p.status === "FROZEN")
    .reduce((s, p) => s + p.amountPaise, 0);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[20px] font-extrabold leading-tight">Payouts</h1>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          Marking a payout paid sweeps the organizer&apos;s unsettled ledger rows
          onto it, so the next run cannot pay the same money twice.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Owed to organizers"
          paise={owed}
          hint="Unsettled ledger, all organizers"
          Icon={Banknote}
          tone={owed > 0 ? "warning" : "default"}
        />
        <StatCard label="Scheduled" paise={scheduled} />
        <StatCard
          label="Frozen"
          paise={frozen}
          hint="Disputes or suspensions"
          tone={frozen > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Organizers with a balance"
          value={unsettled.length}
        />
      </div>

      <Tabs
        ariaLabel="Payout status"
        items={TABS.map((t) => ({
          href: t.key === "ALL" ? "/admin/finance" : `/admin/finance?status=${t.key}`,
          label: t.label,
          active: status === t.key,
        }))}
      />

      <div className="bg-surface border border-border rounded-[var(--radius-card)] overflow-hidden">
        {payouts.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title="No payouts in this state"
            body="Payout batches are created by the settlement run after an event completes."
          />
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Organizer</Th>
                <Th>Period</Th>
                <Th>Status</Th>
                <Th numeric>Amount</Th>
                <Th>Action</Th>
              </Tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <Tr key={p.id}>
                  <Td className="max-w-[200px]">
                    <Link
                      href={`/admin/organizers/${p.organizer.id}`}
                      className="font-extrabold hover:text-primary transition-colors block truncate"
                    >
                      {p.organizer.name}
                    </Link>
                    <StatusPill status={p.organizer.status} className="mt-1" />
                  </Td>
                  <Td className="whitespace-nowrap">
                    {formatIstDate(p.periodStart)} – {formatIstDate(p.periodEnd)}
                  </Td>
                  <Td>
                    <StatusPill status={p.status} />
                    {p.frozenReason && (
                      <span className="block text-[10.5px] font-bold text-danger mt-1 max-w-[180px]">
                        {p.frozenReason}
                      </span>
                    )}
                    {p.utr && (
                      <span className="block text-[10.5px] font-bold text-ink-muted mt-1 tabular">
                        UTR {p.utr}
                      </span>
                    )}
                  </Td>
                  <Td numeric>{inr(p.amountPaise)}</Td>
                  <Td>
                    <PayoutActions payoutId={p.id} status={p.status} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <section className="bg-surface border border-border rounded-[var(--radius-card)] overflow-hidden">
        <h2 className="text-[14px] font-extrabold px-4 py-3 border-b border-border">
          Unsettled by organizer
        </h2>
        {unsettled.length === 0 ? (
          <EmptyState
            title="Everything is settled"
            body="No organizer is owed anything right now."
          />
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Organizer</Th>
                <Th>Status</Th>
                <Th numeric>Unsettled</Th>
              </Tr>
            </thead>
            <tbody>
              {unsettled.map((u) => (
                <Tr key={u.organizerId}>
                  <Td>
                    <Link
                      href={`/admin/organizers/${u.organizerId}`}
                      className="font-extrabold hover:text-primary transition-colors"
                    >
                      {u.name}
                    </Link>
                  </Td>
                  <Td>
                    <StatusPill status={u.status} />
                  </Td>
                  <Td
                    numeric
                    className={u.unsettledPaise < 0 ? "text-danger" : undefined}
                  >
                    {inr(u.unsettledPaise)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
