import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getScanStats } from "@/lib/queries/scan";
import { ScannerClient } from "./scanner-client";

export const metadata: Metadata = { title: "Scanning" };

export default async function ScanEventPage({
  params,
}: PageProps<"/scan/[eventId]">) {
  const user = await getSessionUser();
  if (!user) notFound();
  const { eventId } = await params;

  // Authorisation is checked here for the render AND again inside
  // `scanTicket` for every scan — the page guard does nothing about a POST
  // straight to /api/scan.
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
      gatesClosedAt: true,
      gates: {
        orderBy: { code: "asc" },
        select: { id: true, name: true, code: true },
      },
    },
  });
  if (!event) notFound();

  const stats = await getScanStats(eventId);

  return (
    <ScannerClient
      eventId={event.id}
      eventTitle={event.title}
      gates={event.gates}
      defaultGateId={assignment?.gateId ?? null}
      gatesClosed={event.gatesClosedAt !== null}
      initialScanned={stats.scanned}
    />
  );
}
