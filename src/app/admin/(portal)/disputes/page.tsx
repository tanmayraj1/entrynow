import Link from "next/link";
import type { Metadata } from "next";
import { LifeBuoy } from "lucide-react";
import type { DisputeStatus } from "@/generated/prisma";
import { EmptyState, StatusPill, Tabs } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/rbac";
import { countDisputes, listDisputes } from "@/lib/queries/admin/queries";
import { formatIstDate } from "@/lib/ist";
import { inr } from "@/lib/money";
import { DisputeActions } from "./dispute-actions";

export const metadata: Metadata = { title: "Disputes" };

const TABS: { key: DisputeStatus | "ALL"; label: string }[] = [
  { key: "OPEN", label: "Open" },
  { key: "INVESTIGATING", label: "Investigating" },
  { key: "RESOLVED_REFUND", label: "Refunded" },
  { key: "RESOLVED_PARTIAL", label: "Partial" },
  { key: "RESOLVED_REJECT", label: "Rejected" },
  { key: "ALL", label: "All" },
];

export default async function AdminDisputesPage({
  searchParams,
}: PageProps<"/admin/disputes">) {
  await requireAdmin("SUPPORT");
  const sp = await searchParams;
  const status = ((typeof sp.status === "string" ? sp.status : "OPEN") ||
    "OPEN") as DisputeStatus | "ALL";

  const [counts, disputes] = await Promise.all([
    countDisputes(),
    listDisputes(status),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[20px] font-extrabold leading-tight">Disputes</h1>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          Moving one to Investigating freezes that organizer&apos;s scheduled
          payouts — settling out from under a live complaint is how a platform
          ends up paying twice.
        </p>
      </div>

      <Tabs
        ariaLabel="Dispute status"
        items={TABS.map((t) => ({
          href: `/admin/disputes?status=${t.key}`,
          label: t.label,
          count: counts[t.key],
          active: status === t.key,
        }))}
      />

      {disputes.length === 0 ? (
        <div className="bg-surface border border-border rounded-[var(--radius-card)]">
          <EmptyState
            icon={LifeBuoy}
            title="Nothing here"
            body="No disputes in this state."
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {disputes.map((d) => (
            <article
              key={d.id}
              className="bg-surface border border-border rounded-[var(--radius-card)] p-4 lg:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[14.5px] font-extrabold">{d.summary}</h2>
                    <StatusPill status={d.status} />
                    <span className="text-[11px] font-extrabold text-ink-muted uppercase">
                      {d.kind}
                    </span>
                  </div>
                  <p className="text-[12px] font-semibold text-ink-muted mt-1">
                    Raised {formatIstDate(d.createdAt)}
                    {d.raisedBy && ` by ${d.raisedBy.name ?? d.raisedBy.phone}`}
                    {d.event && (
                      <>
                        {" · "}
                        <Link
                          href={`/admin/events/${d.event.id}`}
                          className="hover:text-primary transition-colors"
                        >
                          {d.event.title}
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                {d.booking && (
                  <div className="text-right shrink-0">
                    <p className="text-[12px] font-extrabold tabular">
                      {d.booking.bookingNumber}
                    </p>
                    <p className="text-[12px] font-bold tabular">
                      {inr(d.booking.totalPaise)}
                    </p>
                    <StatusPill status={d.booking.status} className="mt-1" />
                  </div>
                )}
              </div>

              {d.detail && (
                <p className="text-[12.5px] font-semibold mt-3 whitespace-pre-line">
                  {d.detail}
                </p>
              )}

              {d.resolutionNote && (
                <p className="text-[12.5px] font-semibold text-ink-muted mt-3 border-l-2 border-border pl-3">
                  <span className="font-extrabold text-ink">Resolution: </span>
                  {d.resolutionNote}
                  {d.resolvedAt && ` — ${formatIstDate(d.resolvedAt)}`}
                </p>
              )}

              {!d.status.startsWith("RESOLVED") && (
                <div className="mt-4 pt-4 border-t border-divider">
                  <DisputeActions disputeId={d.id} status={d.status} />
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
