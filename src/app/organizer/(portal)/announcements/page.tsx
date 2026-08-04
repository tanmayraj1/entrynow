import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { EmptyState, Table, Td, Th, Tr } from "@/components/ui";
import { requireOrganizer } from "@/lib/auth/rbac";
import { listOrganizerAnnouncements } from "@/lib/queries/organizer/finance";
import { listOrganizerEvents } from "@/lib/queries/organizer/events";
import { getBusinessConfig } from "@/lib/config";
import { formatIstDate } from "@/lib/ist";
import { AnnouncementForm } from "./announcement-form";

export const metadata: Metadata = { title: "Announcements" };

export default async function OrganizerAnnouncementsPage() {
  const ctx = await requireOrganizer({ allowUnverified: true });

  const [sent, events, cfg] = await Promise.all([
    listOrganizerAnnouncements(ctx.organizerId),
    listOrganizerEvents(ctx.organizerId, { perPage: 100 }),
    getBusinessConfig(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[20px] font-extrabold leading-tight">
          Announcements
        </h1>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          Goes to everyone holding a confirmed ticket. Limited to{" "}
          {cfg.announcementsPerEventPerWeek} per event per week — cancellation
          and reschedule notices are exempt.
        </p>
      </div>

      <section className="bg-surface border border-border rounded-[var(--radius-card)] p-4 lg:p-5">
        <h2 className="text-[14.5px] font-extrabold mb-3.5">Send one</h2>
        <AnnouncementForm
          events={events.rows
            .filter((e) => e.status === "LIVE" || e.status === "PAUSED")
            .map((e) => ({ id: e.id, title: e.title }))}
          readOnly={ctx.readOnly}
        />
      </section>

      <div className="bg-surface border border-border rounded-[var(--radius-card)] overflow-hidden">
        <h2 className="text-[14px] font-extrabold px-4 py-3 border-b border-border">
          Sent
        </h2>
        {sent.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="Nothing sent yet"
            body="Use this for a gate change, a set-time update, or a weather call — not for marketing."
          />
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Subject</Th>
                <Th>Event</Th>
                <Th numeric>Reached</Th>
                <Th>Sent</Th>
              </Tr>
            </thead>
            <tbody>
              {sent.map((a) => (
                <Tr key={a.id}>
                  <Td className="max-w-[280px]">
                    <span className="font-extrabold block truncate">
                      {a.subject}
                    </span>
                    <span className="text-[11.5px] font-semibold text-ink-muted block truncate">
                      {a.body}
                    </span>
                  </Td>
                  <Td className="max-w-[180px] truncate">{a.event.title}</Td>
                  <Td numeric>{a.audienceCount}</Td>
                  <Td className="whitespace-nowrap text-ink-muted">
                    {a.sentAt ? formatIstDate(a.sentAt) : "—"}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
