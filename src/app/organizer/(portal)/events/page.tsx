import Link from "next/link";
import type { Metadata } from "next";
import { Calendar, Plus } from "lucide-react";
import type { EventStatus } from "@/generated/prisma";
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
import { requireOrganizer } from "@/lib/auth/rbac";
import {
  countOrganizerEventsByStatus,
  listOrganizerEvents,
} from "@/lib/queries/organizer/events";
import { formatIstDate } from "@/lib/ist";
import { inr } from "@/lib/money";

export const metadata: Metadata = { title: "Events" };

const TABS: { key: EventStatus | "ALL"; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "DRAFT", label: "Drafts" },
  { key: "IN_REVIEW", label: "In review" },
  { key: "LIVE", label: "Live" },
  { key: "PAUSED", label: "Paused" },
  { key: "REJECTED", label: "Rejected" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELLED", label: "Cancelled" },
];

export default async function OrganizerEventsPage({
  searchParams,
}: PageProps<"/organizer/events">) {
  const ctx = await requireOrganizer({ allowUnverified: true });
  const sp = await searchParams;

  const status = (
    typeof sp.status === "string" ? sp.status : "ALL"
  ) as EventStatus | "ALL";
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const page = Number(typeof sp.page === "string" ? sp.page : 1) || 1;

  const [counts, { rows, total, pageCount }] = await Promise.all([
    countOrganizerEventsByStatus(ctx.organizerId),
    listOrganizerEvents(ctx.organizerId, { status, q, page }),
  ]);

  const href = (s: string) =>
    s === "ALL" ? "/organizer/events" : `/organizer/events?status=${s}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-extrabold leading-tight">Events</h1>
          <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
            {counts.ALL} total · {counts.LIVE} live
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

      <Tabs
        ariaLabel="Event status"
        items={TABS.map((t) => ({
          href: href(t.key),
          label: t.label,
          count: counts[t.key],
          active: status === t.key,
        }))}
      />

      <div className="bg-surface border border-border rounded-[var(--radius-card)] overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title={
              status === "ALL"
                ? "No events yet"
                : `Nothing ${TABS.find((t) => t.key === status)?.label.toLowerCase()}`
            }
            body={
              status === "ALL"
                ? "Create your first event — you can save it as a draft and finish later."
                : "Try another tab."
            }
          />
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Event</Th>
                <Th>Status</Th>
                <Th>First session</Th>
                <Th numeric>Sold</Th>
                <Th numeric>Gross</Th>
              </Tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <Tr key={e.id}>
                  <Td className="max-w-[280px]">
                    <Link
                      href={`/organizer/events/${e.id}`}
                      className="font-extrabold hover:text-primary transition-colors block truncate"
                    >
                      {e.title}
                    </Link>
                    <span className="text-[11.5px] font-semibold text-ink-muted">
                      {e.categoryName} · {e.venueName}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <StatusPill status={e.status} />
                      {e.hasPendingChanges && (
                        <span className="text-[10.5px] font-bold text-status-warning-fg">
                          Edit awaiting review
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {e.firstSessionAt ? formatIstDate(e.firstSessionAt) : "—"}
                    {e.sessionCount > 1 && (
                      <span className="text-ink-muted"> +{e.sessionCount - 1}</span>
                    )}
                  </Td>
                  <Td numeric>
                    {e.sold}
                    <span className="text-ink-muted">/{e.capacity}</span>
                  </Td>
                  <Td numeric>{inr(e.grossPaise)}</Td>
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
        basePath="/organizer/events"
        params={{ status: status === "ALL" ? undefined : status, q }}
      />
    </div>
  );
}
