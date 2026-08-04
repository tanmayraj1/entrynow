import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ManualEntry } from "./manual-entry";

export const metadata: Metadata = { title: "Manual entry" };

/**
 * The fallback that keeps the gate moving.
 *
 * A cracked screen, a dead phone battery, a printed ticket that will not
 * focus, a browser with no `BarcodeDetector` — none of those are the
 * attendee's fault, and none of them should mean turning someone away. Typing
 * the ticket number runs the identical check the camera does; there is no
 * relaxed path here, only a different input.
 */
export default async function ManualScanPage({
  params,
}: PageProps<"/scan/[eventId]/manual">) {
  const user = await getSessionUser();
  if (!user) notFound();
  const { eventId } = await params;

  const [assignment, owned] = await Promise.all([
    db.staffAssignment.findFirst({
      where: { userId: user.id, eventId },
      select: { gateId: true },
    }),
    db.event.findFirst({
      where: { id: eventId, organizer: { user: { id: user.id } } },
      select: { id: true },
    }),
  ]);
  if (!assignment && !owned) notFound();

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      gates: {
        orderBy: { code: "asc" },
        select: { id: true, name: true, code: true },
      },
    },
  });
  if (!event) notFound();

  return (
    <div className="flex flex-col gap-5 px-5 py-6">
      <Link
        href={`/scan/${eventId}`}
        className="inline-flex items-center gap-1.5 text-[12px] font-bold text-ink-muted"
      >
        <ArrowLeft size={14} strokeWidth={2.6} />
        Back to the camera
      </Link>

      <div>
        <h1 className="text-[20px] font-extrabold leading-tight">
          Manual entry
        </h1>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          {event.title} — same checks as the camera, nothing relaxed.
        </p>
      </div>

      <ManualEntry
        eventId={event.id}
        gates={event.gates}
        defaultGateId={assignment?.gateId ?? null}
      />
    </div>
  );
}
