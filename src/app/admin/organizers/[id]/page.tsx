import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { StatusPill, Table, Td, Th, Tr } from "@/components/ui";
import { StatCard } from "@/components/dash/stat-card";
import { requireAdmin } from "@/lib/auth/rbac";
import { getOrganizerDetail } from "@/lib/queries/admin/queries";
import { formatIstDate } from "@/lib/ist";
import { inr } from "@/lib/money";
import { KycDecision, SuspendControls } from "./organizer-actions";

export const metadata: Metadata = { title: "Organizer" };

export default async function AdminOrganizerDetailPage({
  params,
}: PageProps<"/admin/organizers/[id]">) {
  await requireAdmin("APPROVALS");
  const { id } = await params;

  const detail = await getOrganizerDetail(id);
  if (!detail) notFound();
  const { profile, events, unsettledPaise, payouts } = detail;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/admin/organizers"
          className="inline-flex items-center gap-1.5 text-[12px] font-bold text-ink-muted hover:text-ink mb-2"
        >
          <ArrowLeft size={14} strokeWidth={2.6} />
          All organizers
        </Link>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[20px] font-extrabold leading-tight">
            {profile.name}
          </h1>
          <StatusPill status={profile.status} />
          {profile.plan && (
            <StatusPill
              tone={profile.plan === "PRO" ? "confirmed" : "pending"}
              label={profile.plan === "PRO" ? "Pro" : "Basic"}
            />
          )}
        </div>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          {profile.city?.name ?? "—"} · joined {formatIstDate(profile.createdAt)}{" "}
          · {profile.user.phone ?? profile.user.email ?? "no contact"}
        </p>
      </div>

      {profile.suspendedAt && (
        <div className="rounded-[var(--radius-card)] border border-danger/25 bg-danger-tint px-4 py-3">
          <p className="text-[13px] font-extrabold text-danger-dark">
            Suspended {formatIstDate(profile.suspendedAt)}
          </p>
          <p className="text-[12.5px] font-semibold text-danger-dark/85 mt-0.5">
            {profile.suspendedReason}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Unsettled"
          paise={unsettledPaise}
          hint="Owed at next payout"
          tone={unsettledPaise < 0 ? "danger" : "default"}
        />
        <StatCard label="Events" value={events.length} />
        <StatCard
          label="Tickets"
          value={events
            .reduce((s, e) => s + e._count.tickets, 0)
            .toLocaleString("en-IN")}
        />
        <StatCard
          label="Rating"
          value={
            profile.ratingCount > 0
              ? `${profile.ratingAvg.toFixed(1)} (${profile.ratingCount})`
              : "—"
          }
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="bg-surface border border-border rounded-[var(--radius-card)] p-4 lg:p-5">
          <h2 className="text-[14.5px] font-extrabold mb-3.5">KYC & business</h2>
          <dl className="flex flex-col gap-2">
            <Row k="Legal name" v={profile.legalName ?? "—"} />
            <Row k="Type" v={profile.businessType ?? "—"} />
            <Row
              k="Address"
              v={
                profile.addressLine
                  ? `${profile.addressLine}${profile.pincode ? ` – ${profile.pincode}` : ""}`
                  : "—"
              }
            />
            <Row k="PAN on file" v={profile.hasPan ? "Yes" : "No"} />
            <Row k="GST on file" v={profile.hasGst ? "Yes" : "No"} />
            <Row
              k="Bank"
              v={
                profile.bankVerifiedAt
                  ? `Verified ${formatIstDate(profile.bankVerifiedAt)}`
                  : profile.hasBank
                    ? "On file, unverified"
                    : "None"
              }
            />
            <Row
              k="Submitted"
              v={
                profile.kycSubmittedAt
                  ? formatIstDate(profile.kycSubmittedAt)
                  : "—"
              }
            />
            <Row
              k="Reviewed"
              v={
                profile.kycReviewedAt ? formatIstDate(profile.kycReviewedAt) : "—"
              }
            />
          </dl>
          <p className="flex items-start gap-1.5 text-[11.5px] font-semibold text-ink-muted mt-3.5">
            <ShieldCheck size={13} strokeWidth={2.4} className="shrink-0 mt-px" />
            Document numbers are never rendered here and are redacted from the
            audit log — whether they are on file is the auditable fact.
          </p>

          {profile.status === "KYC_IN_REVIEW" && (
            <div className="mt-4 pt-4 border-t border-divider">
              <KycDecision organizerId={profile.id} />
            </div>
          )}
        </section>

        <section className="bg-surface border border-border rounded-[var(--radius-card)] p-4 lg:p-5">
          <h2 className="text-[14.5px] font-extrabold mb-1">Account controls</h2>
          <p className="text-[11.5px] font-semibold text-ink-muted mb-3.5">
            Suspension pauses every live event and freezes every payout, in one
            transaction. Their login survives, read-only, and tickets already
            sold stay valid — no money moves, which is why it is reversible.
          </p>
          <SuspendControls
            organizerId={profile.id}
            name={profile.name}
            suspended={profile.status === "SUSPENDED"}
          />
        </section>
      </div>

      <section className="bg-surface border border-border rounded-[var(--radius-card)] overflow-hidden">
        <h2 className="text-[14px] font-extrabold px-4 py-3 border-b border-border">
          Events
        </h2>
        {events.length === 0 ? (
          <p className="px-4 py-6 text-[12.5px] font-semibold text-ink-muted">
            None yet.
          </p>
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Event</Th>
                <Th>Status</Th>
                <Th numeric>Bookings</Th>
                <Th numeric>Tickets</Th>
                <Th>Created</Th>
              </Tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <Tr key={e.id}>
                  <Td className="max-w-[280px]">
                    <Link
                      href={`/admin/events/${e.id}`}
                      className="font-extrabold hover:text-primary transition-colors block truncate"
                    >
                      {e.title}
                    </Link>
                  </Td>
                  <Td>
                    <StatusPill status={e.status} />
                  </Td>
                  <Td numeric>{e._count.bookings}</Td>
                  <Td numeric>{e._count.tickets}</Td>
                  <Td className="whitespace-nowrap text-ink-muted">
                    {formatIstDate(e.createdAt)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      {payouts.length > 0 && (
        <section className="bg-surface border border-border rounded-[var(--radius-card)] overflow-hidden">
          <h2 className="text-[14px] font-extrabold px-4 py-3 border-b border-border">
            Payouts
          </h2>
          <Table>
            <thead>
              <Tr>
                <Th>Period</Th>
                <Th>Status</Th>
                <Th numeric>Amount</Th>
                <Th>Paid</Th>
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
                </Tr>
              ))}
            </tbody>
          </Table>
        </section>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[12px] font-bold text-ink-muted shrink-0">{k}</dt>
      <dd className="text-[13px] font-bold text-right truncate">{v}</dd>
    </div>
  );
}
