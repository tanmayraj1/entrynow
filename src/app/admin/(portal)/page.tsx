import Link from "next/link";
import type { Metadata } from "next";
import {
  BadgeCheck,
  Banknote,
  IndianRupee,
  LifeBuoy,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";
import { StatCard } from "@/components/dash/stat-card";
import { hasPermission, requireAdmin } from "@/lib/auth/rbac";
import { getAdminOverview, listAuditLog } from "@/lib/queries/admin/queries";
import { formatIstDate, formatIstTime } from "@/lib/ist";


export const metadata: Metadata = { title: "Admin" };

export default async function AdminOverviewPage() {
  const ctx = await requireAdmin("SUPPORT");
  const isSuper = hasPermission(ctx.permissions, "SUPER");
  const [o, audit] = await Promise.all([
    getAdminOverview(),
    // Only fetched for the role that may see it — not fetched then hidden.
    isSuper ? listAuditLog({ perPage: 6 }) : Promise.resolve({ rows: [] }),
  ]);
  const recent = audit.rows;

  const queues = [
    {
      href: "/admin/approvals",
      label: "Events awaiting review",
      count: o.pendingApprovals,
      Icon: BadgeCheck,
      permission: "APPROVALS" as const,
    },
    {
      href: "/admin/organizers?status=KYC_IN_REVIEW",
      label: "KYC awaiting review",
      count: o.pendingKyc,
      Icon: Users,
      permission: "APPROVALS" as const,
    },
    {
      href: "/admin/disputes",
      label: "Open disputes",
      count: o.openDisputes,
      Icon: LifeBuoy,
      permission: "SUPPORT" as const,
    },
    {
      href: "/admin/finance",
      label: "Payouts to action",
      count: o.payoutsAwaiting,
      Icon: Banknote,
      permission: "FINANCE" as const,
    },
  ].filter((q) => hasPermission(ctx.permissions, q.permission));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[20px] font-extrabold leading-tight">Overview</h1>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          Everything across every organizer.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="GMV"
          paise={o.gmvPaise}
          hint="All confirmed bookings"
          Icon={IndianRupee}
        />
        <StatCard
          label="Platform net"
          paise={o.platformNetPaise}
          hint="Commission + fees, incl. GST held"
          Icon={Wallet}
          tone="positive"
        />
        <StatCard
          label="Owed to organizers"
          paise={o.unsettledPaise}
          hint="Unsettled ledger"
          Icon={Banknote}
          tone={o.unsettledPaise > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Tickets sold"
          value={o.ticketsSold.toLocaleString("en-IN")}
          hint={`${o.liveEvents} live · ${o.organizers} organizers`}
          Icon={Ticket}
        />
      </div>

      <section>
        <h2 className="text-[14px] font-extrabold mb-3">Your queues</h2>
        {queues.length === 0 ? (
          <p className="text-[12.5px] font-semibold text-ink-muted">
            Your role has no action queues.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {queues.map((q) => (
              <Link
                key={q.href}
                href={q.href}
                className="bg-surface border border-border rounded-[var(--radius-card)] p-4 hover:border-primary transition-colors group"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="grid place-items-center size-8 rounded-[9px] bg-primary-tint text-primary">
                    <q.Icon size={15} strokeWidth={2.3} />
                  </span>
                  <span
                    className={
                      q.count > 0
                        ? "text-[24px] font-extrabold tabular leading-none text-primary"
                        : "text-[24px] font-extrabold tabular leading-none text-ink-muted"
                    }
                  >
                    {q.count}
                  </span>
                </div>
                <p className="mt-2.5 text-[12.5px] font-bold group-hover:text-primary transition-colors">
                  {q.label}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* The overview used to stop at the queue cards, leaving two thirds of
          the first screen an admin ever sees completely blank. The audit log
          already records every action with before/after values — surfacing the
          last few of them turns a landing page into a place you can tell at a
          glance whether anything happened overnight.

          SUPER only, matching the "Read the log" link below it: a sub-admin
          should not learn what desks they cannot reach have been doing. */}
      {hasPermission(ctx.permissions, "SUPER") && (
        <section>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-[14px] font-extrabold">Recent activity</h2>
            <Link
              href="/admin/audit"
              className="text-[12px] font-bold text-primary hover:underline"
            >
              Full audit log →
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-[12.5px] font-semibold text-ink-muted bg-surface border border-border rounded-[var(--radius-card)] p-4">
              Nothing recorded yet. Every approval, suspension, payout and
              config change lands here with its before and after values.
            </p>
          ) : (
            <ol className="bg-surface border border-border rounded-[var(--radius-card)] divide-y divide-divider">
              {recent.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <code className="text-[12px] font-extrabold text-primary shrink-0">
                      {r.action}
                    </code>
                    <span className="text-[12px] font-semibold text-ink-muted truncate">
                      {r.actor?.name ?? r.actor?.phone ?? "system"} ·{" "}
                      {r.entityType.toLowerCase()}
                    </span>
                  </span>
                  <span className="text-[11.5px] font-semibold text-ink-muted tabular shrink-0">
                    {formatIstDate(r.createdAt)} {formatIstTime(r.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <p className="text-[11.5px] font-semibold text-ink-muted">
        Every action taken here writes an audit row with before/after values.
        {hasPermission(ctx.permissions, "SUPER") && (
          <>
            {" "}
            <Link href="/admin/audit" className="text-primary font-bold hover:underline">
              Read the log
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
