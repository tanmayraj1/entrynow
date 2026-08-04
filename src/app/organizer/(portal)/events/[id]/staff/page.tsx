import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Users } from "lucide-react";
import { EmptyState, Table, Td, Th, Tr } from "@/components/ui";
import { requireOrganizer } from "@/lib/auth/rbac";
import {
  getOrganizerEvent,
  listEventStaff,
} from "@/lib/queries/organizer/events";
import { formatIstDate } from "@/lib/ist";
import { EventTabs } from "../event-tabs";
import { AssignStaffForm, RevokeStaffButton } from "./staff-forms";

export const metadata: Metadata = { title: "Staff" };

export default async function EventStaffPage({
  params,
}: PageProps<"/organizer/events/[id]/staff">) {
  const ctx = await requireOrganizer({ allowUnverified: true });
  const { id } = await params;

  const [event, staff] = await Promise.all([
    getOrganizerEvent(ctx.organizerId, id),
    listEventStaff(ctx.organizerId, id),
  ]);
  if (!event) notFound();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href={`/organizer/events/${id}`}
          className="inline-flex items-center gap-1.5 text-[12px] font-bold text-ink-muted hover:text-ink mb-2"
        >
          <ArrowLeft size={14} strokeWidth={2.6} />
          {event.title}
        </Link>
        <h1 className="text-[20px] font-extrabold leading-tight">
          Scanner staff
        </h1>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          Staff can scan tickets at this event only, at the gate you assign.
        </p>
      </div>

      <EventTabs eventId={id} active="staff" />

      <div className="bg-surface border border-border rounded-[var(--radius-card)] overflow-hidden">
        {staff.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nobody assigned yet"
            body="Add the people who will be on the gate. They sign in to Entry Now on their own phone and only see this event."
          />
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Person</Th>
                <Th>Gate</Th>
                <Th>Override</Th>
                <Th>Added</Th>
                <Th />
              </Tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <Tr key={s.id}>
                  <Td>
                    {s.user.name ?? "—"}
                    <span className="block text-[11px] font-semibold text-ink-muted tabular">
                      {s.user.phone ?? ""}
                    </span>
                  </Td>
                  <Td>{s.gate ? `${s.gate.code} · ${s.gate.name}` : "Any gate"}</Td>
                  <Td>{s.canOverride ? "Yes" : "No"}</Td>
                  <Td className="whitespace-nowrap text-ink-muted">
                    {formatIstDate(s.createdAt)}
                  </Td>
                  <Td className="text-right">
                    <RevokeStaffButton
                      assignmentId={s.id}
                      name={s.user.name ?? "this person"}
                      readOnly={ctx.readOnly}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <section className="bg-surface border border-border rounded-[var(--radius-card)] p-4 lg:p-5">
        <h2 className="text-[14.5px] font-extrabold">Add a staff member</h2>
        <p className="text-[11.5px] font-semibold text-ink-muted mt-0.5 mb-3.5">
          They need an Entry Now account first — ask them to sign in once with
          their mobile number.
        </p>
        <AssignStaffForm
          eventId={id}
          gates={event.gates.map((g) => ({
            id: g.id,
            label: `${g.code} · ${g.name}`,
          }))}
          readOnly={ctx.readOnly}
        />
      </section>
    </div>
  );
}
