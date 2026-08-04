import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, DoorClosed, ScanLine, Users } from "lucide-react";
import { StatusPill } from "@/components/ui";
import { StatCard } from "@/components/dash/stat-card";
import { requireOrganizer } from "@/lib/auth/rbac";
import { getEventLiveBoard } from "@/lib/queries/organizer/events";
import { formatIstTime } from "@/lib/ist";
import { EventTabs } from "../event-tabs";
import { GateCloseToggle } from "../event-forms";

export const metadata: Metadata = { title: "Live board" };

/**
 * The gate board on event night.
 *
 * `revalidate = 10` rather than a websocket: the numbers people act on here —
 * how full is Gate 2, are we ahead of last night — change on the scale of
 * seconds-to-minutes, and a 10-second server revalidation gets that without a
 * socket to keep alive on a phone tethered at a ground.
 */
export const revalidate = 10;

export default async function EventLivePage({
  params,
}: PageProps<"/organizer/events/[id]/live">) {
  const ctx = await requireOrganizer({ allowUnverified: true });
  const { id } = await params;

  const board = await getEventLiveBoard(ctx.organizerId, id);
  if (!board) notFound();

  const totalScanned = board.ticketTotals.scanned;
  const totalActive = board.ticketTotals.active;
  const admitted = totalScanned + totalActive;
  const pct = admitted > 0 ? Math.round((totalScanned / admitted) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href={`/organizer/events/${id}`}
          className="inline-flex items-center gap-1.5 text-[12px] font-bold text-ink-muted hover:text-ink mb-2"
        >
          <ArrowLeft size={14} strokeWidth={2.6} />
          {board.event.title}
        </Link>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[20px] font-extrabold leading-tight">
            Live board
          </h1>
          <StatusPill status={board.event.status} />
          {board.event.gatesClosedAt && (
            <StatusPill
              tone="danger"
              label={`Gates closed ${formatIstTime(board.event.gatesClosedAt)}`}
            />
          )}
        </div>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          Refreshes every 10 seconds.
        </p>
      </div>

      <EventTabs eventId={id} active="live" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Scanned in"
          value={totalScanned.toLocaleString("en-IN")}
          hint={`${pct}% of everyone expected`}
          Icon={ScanLine}
          tone="positive"
        />
        <StatCard
          label="Still to arrive"
          value={totalActive.toLocaleString("en-IN")}
          Icon={Users}
        />
        <StatCard
          label="Cancelled"
          value={board.ticketTotals.cancelled.toLocaleString("en-IN")}
          hint="Refunded tickets"
        />
        <StatCard
          label="Gates"
          value={board.event.gatesClosedAt ? "Closed" : "Open"}
          hint={
            board.event.gatesClosedAt
              ? "Scanners answer GATES_CLOSED"
              : `${board.gates.length} gate${board.gates.length === 1 ? "" : "s"} configured`
          }
          Icon={DoorClosed}
          tone={board.event.gatesClosedAt ? "danger" : "default"}
        />
      </div>

      <div className="bg-surface border border-border rounded-[var(--radius-card)] p-4 lg:p-5">
        <h2 className="text-[14.5px] font-extrabold mb-1">Gate control</h2>
        <p className="text-[11.5px] font-semibold text-ink-muted mb-3.5">
          Closing the gates does not cancel anything — it tells every scanner to
          stop admitting. Reversible.
        </p>
        <GateCloseToggle
          eventId={id}
          closed={board.event.gatesClosedAt !== null}
          readOnly={ctx.readOnly}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-[var(--radius-card)] p-4 lg:p-5">
          <h2 className="text-[14.5px] font-extrabold mb-3.5">By tier</h2>
          <ul className="flex flex-col gap-3">
            {board.tiers.map((t) => {
              const share = t.sold > 0 ? (t.scanned / t.sold) * 100 : 0;
              return (
                <li key={t.id}>
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <span className="text-[13px] font-bold truncate">
                      {t.name}
                    </span>
                    <span className="text-[12px] font-extrabold tabular shrink-0">
                      {t.scanned}
                      <span className="text-ink-muted">/{t.sold}</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-divider overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.min(100, share)}%` }}
                    />
                  </div>
                </li>
              );
            })}
            {board.tiers.length === 0 && (
              <li className="text-[12.5px] font-semibold text-ink-muted">
                No tiers configured yet.
              </li>
            )}
          </ul>
        </div>

        <div className="bg-surface border border-border rounded-[var(--radius-card)] p-4 lg:p-5">
          <h2 className="text-[14.5px] font-extrabold mb-3.5">By gate</h2>
          {board.gates.length === 0 ? (
            <p className="text-[12.5px] font-semibold text-ink-muted">
              No gates yet. Add one on the event&apos;s Details tab, then assign
              staff to it.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {board.gates.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-3 border-b border-divider last:border-0 pb-2.5 last:pb-0"
                >
                  <span className="text-[13px] font-bold truncate">
                    <span className="text-ink-muted tabular mr-1.5">
                      {g.code}
                    </span>
                    {g.name}
                  </span>
                  <span className="text-[13px] font-extrabold tabular shrink-0">
                    {g.scanned.toLocaleString("en-IN")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
