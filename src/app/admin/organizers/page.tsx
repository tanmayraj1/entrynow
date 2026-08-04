import Link from "next/link";
import type { Metadata } from "next";
import { Users } from "lucide-react";
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
import { listOrganizers } from "@/lib/queries/admin/queries";
import { formatIstDate } from "@/lib/ist";
import { inr } from "@/lib/money";

export const metadata: Metadata = { title: "Organizers" };

const TABS = [
  { key: "ALL", label: "All" },
  { key: "KYC_IN_REVIEW", label: "KYC queue" },
  { key: "VERIFIED", label: "Verified" },
  { key: "SUSPENDED", label: "Suspended" },
  { key: "KYC_REJECTED", label: "Rejected" },
];

export default async function AdminOrganizersPage({
  searchParams,
}: PageProps<"/admin/organizers">) {
  await requireAdmin("APPROVALS");
  const sp = await searchParams;

  const status = typeof sp.status === "string" ? sp.status : "ALL";
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const page = Number(typeof sp.page === "string" ? sp.page : 1) || 1;

  const { rows, total, pageCount } = await listOrganizers({ status, q, page });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[20px] font-extrabold leading-tight">Organizers</h1>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          {total.toLocaleString("en-IN")} accounts. Unsettled is what the next
          payout run owes them.
        </p>
      </div>

      <Tabs
        ariaLabel="Organizer status"
        items={TABS.map((t) => ({
          href:
            t.key === "ALL"
              ? "/admin/organizers"
              : `/admin/organizers?status=${t.key}`,
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
          placeholder="Name, legal name or slug"
          aria-label="Search organizers"
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
          <EmptyState icon={Users} title="No organizers match" />
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Organizer</Th>
                <Th>Status</Th>
                <Th>Plan</Th>
                <Th numeric>Events</Th>
                <Th numeric>Unsettled</Th>
                <Th>Joined</Th>
              </Tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <Tr key={o.id}>
                  <Td className="max-w-[260px]">
                    <Link
                      href={`/admin/organizers/${o.id}`}
                      className="font-extrabold hover:text-primary transition-colors block truncate"
                    >
                      {o.name}
                    </Link>
                    <span className="text-[11.5px] font-semibold text-ink-muted">
                      {o.city?.name ?? "—"} · {o.user.phone ?? o.user.email ?? "—"}
                    </span>
                  </Td>
                  <Td>
                    <StatusPill status={o.status} />
                    {o.suspendedReason && (
                      <span className="block text-[10.5px] font-bold text-danger mt-1 max-w-[160px] truncate">
                        {o.suspendedReason}
                      </span>
                    )}
                  </Td>
                  <Td>
                    {o.plan ? (o.plan === "PRO" ? "Pro" : "Basic") : "—"}
                    {o.commissionPctOverride !== null && (
                      <span className="block text-[10.5px] font-bold text-ink-muted">
                        {o.commissionPctOverride}% commission
                      </span>
                    )}
                  </Td>
                  <Td numeric>{o._count.events}</Td>
                  <Td
                    numeric
                    className={o.unsettledPaise < 0 ? "text-danger" : undefined}
                  >
                    {inr(o.unsettledPaise)}
                  </Td>
                  <Td className="whitespace-nowrap text-ink-muted">
                    {formatIstDate(o.createdAt)}
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
        basePath="/admin/organizers"
        params={{ status: status === "ALL" ? undefined : status, q }}
      />
    </div>
  );
}
