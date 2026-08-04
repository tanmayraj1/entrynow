import type { Metadata } from "next";
import { BadgeCheck } from "lucide-react";
import type { EventStatus } from "@/generated/prisma";
import { EmptyState, StatusPill, Tabs } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/rbac";
import {
  countReviewQueue,
  listReviewQueue,
} from "@/lib/queries/admin/queries";
import { formatIstDate, formatIstTime } from "@/lib/ist";
import { inr } from "@/lib/money";
import { ApprovalActions } from "./approval-actions";

export const metadata: Metadata = { title: "Approvals" };

const TABS: { key: EventStatus; label: string }[] = [
  { key: "IN_REVIEW", label: "In review" },
  { key: "REJECTED", label: "Rejected" },
  { key: "LIVE", label: "Live" },
];

export default async function AdminApprovalsPage({
  searchParams,
}: PageProps<"/admin/approvals">) {
  await requireAdmin("APPROVALS");
  const sp = await searchParams;
  const status = ((typeof sp.status === "string" ? sp.status : "IN_REVIEW") ||
    "IN_REVIEW") as EventStatus;

  const [counts, events] = await Promise.all([
    countReviewQueue(),
    listReviewQueue(status),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[20px] font-extrabold leading-tight">Approvals</h1>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          Oldest submission first — the queue is FIFO so nothing rots at the
          bottom.
        </p>
      </div>

      <Tabs
        ariaLabel="Approval queue"
        items={TABS.map((t) => ({
          href: `/admin/approvals?status=${t.key}`,
          label: t.label,
          count: counts[t.key],
          active: status === t.key,
        }))}
      />

      {events.length === 0 ? (
        <div className="bg-surface border border-border rounded-[var(--radius-card)]">
          <EmptyState
            icon={BadgeCheck}
            title="Queue is clear"
            body="Nothing is waiting on you."
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {events.map((e) => {
            const isEdit = e.pendingChanges !== null;
            const changes = isEdit
              ? (e.pendingChanges as Record<string, unknown>)
              : null;

            return (
              <article
                key={e.id}
                className="bg-surface border border-border rounded-[var(--radius-card)] p-4 lg:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[15.5px] font-extrabold">{e.title}</h2>
                      <StatusPill status={e.status} />
                      {isEdit && (
                        <StatusPill tone="warning" label="Edit to a live event" />
                      )}
                    </div>
                    <p className="text-[12px] font-semibold text-ink-muted mt-1">
                      {e.organizer.name}
                      {e.organizer.verified && " ✓"} ·{" "}
                      {e.organizer._count.events} event
                      {e.organizer._count.events === 1 ? "" : "s"} · submitted{" "}
                      {e.submittedAt ? formatIstDate(e.submittedAt) : "—"}
                    </p>
                  </div>
                  <StatusPill status={e.organizer.status} />
                </div>

                {e.summary && (
                  <p className="text-[13px] font-semibold mt-3">{e.summary}</p>
                )}

                <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 mt-3.5 text-[12.5px]">
                  <Row k="Category" v={e.category.name} />
                  <Row k="City" v={e.city.name} />
                  <Row
                    k="Venue"
                    v={`${e.venue.name}, ${e.venue.addressLine}`}
                  />
                  <Row
                    k="Sessions"
                    v={
                      e.sessions.length
                        ? `${e.sessions.length} — first ${formatIstDate(e.sessions[0].startsAt)} ${formatIstTime(e.sessions[0].startsAt)}`
                        : "none"
                    }
                  />
                  <Row
                    k="Tiers"
                    v={
                      e.tiers.length
                        ? e.tiers
                            .map((t) => `${t.name} ${inr(t.pricePaise)} ×${t.quantityTotal}`)
                            .join(" · ")
                        : "none"
                    }
                  />
                  <Row k="Cover image" v={e.coverImageUrl ? "yes" : "missing"} />
                </dl>

                {isEdit && changes && (
                  <div className="mt-4 rounded-[12px] border border-status-warning-fg/25 bg-status-warning-bg p-3.5">
                    <p className="text-[12.5px] font-extrabold text-status-warning-fg mb-2">
                      Proposed changes — the event is still selling at its
                      current values
                    </p>
                    <dl className="grid gap-1">
                      {Object.entries(changes).map(([k, v]) => (
                        <div key={k} className="flex gap-2 text-[12px]">
                          <dt className="font-bold text-status-warning-fg/80 min-w-[130px]">
                            {k}
                          </dt>
                          <dd className="font-semibold text-status-warning-fg break-all">
                            {typeof v === "object"
                              ? JSON.stringify(v)
                              : String(v)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p className="text-[11.5px] font-semibold text-status-warning-fg/85 mt-2.5">
                      Approving applies these, notifies everyone who has booked,
                      and opens a 72-hour free-cancellation window.
                    </p>
                  </div>
                )}

                {e.rejectionNote && (
                  <p className="mt-3 text-[12px] font-semibold text-danger">
                    Previously rejected: {e.rejectionNote}
                  </p>
                )}

                {status === "IN_REVIEW" && (
                  <div className="mt-4 pt-4 border-t border-divider">
                    <ApprovalActions eventId={e.id} isEdit={isEdit} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="font-bold text-ink-muted min-w-[92px] shrink-0">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}
