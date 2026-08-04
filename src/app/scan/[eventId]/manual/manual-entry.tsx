"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Look a ticket up by its number, then admit it.
 *
 * Two steps on purpose. The camera path has a QR to prove the holder has the
 * ticket; typing a number does not, so the operator is shown *who* the ticket
 * belongs to and confirms before the ticket is burned. One-step manual entry
 * means a typo silently admits a stranger and marks someone else's ticket used.
 */
export function ManualEntry({
  eventId,
  gates,
  defaultGateId,
}: {
  eventId: string;
  gates: { id: string; name: string; code: string }[];
  defaultGateId: string | null;
}) {
  const [gateId, setGateId] = React.useState(defaultGateId ?? gates[0]?.id ?? "");
  const [number, setNumber] = React.useState("");
  const [looking, setLooking] = React.useState(false);
  const [found, setFound] = React.useState<{
    qrToken: string;
    ticketNumber: string;
    attendeeName: string;
    tierName: string;
    status: string;
    sessionLabel: string | null;
  } | null>(null);
  const [outcome, setOutcome] = React.useState<{
    result: string;
    message: string;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOutcome(null);
    setFound(null);
    setLooking(true);
    try {
      const res = await fetch(
        `/api/scan/lookup?eventId=${eventId}&ticketNumber=${encodeURIComponent(number.trim())}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Not found.");
        return;
      }
      setFound(data.ticket);
    } catch {
      setError("No connection. The camera works offline; manual lookup does not.");
    } finally {
      setLooking(false);
    }
  }

  async function admit() {
    if (!found) return;
    setLooking(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: found.qrToken,
          eventId,
          gateId: gateId || null,
          deviceScannedAt: new Date().toISOString(),
        }),
      });
      const data = await res.json();
      setOutcome({ result: data.result, message: data.message });
      setFound(null);
      setNumber("");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLooking(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {gates.length > 0 && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-extrabold text-ink-muted">GATE</span>
          <select
            value={gateId}
            onChange={(e) => setGateId(e.target.value)}
            className="bg-surface border border-border rounded-[12px] px-3.5 py-3 text-[13.5px] font-bold text-ink outline-none"
          >
            {gates.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code} · {g.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <form onSubmit={lookup} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-extrabold text-ink-muted">
            TICKET NUMBER
          </span>
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value.toUpperCase())}
            placeholder="EN-GRB-0412"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="bg-surface border border-border rounded-[12px] px-3.5 py-3 text-[16px] font-extrabold tabular text-ink outline-none focus:border-primary"
          />
        </label>
        <button
          type="submit"
          data-hit
          disabled={looking || number.trim().length < 4}
          className="rounded-full bg-primary text-[#0a1226] px-5 py-3 text-[13.5px] font-extrabold disabled:opacity-45 cursor-pointer"
        >
          {looking ? "Checking…" : "Look up"}
        </button>
      </form>

      {error && (
        <p role="alert" className="text-[13px] font-bold text-danger">
          {error}
        </p>
      )}

      {found && (
        <div className="rounded-[16px] border border-border bg-surface p-4">
          <p className="text-[11px] font-extrabold text-ink-muted">
            CONFIRM THIS IS THEM
          </p>
          <p className="text-[17px] font-extrabold mt-1.5">
            {found.attendeeName}
          </p>
          <p className="text-[12.5px] font-semibold text-ink-muted">
            {found.tierName}
            {found.sessionLabel && ` · ${found.sessionLabel}`} ·{" "}
            <span className="tabular">{found.ticketNumber}</span>
          </p>
          <button
            type="button"
            data-hit
            onClick={() => void admit()}
            disabled={looking}
            className="w-full mt-4 rounded-full bg-primary text-[#0a1226] px-5 py-3 text-[13.5px] font-extrabold disabled:opacity-45 cursor-pointer"
          >
            Admit
          </button>
        </div>
      )}

      {outcome && (
        <div
          role="status"
          className={cn(
            "flex items-center gap-3 rounded-[16px] px-4 py-3.5",
            outcome.result === "VALID"
              ? "bg-status-success-bg text-status-success-fg"
              : outcome.result === "ALREADY_SCANNED"
                ? "bg-status-warning-bg text-status-warning-fg"
                : "bg-status-danger-bg text-status-danger-fg",
          )}
        >
          {outcome.result === "VALID" ? (
            <Check size={20} strokeWidth={3} className="shrink-0" />
          ) : (
            <X size={20} strokeWidth={3} className="shrink-0" />
          )}
          <span className="text-[13.5px] font-extrabold">{outcome.message}</span>
        </div>
      )}
    </div>
  );
}
