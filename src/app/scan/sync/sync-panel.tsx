"use client";

import * as React from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { dequeue, loadManifest, queued } from "@/lib/scan/offline-queue";

interface Row {
  id: string;
  title: string;
  pending: number;
  manifestAt: string | null;
  manifestTickets: number;
}

export function SyncPanel({ events }: { events: { id: string; title: string }[] }) {
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  /**
   * Read the device's own state — queue depth and manifest freshness.
   *
   * A plain module function, not a hook: it takes what it needs and returns
   * rows, so the mount effect can await it inside an async closure rather than
   * calling a setState-carrying callback synchronously (which would cascade a
   * render on every mount).
   */
  const refresh = React.useCallback(async () => {
    setRows(await readDevice(events));
  }, [events]);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      const next = await readDevice(events);
      if (alive) setRows(next);
    })();
    return () => {
      alive = false;
    };
  }, [events]);

  async function push(eventId: string) {
    setBusy(eventId);
    setNote(null);
    try {
      const items = await queued(eventId);
      if (!items.length) {
        setNote("Nothing queued for that event.");
        return;
      }
      const res = await fetch("/api/scan/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventId,
          scans: items.map((i) => ({
            token: i.token,
            gateId: i.gateId,
            deviceScannedAt: i.deviceScannedAt,
            clientId: i.clientId,
          })),
        }),
      });
      if (!res.ok) {
        setNote("Still no connection. The queue is safe — try again in a moment.");
        return;
      }
      const data = await res.json();
      await dequeue(
        (data.results ?? [])
          .map((r: { clientId?: string }) => r.clientId)
          .filter(Boolean),
      );
      setNote(
        `Synced ${data.synced}. ${data.admitted} admitted` +
          (data.conflicts ? `, ${data.conflicts} were already scanned elsewhere.` : "."),
      );
      await refresh();
    } catch {
      setNote("Still no connection. The queue is safe — try again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  if (!rows) {
    return (
      <p className="text-[12.5px] font-semibold text-ink-muted">Reading device…</p>
    );
  }

  if (!rows.length) {
    return (
      <p className="text-[12.5px] font-semibold text-ink-muted">
        No events assigned to you.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div
          key={r.id}
          className="rounded-[16px] border border-border bg-surface p-4"
        >
          <p className="text-[13.5px] font-extrabold truncate">{r.title}</p>
          <p className="text-[11.5px] font-semibold text-ink-muted mt-1">
            {r.manifestAt
              ? `Manifest: ${r.manifestTickets.toLocaleString("en-IN")} tickets, pulled ${new Date(r.manifestAt).toLocaleTimeString("en-IN")}`
              : "No manifest on this device — the scanner will need a connection."}
          </p>
          <div className="flex items-center justify-between gap-3 mt-3">
            <span
              className={
                r.pending > 0
                  ? "flex items-center gap-1.5 text-[12.5px] font-extrabold text-status-warning-fg"
                  : "flex items-center gap-1.5 text-[12.5px] font-extrabold text-status-success-fg"
              }
            >
              {r.pending > 0 ? (
                <>
                  <CloudOff size={14} strokeWidth={2.6} />
                  {r.pending} waiting to sync
                </>
              ) : (
                "Everything synced"
              )}
            </span>
            {r.pending > 0 && (
              <button
                type="button"
                data-hit
                onClick={() => void push(r.id)}
                disabled={busy === r.id}
                className="flex items-center gap-1.5 rounded-full bg-primary text-[#0a1226] px-3.5 py-2 text-[12px] font-extrabold disabled:opacity-45 cursor-pointer"
              >
                <RefreshCw
                  size={13}
                  strokeWidth={2.6}
                  style={
                    busy === r.id
                      ? { animation: "se-spin 1s linear infinite" }
                      : undefined
                  }
                />
                Push now
              </button>
            )}
          </div>
        </div>
      ))}

      {note && (
        <p role="status" className="text-[12.5px] font-bold text-primary">
          {note}
        </p>
      )}
    </div>
  );
}

async function readDevice(
  events: { id: string; title: string }[],
): Promise<Row[]> {
  return Promise.all(
    events.map(async (e) => {
      const [q, m] = await Promise.all([queued(e.id), loadManifest(e.id)]);
      return {
        id: e.id,
        title: e.title,
        pending: q.length,
        manifestAt: m?.syncedAt ?? null,
        manifestTickets: m?.tickets.length ?? 0,
      };
    }),
  );
}
