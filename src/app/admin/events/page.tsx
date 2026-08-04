import Link from "next/link";
import type { Metadata } from "next";
import { Calendar } from "lucide-react";
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
import { requireAdmin } from "@/lib/auth/rbac";
import { listAllEvents } from "@/lib/queries/admin/queries";
import { formatIstDate } from "@/lib/ist";

export const metadata: Metadata = { title: "All events" };

const TABS = [
  { key: "ALL", label: "All" },
  { key: "LIVE", label: "Live" },
  { key: "PAUSED", label: "Paused" },
  { key: "IN_REVIEW", label: "In review" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELLED", label: "Cancelled" },
];

export default async function AdminEventsPage({
  searchParams,
}: PageProps<"/admin/events">) {
  await requireAdmin("SUPPORT");
  const sp = await searchParams;

  const status = typeof sp.status === "string" ? sp.status : "ALL";
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const page = Number(typeof sp.page === "string" ? sp.page : 1) || 1;

  const { rows, total, pageCount } = await listAllEvents({ status, q, page });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[20px] font-extrabold leading-tight">All events</h1>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          Every organizer&apos;s. Pause takes an event off the listings
          instantly; cancel refunds everyone and cannot be undone.
        </p>
      </div>

      <Tabs
        ariaLabel="Event status"
        items={TABS.map((t) => ({
          href: t.key === "ALL" ? "/admin/events" : `/admin/events?status=${t.key}`,
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
          placeholder="Event title"
          aria-label="Search events"
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
          <EmptyState icon={Calendar} title="No events match" />
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Event</Th>
                <Th>Organizer</Th>
                <Th>Status</Th>
                <Th numeric>Bookings</Th>
                <Th numeric>Tickets</Th>
                <Th numeric>Disputes</Th>
              </Tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <Tr key={e.id}>
                  <Td className="max-w-[260px]">
                    <Link
                      href={`/admin/events/${e.id}`}
                      className="font-extrabold hover:text-primary transition-colors block truncate"
                    >
                      {e.title}
                    </Link>
                    <span className="text-[11.5px] font-semibold text-ink-muted">
                      {e.city.name} · {formatIstDate(e.createdAt)}
                    </span>
                  </Td>
                  <Td className="max-w-[160px] truncate">
                    <Link
                      href={`/admin/organizers/${e.organizer.id}`}
                      className="hover:text-primary transition-colors"
                    >
                      {e.organizer.name}
                    </Link>
                  </Td>
                  <Td>
                    <StatusPill status={e.status} />
                  </Td>
                  <Td numeric>{e._count.bookings}</Td>
                  <Td numeric>{e._count.tickets}</Td>
                  <Td
                    numeric
                    className={
                      e._count.disputes > 0 ? "text-danger font-extrabold" : undefined
                    }
                  >
                    {e._count.disputes}
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
        basePath="/admin/events"
        params={{ status: status === "ALL" ? undefined : status, q }}
      />
    </div>
  );
}
