"use client";

import * as React from "react";
import Link from "next/link";
import {
  CameraOff,
  Check,
  Keyboard,
  RefreshCw,
  WifiOff,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  dequeue,
  enqueue,
  loadManifest,
  markUsedLocally,
  newClientId,
  queued,
  saveManifest,
  type ManifestTicket,
} from "@/lib/scan/offline-queue";

/**
 * The viewfinder.
 *
 * Three things drive every decision in this file, in order:
 *
 * 1. **It runs on a borrowed phone, at night, with no signal.** So the
 *    manifest is pulled before gates open, decisions are made locally when the
 *    network is gone, and every offline scan is queued for replay rather than
 *    dropped.
 * 2. **The person holding it is looking at a queue, not the screen.** So the
 *    result is a full-screen colour flash readable at arm's length in one
 *    glance — green admit, amber duplicate, red refuse — and it clears itself.
 * 3. **The device is never the authority.** An offline "valid" is optimistic
 *    and says so. The server's atomic claim decides who was admitted, and the
 *    replay runs through the identical code path an online scan takes.
 *
 * `BarcodeDetector` is used where it exists (Chrome/Android, which is what
 * gate staff actually carry). Where it does not — iOS Safari — the camera is
 * not offered at all rather than shown broken, and manual entry takes over.
 * A viewfinder that never fires is worse than no viewfinder.
 */

type Flash = {
  result: string;
  message: string;
  ticket?: {
    ticketNumber: string;
    attendeeName: string;
    tierName: string;
    sessionLabel: string | null;
  };
  previousScan?: { at: string; gateName: string | null };
  optimistic?: boolean;
};

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

export function ScannerClient({
  eventId,
  eventTitle,
  gates,
  defaultGateId,
  gatesClosed,
  initialScanned,
}: {
  eventId: string;
  eventTitle: string;
  gates: { id: string; name: string; code: string }[];
  defaultGateId: string | null;
  gatesClosed: boolean;
  initialScanned: number;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [gateId, setGateId] = React.useState(defaultGateId ?? gates[0]?.id ?? "");
  const [flash, setFlash] = React.useState<Flash | null>(null);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [online, setOnline] = React.useState(true);
  const [pending, setPending] = React.useState(0);
  const [admitted, setAdmitted] = React.useState(initialScanned);
  const [manifestAt, setManifestAt] = React.useState<string | null>(null);
  const [syncing, setSyncing] = React.useState(false);
  const [supported, setSupported] = React.useState<boolean | null>(null);

  // A scan in flight, and the token it was for. Guards the detection loop from
  // firing forty times on one steady QR while the request is in the air.
  const busyRef = React.useRef(false);
  const lastTokenRef = React.useRef<{ token: string; at: number } | null>(null);
  // The selected gate, mirrored into a ref so `submit` never has to depend on
  // it. `submit` IS a dependency of the camera effect, and a camera effect
  // that re-runs tears down the MediaStream and re-prompts — changing gate
  // mid-shift would blank the viewfinder. Written in an effect rather than
  // during render: a ref mutated in the render body is unsafe under concurrent
  // rendering, where a render can be discarded.
  const gateRef = React.useRef(gateId);
  React.useEffect(() => {
    gateRef.current = gateId;
  }, [gateId]);

  // --- Network state --------------------------------------------------------
  React.useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // --- Manifest -------------------------------------------------------------
  const pullManifest = React.useCallback(async () => {
    try {
      const cached = await loadManifest(eventId);
      const since = cached?.syncedAt;
      const res = await fetch(
        `/api/scan/manifest?eventId=${eventId}${since ? `&since=${encodeURIComponent(since)}` : ""}`,
      );
      if (!res.ok) return;
      const data = await res.json();

      // A delta merges into what is already stored; a full pull replaces it.
      // Merging a delta by qrTokenId, not appending, or a status change would
      // leave two rows for one ticket and the older one could win.
      const merged = new Map<string, ManifestTicket>(
        data.delta && cached
          ? cached.tickets.map((t: ManifestTicket) => [t.qrTokenId, t])
          : [],
      );
      for (const t of data.tickets as ManifestTicket[]) {
        merged.set(t.qrTokenId, t);
      }

      await saveManifest({
        eventId,
        syncedAt: data.syncedAt,
        sessionId: data.session.id,
        sessionSequence: data.session.sequence,
        tickets: [...merged.values()],
        usedTokens: cached?.usedTokens ?? [],
      });
      setManifestAt(data.syncedAt);
    } catch {
      // Offline. The cached manifest is still there and still usable — that is
      // the entire point of having pulled it.
    }
  }, [eventId]);

  React.useEffect(() => {
    let alive = true;
    // Inside an async closure, so the mount pull is not a synchronous setState
    // in the effect body — that cascades a render on every mount, and this
    // component is re-rendering on every decoded frame already.
    void (async () => {
      if (alive) await pullManifest();
    })();
    const id = setInterval(() => void pullManifest(), 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pullManifest]);

  // --- Queue sync -----------------------------------------------------------
  const syncQueue = React.useCallback(async () => {
    const items = await queued(eventId);
    setPending(items.length);
    if (!items.length || !navigator.onLine) return;

    setSyncing(true);
    try {
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
      if (!res.ok) return;
      const data = await res.json();
      // Only the ids the server actually reported back — a partial response
      // must not delete scans it never processed.
      const done: string[] = (data.results ?? [])
        .map((r: { clientId?: string }) => r.clientId)
        .filter(Boolean);
      await dequeue(done);
      setPending((await queued(eventId)).length);
    } catch {
      // Still offline. The queue survives; the next attempt picks it up.
    } finally {
      setSyncing(false);
    }
  }, [eventId]);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await syncQueue();
    })();
    // Re-runs when `online` flips, so reconnecting drains the queue at once
    // rather than waiting out the interval with an operator watching.
    const id = setInterval(() => void syncQueue(), 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [syncQueue, online]);

  // --- Submitting a scan ----------------------------------------------------
  const submit = React.useCallback(
    async (token: string) => {
      if (busyRef.current) return;
      // The camera sees the same QR many times a second. Ignoring a repeat of
      // the same token within 2.5s stops one held-up phone from generating
      // dozens of ALREADY_SCANNED rows.
      const last = lastTokenRef.current;
      if (last && last.token === token && Date.now() - last.at < 2500) return;

      busyRef.current = true;
      lastTokenRef.current = { token, at: Date.now() };

      try {
        if (navigator.onLine) {
          const res = await fetch("/api/scan", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              token,
              eventId,
              gateId: gateRef.current || null,
              deviceScannedAt: new Date().toISOString(),
            }),
          });
          const data = await res.json();
          setFlash(data);
          if (data.result === "VALID") setAdmitted((n) => n + 1);
        } else {
          setFlash(await judgeOffline(eventId, token, gateRef.current || null));
          setPending((await queued(eventId)).length);
        }
      } catch {
        // A fetch that throws mid-scan is a network drop, not a bad ticket.
        // Fall back to the offline judgement so the queue keeps moving.
        setFlash(await judgeOffline(eventId, token, gateRef.current || null));
        setPending((await queued(eventId)).length);
      } finally {
        busyRef.current = false;
      }
    },
    [eventId],
  );

  // Auto-clear. Long enough to read, short enough that the next person is not
  // waiting on a tap.
  React.useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), flash.result === "VALID" ? 1400 : 2600);
    return () => clearTimeout(id);
  }, [flash]);

  // --- Camera ---------------------------------------------------------------
  React.useEffect(() => {
    const Detector = (
      window as unknown as { BarcodeDetector?: new (o: object) => BarcodeDetectorLike }
    ).BarcodeDetector;
    const usable = Boolean(Detector && navigator.mediaDevices?.getUserMedia);

    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    void (async () => {
      // Capability detection reports asynchronously for the same reason the
      // two effects above do: a synchronous setState here cascades a render
      // before the camera has even been asked for.
      if (!stopped) setSupported(usable);
      if (!usable || !Detector) return;
      const detector = new Detector({ formats: ["qr_code"] });
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // `environment` is the rear camera. Without it a phone opens the
          // selfie camera and the operator is scanning their own face.
          video: { facingMode: "environment" },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const el = videoRef.current;
        if (!el) return;
        el.srcObject = stream;
        await el.play();

        const tick = async () => {
          if (stopped) return;
          try {
            if (el.readyState >= 2) {
              const codes = await detector.detect(el);
              if (codes.length) await submit(codes[0].rawValue);
            }
          } catch {
            // A single failed frame is normal — motion blur, bad focus.
          }
          raf = requestAnimationFrame(() => void tick());
        };
        raf = requestAnimationFrame(() => void tick());
      } catch (err) {
        setCameraError(
          (err as Error).name === "NotAllowedError"
            ? "Camera permission was refused. Allow it in your browser settings, or use manual entry."
            : "No camera available on this device.",
        );
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [submit]);

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Link
          href="/scan"
          aria-label="Back to events"
          className="grid place-items-center size-9 rounded-[10px] border border-border shrink-0"
        >
          <X size={17} strokeWidth={2.4} />
        </Link>
        <div className="min-w-0 grow">
          <p className="text-[13.5px] font-extrabold truncate">{eventTitle}</p>
          <p className="text-[11px] font-semibold text-ink-muted">
            {admitted.toLocaleString("en-IN")} admitted
            {pending > 0 && ` · ${pending} queued`}
          </p>
        </div>
        {!online && (
          <span className="flex items-center gap-1.5 rounded-full bg-status-warning-bg px-2.5 py-1 text-[10.5px] font-extrabold text-status-warning-fg shrink-0">
            <WifiOff size={12} strokeWidth={2.6} />
            Offline
          </span>
        )}
        {online && pending > 0 && (
          <button
            type="button"
            data-hit
            onClick={() => void syncQueue()}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-full bg-primary-tint px-2.5 py-1 text-[10.5px] font-extrabold text-primary shrink-0 cursor-pointer"
          >
            <RefreshCw
              size={12}
              strokeWidth={2.6}
              style={syncing ? { animation: "se-spin 1s linear infinite" } : undefined}
            />
            Sync
          </button>
        )}
      </header>

      {gatesClosed && (
        <p className="bg-danger-tint text-danger px-4 py-2.5 text-[12.5px] font-extrabold">
          Gates are closed — every scan will be refused.
        </p>
      )}

      <div className="relative grow bg-black overflow-hidden">
        {supported === false || cameraError ? (
          <div className="absolute inset-0 grid place-items-center px-8 text-center">
            <div>
              <CameraOff
                size={30}
                strokeWidth={1.8}
                className="text-ink-muted mx-auto mb-3"
              />
              <p className="text-[13.5px] font-extrabold">
                {cameraError ?? "This browser cannot scan QR codes"}
              </p>
              <p className="text-[12px] font-semibold text-ink-muted mt-1.5">
                {cameraError
                  ? "Manual entry works either way."
                  : "Use Chrome on Android, or type the ticket number below."}
              </p>
              <Link
                href={`/scan/${eventId}/manual`}
                className="inline-flex items-center gap-1.5 mt-4 rounded-full bg-primary text-[#0a1226] px-4 py-2.5 text-[12.5px] font-extrabold"
              >
                <Keyboard size={15} strokeWidth={2.6} />
                Manual entry
              </Link>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 size-full object-cover"
            />
            {/* Reticle. Purely an aiming aid — detection reads the whole frame,
                because cropping to the box makes a hurried operator's near-miss
                a non-scan instead of a scan. */}
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div className="relative size-[62vw] max-w-[280px] max-h-[280px]">
                {(["tl", "tr", "bl", "br"] as const).map((corner) => (
                  <span
                    key={corner}
                    className={cn(
                      "absolute size-9 border-primary",
                      corner === "tl" && "top-0 left-0 border-t-4 border-l-4 rounded-tl-[14px]",
                      corner === "tr" && "top-0 right-0 border-t-4 border-r-4 rounded-tr-[14px]",
                      corner === "bl" && "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-[14px]",
                      corner === "br" && "bottom-0 right-0 border-b-4 border-r-4 rounded-br-[14px]",
                    )}
                  />
                ))}
                <span
                  data-motion="scanline"
                  className="absolute inset-x-2 top-2 h-0.5 bg-primary/70 rounded-full"
                  style={{
                    animation: "se-scanline 2.4s ease-in-out infinite",
                    ["--scan-travel" as string]: "calc(62vw - 16px)",
                  }}
                />
              </div>
            </div>
          </>
        )}

        {flash && <ResultFlash flash={flash} onDismiss={() => setFlash(null)} />}
      </div>

      <footer className="flex items-center gap-2 px-4 py-3 border-t border-border">
        {gates.length > 0 && (
          <label className="flex items-center gap-2 min-w-0 grow">
            <span className="text-[11px] font-extrabold text-ink-muted shrink-0">
              GATE
            </span>
            <select
              value={gateId}
              onChange={(e) => setGateId(e.target.value)}
              className="min-w-0 grow bg-surface border border-border rounded-[10px] px-2.5 py-2 text-[12.5px] font-bold text-ink outline-none"
            >
              {gates.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code} · {g.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Link
          href={`/scan/${eventId}/manual`}
          className="shrink-0 grid place-items-center size-10 rounded-[10px] border border-border"
          aria-label="Manual entry"
        >
          <Keyboard size={17} strokeWidth={2.4} />
        </Link>
      </footer>

      {manifestAt && (
        <p className="sr-only" role="status">
          Manifest synced {manifestAt}
        </p>
      )}
    </div>
  );
}

/**
 * The full-screen verdict.
 *
 * Colour first, words second: someone glancing down from a queue reads green
 * or red before they read anything. `--flash-valid/duplicate/invalid` are
 * defined in the scanner theme, and green stays "go" regardless of brand —
 * at a gate, "proceed" must never be a branding decision.
 */
function ResultFlash({
  flash,
  onDismiss,
}: {
  flash: Flash;
  onDismiss: () => void;
}) {
  const tone =
    flash.result === "VALID"
      ? "valid"
      : flash.result === "ALREADY_SCANNED"
        ? "duplicate"
        : "invalid";

  return (
    <button
      type="button"
      onClick={onDismiss}
      aria-live="assertive"
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 px-8 text-center text-white cursor-pointer"
      style={{
        background: `var(--flash-${tone})`,
        animation: "se-flashin 140ms ease-out",
      }}
    >
      <span className="grid place-items-center size-16 rounded-full bg-white/20">
        {flash.result === "VALID" ? (
          <Check size={34} strokeWidth={3} />
        ) : (
          <X size={34} strokeWidth={3} />
        )}
      </span>
      <span className="text-[26px] font-extrabold leading-none">
        {flash.result === "VALID"
          ? "ADMIT"
          : flash.result === "ALREADY_SCANNED"
            ? "ALREADY IN"
            : "REFUSE"}
      </span>
      <span className="text-[14px] font-bold opacity-95">{flash.message}</span>
      {flash.ticket && (
        <span className="text-[13px] font-semibold opacity-90">
          {flash.ticket.attendeeName} · {flash.ticket.tierName}
          <span className="block text-[12px] tabular opacity-80">
            {flash.ticket.ticketNumber}
            {flash.ticket.sessionLabel && ` · ${flash.ticket.sessionLabel}`}
          </span>
        </span>
      )}
      {flash.previousScan && (
        <span className="text-[12px] font-semibold opacity-90">
          Scanned {new Date(flash.previousScan.at).toLocaleTimeString("en-IN")}
          {flash.previousScan.gateName && ` at ${flash.previousScan.gateName}`}
        </span>
      )}
      {flash.optimistic && (
        <span className="text-[11.5px] font-extrabold uppercase tracking-wider opacity-85">
          Offline — will confirm on sync
        </span>
      )}
    </button>
  );
}

/**
 * Judge a scan with no network, from the cached manifest, and queue it.
 *
 * Says `optimistic` on every admit, because it is: this device cannot know
 * what the gate on the other side of the ground just did. The server's atomic
 * claim settles it on replay, and a loser becomes a `ScanConflict` for the
 * organizer — the accepted risk of F2.2, surfaced rather than hidden.
 */
async function judgeOffline(
  eventId: string,
  token: string,
  gateId: string | null,
): Promise<Flash> {
  const manifest = await loadManifest(eventId);
  const clientId = newClientId();
  const deviceScannedAt = new Date().toISOString();

  // The manifest is keyed by `qrTokenId`. A signed QR carries it as the `jti`
  // claim, which is readable without verification — the signature cannot be
  // checked offline anyway, and the server re-verifies on replay.
  const qrTokenId = tokenIdOf(token);

  if (!manifest) {
    await enqueue({
      clientId,
      eventId,
      token,
      gateId,
      deviceScannedAt,
      optimisticResult: "UNKNOWN",
    });
    return {
      result: "VALID",
      message: "No manifest — queued for check",
      optimistic: true,
    };
  }

  const ticket = qrTokenId
    ? manifest.tickets.find((t) => t.qrTokenId === qrTokenId)
    : undefined;

  if (!ticket) {
    return { result: "INVALID", message: "Not on tonight's list." };
  }
  if (manifest.usedTokens.includes(ticket.qrTokenId)) {
    return {
      result: "ALREADY_SCANNED",
      message: "Already scanned at this gate.",
      ticket: {
        ticketNumber: ticket.ticketNumber,
        attendeeName: ticket.attendeeName,
        tierName: ticket.tierName,
        sessionLabel: null,
      },
    };
  }
  if (ticket.status === "SCANNED" && !ticket.isSeasonPass) {
    return {
      result: "ALREADY_SCANNED",
      message: "Already scanned.",
      ticket: {
        ticketNumber: ticket.ticketNumber,
        attendeeName: ticket.attendeeName,
        tierName: ticket.tierName,
        sessionLabel: null,
      },
    };
  }

  await markUsedLocally(eventId, ticket.qrTokenId);
  await enqueue({
    clientId,
    eventId,
    token,
    gateId,
    deviceScannedAt,
    optimisticResult: "VALID",
  });

  return {
    result: "VALID",
    message: ticket.isSeasonPass ? "Season pass" : "Admitted",
    ticket: {
      ticketNumber: ticket.ticketNumber,
      attendeeName: ticket.attendeeName,
      tierName: ticket.tierName,
      sessionLabel: null,
    },
    optimistic: true,
  };
}

/** The `jti` of a signed QR, or the raw value if it is a legacy bare token. */
function tokenIdOf(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return token.trim() || null;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return typeof payload.jti === "string" ? payload.jti : null;
  } catch {
    return null;
  }
}
