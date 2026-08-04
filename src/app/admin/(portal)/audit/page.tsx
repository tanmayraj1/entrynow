import type { Metadata } from "next";
import { FileClock } from "lucide-react";
import { EmptyState, Pagination, StatusPill, Tabs } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/rbac";
import { listAuditLog } from "@/lib/queries/admin/queries";
import { formatIstDate, formatIstTime } from "@/lib/ist";

export const metadata: Metadata = { title: "Audit log" };

const FILTERS = [
  { key: "", label: "Everything" },
  { key: "event", label: "Events" },
  { key: "organizer", label: "Organizers" },
  { key: "payout", label: "Payouts" },
  { key: "refund", label: "Refunds" },
  { key: "dispute", label: "Disputes" },
  { key: "config", label: "Config" },
];

/**
 * The audit trail (invariant I6).
 *
 * Every admin and organizer mutation writes a row here inside the same
 * transaction as the change it describes, so a rolled-back change leaves no
 * record and a recorded change definitely happened. Audit check A13 fails the
 * build if a portal action mutates without one.
 */
export default async function AdminAuditPage({
  searchParams,
}: PageProps<"/admin/audit">) {
  await requireAdmin("SUPER");
  const sp = await searchParams;

  const action = typeof sp.action === "string" ? sp.action : undefined;
  const page = Number(typeof sp.page === "string" ? sp.page : 1) || 1;

  const { rows, total, pageCount } = await listAuditLog({ action, page });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[20px] font-extrabold leading-tight">Audit log</h1>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          {total.toLocaleString("en-IN")} entries. Append-only — KYC and banking
          fields are redacted at write time, so they never appear here.
        </p>
      </div>

      <Tabs
        ariaLabel="Audit filter"
        items={FILTERS.map((f) => ({
          href: f.key ? `/admin/audit?action=${f.key}` : "/admin/audit",
          label: f.label,
          active: (action ?? "") === f.key,
        }))}
      />

      {rows.length === 0 ? (
        <div className="bg-surface border border-border rounded-[var(--radius-card)]">
          <EmptyState icon={FileClock} title="Nothing recorded in this slice" />
        </div>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <li
              key={r.id}
              className="bg-surface border border-border rounded-[var(--radius-card)] p-3.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <code className="text-[12px] font-extrabold text-primary">
                    {r.action}
                  </code>
                  <StatusPill
                    tone={
                      r.actorType === "ADMIN"
                        ? "danger"
                        : r.actorType === "SYSTEM"
                          ? "cancelled"
                          : "pending"
                    }
                    label={r.actorType}
                  />
                  <span className="text-[11.5px] font-semibold text-ink-muted truncate">
                    {r.actor?.name ?? r.actor?.phone ?? "system"} ·{" "}
                    {r.entityType}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-ink-muted tabular shrink-0">
                  {formatIstDate(r.createdAt)} {formatIstTime(r.createdAt)}
                  {r.ip && ` · ${r.ip}`}
                </span>
              </div>

              <div className="grid sm:grid-cols-2 gap-2 mt-2.5">
                <Json label="Before" value={r.before} />
                <Json label="After" value={r.after} />
              </div>
            </li>
          ))}
        </ol>
      )}

      <Pagination
        page={page}
        pageCount={pageCount}
        total={total}
        basePath="/admin/audit"
        params={{ action }}
      />
    </div>
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) {
    return (
      <div>
        <p className="text-[10.5px] font-extrabold text-ink-muted uppercase tracking-wide">
          {label}
        </p>
        <p className="text-[11.5px] font-semibold text-ink-muted">—</p>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-extrabold text-ink-muted uppercase tracking-wide">
        {label}
      </p>
      {/* Its own horizontal scroll — a long JSON blob must not make the page
          body scroll sideways on a phone. */}
      <pre className="text-[11px] font-semibold bg-divider rounded-[8px] px-2.5 py-2 mt-1 overflow-x-auto">
        {JSON.stringify(value, null, 1)}
      </pre>
    </div>
  );
}
