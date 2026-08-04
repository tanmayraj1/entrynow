import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { listScannableEvents } from "@/lib/queries/scan";
import { SyncPanel } from "./sync-panel";

export const metadata: Metadata = { title: "Sync" };

/**
 * The "why isn't it working" page.
 *
 * Every gate has one moment where someone needs to know whether the problem is
 * the phone, the signal, or the ticket. This answers that: what is queued,
 * whether the manifest was pulled, and a button to force a replay — rather
 * than making them guess from a viewfinder that just says nothing.
 */
export default async function ScanSyncPage() {
  const user = await getSessionUser();
  const events = user ? await listScannableEvents(user.id) : [];

  return (
    <div className="flex flex-col gap-5 px-5 py-6">
      <Link
        href="/scan"
        className="inline-flex items-center gap-1.5 text-[12px] font-bold text-ink-muted"
      >
        <ArrowLeft size={14} strokeWidth={2.6} />
        Events
      </Link>

      <div>
        <h1 className="text-[20px] font-extrabold leading-tight">Sync status</h1>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          Scans taken offline are held on this device until they reach the
          server. Nothing is lost by closing the app.
        </p>
      </div>

      <SyncPanel
        events={events.map((e) => ({ id: e.id, title: e.title }))}
      />
    </div>
  );
}
