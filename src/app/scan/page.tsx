import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, ScanLine } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { getSessionUser } from "@/lib/auth/session";
import { listScannableEvents } from "@/lib/queries/scan";
import { formatIstDate, formatIstTime } from "@/lib/ist";

export const metadata: Metadata = { title: "Pick an event" };

export default async function ScanHomePage() {
  const user = await getSessionUser();
  const events = user ? await listScannableEvents(user.id) : [];
  const liveCount = events.filter((e) => e.liveSession !== null).length;

  return (
    <div className="flex flex-col gap-5 px-5 py-6">
      <header className="flex items-center justify-between gap-3">
        <Logo size="sm" onDark />
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-primary">
          Gate
        </span>
      </header>

      <div>
        <h1 className="text-[22px] font-extrabold leading-tight">
          {events.length ? "Which gate are you on?" : "Nothing assigned yet"}
        </h1>
        <p className="text-[13px] font-semibold text-ink-muted mt-1.5">
          {!events.length
            ? "Ask the organizer to add your mobile number to the event's staff list, then reopen this page."
            : liveCount
              ? `${liveCount} running now, at the top.`
              : // Saying "tonight's events are at the top" when nothing is
                // running tonight sends someone hunting for a gate that is not
                // open. Better to say so and let them plan.
                `Nothing is running right now — ${events.length} ${events.length === 1 ? "event" : "events"} assigned to you.`}
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {events.map((e) => {
          const live = e.liveSession !== null;
          return (
            <li key={e.id}>
              <Link
                href={`/scan/${e.id}`}
                className="flex items-start gap-3 rounded-[16px] border border-border bg-surface px-4 py-3.5 active:bg-selected-bg transition-colors"
              >
                <span
                  className={
                    live
                      ? "grid place-items-center size-10 rounded-[12px] bg-primary text-[#0a1226] shrink-0"
                      : "grid place-items-center size-10 rounded-[12px] bg-selected-bg text-ink-muted shrink-0"
                  }
                >
                  <ScanLine size={18} strokeWidth={2.4} />
                </span>
                {/* Nothing here truncates.
                 *
                 * It used to: one line for the title, one for venue-and-time,
                 * both `truncate`. On a 375px phone that produced "Mareez Ni
                 * Gazal — Gujarati N…" above "Natarani Amphitheatre · Next Fri,
                 * 21 Au…" — the two things a gate needs to tell events apart,
                 * the name and the time, both cut off. The list is short and
                 * the screen is tall; letting it wrap costs nothing. */}
                <span className="min-w-0 grow">
                  {live && (
                    <span className="inline-block text-[10px] font-extrabold uppercase tracking-wider text-[#0a1226] bg-primary rounded-full px-2 py-0.5 mb-1">
                      Live now
                    </span>
                  )}
                  <span className="block text-[14.5px] font-extrabold leading-snug">
                    {e.title}
                  </span>
                  <span className="block text-[11.5px] font-semibold text-ink-muted leading-snug mt-0.5">
                    {e.venueName}
                  </span>
                  <span className="block text-[11.5px] font-semibold text-ink-muted leading-snug">
                    {live
                      ? `Night ${e.liveSession!.sequence} — until ${formatIstTime(e.liveSession!.endsAt)}`
                      : e.nextSessionAt
                        ? `Next ${formatIstDate(e.nextSessionAt)}, ${formatIstTime(e.nextSessionAt)}`
                        : "No sessions scheduled"}
                  </span>
                  {e.assignedGate && (
                    <span className="block text-[11px] font-extrabold text-primary mt-0.5">
                      {e.assignedGate.code} · {e.assignedGate.name}
                    </span>
                  )}
                  {e.gatesClosedAt && (
                    <span className="block text-[11px] font-extrabold text-danger mt-0.5">
                      Gates closed
                    </span>
                  )}
                </span>
                <ChevronRight
                  size={17}
                  strokeWidth={2.6}
                  className="text-ink-muted shrink-0 mt-1"
                />
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="text-[11.5px] font-semibold text-ink-muted mt-2">
        Signed in as {user?.name ?? user?.phone}.{" "}
        <Link href="/" className="text-primary font-bold">
          Leave the scanner
        </Link>
      </p>
    </div>
  );
}
