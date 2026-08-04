import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { StatusPill, Table, Td, Th, Tr } from "@/components/ui";
import { requireOrganizer } from "@/lib/auth/rbac";
import { getOrganizerEvent } from "@/lib/queries/organizer/events";
import { db } from "@/lib/db";
import { formatIstDate, formatIstTime } from "@/lib/ist";
import { inr } from "@/lib/money";
import {
  EventDetailsForm,
  EventStatusActions,
  GateForm,
  SessionForm,
  TierForm,
} from "./event-forms";
import { EventTabs } from "./event-tabs";

export const metadata: Metadata = { title: "Event" };

export default async function OrganizerEventPage({
  params,
}: PageProps<"/organizer/events/[id]">) {
  const ctx = await requireOrganizer({ allowUnverified: true });
  const { id } = await params;

  const event = await getOrganizerEvent(ctx.organizerId, id);
  // `notFound()`, not a redirect. A redirect to the events list would confirm
  // that this id exists and simply is not yours — a free directory of every
  // event on the platform for anyone willing to enumerate.
  if (!event) notFound();

  const venues = await db.venue.findMany({
    where: { cityId: event.city.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/organizer/events"
          className="inline-flex items-center gap-1.5 text-[12px] font-bold text-ink-muted hover:text-ink mb-2"
        >
          <ArrowLeft size={14} strokeWidth={2.6} />
          All events
        </Link>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[20px] font-extrabold leading-tight">
            {event.title}
          </h1>
          <StatusPill status={event.status} />
        </div>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          {event.category.name} · {event.venue.name}, {event.city.name} ·{" "}
          {event._count.bookings} booking
          {event._count.bookings === 1 ? "" : "s"}
        </p>
      </div>

      <EventTabs eventId={event.id} active="details" />

      {event.rejectionNote && (
        <div className="rounded-[var(--radius-card)] border border-danger/25 bg-danger-tint px-4 py-3">
          <p className="text-[13px] font-extrabold text-danger-dark">
            Changes requested
          </p>
          <p className="text-[12.5px] font-semibold text-danger-dark/85 mt-0.5">
            {event.rejectionNote}
          </p>
        </div>
      )}

      {event.pendingChanges !== null && (
        <div className="rounded-[var(--radius-card)] border border-status-warning-fg/25 bg-status-warning-bg px-4 py-3">
          <p className="text-[13px] font-extrabold text-status-warning-fg">
            An edit is waiting for review
          </p>
          <p className="text-[12.5px] font-semibold text-status-warning-fg/85 mt-0.5">
            Your event keeps selling at its current details until an admin
            approves the change. On approval, everyone who has booked is
            notified and gets 72 hours to cancel free.
          </p>
        </div>
      )}

      <EventStatusActions
        event={{
          id: event.id,
          status: event.status,
          publishedAt: event.publishedAt?.toISOString() ?? null,
        }}
        readOnly={ctx.readOnly}
      />

      <Section title="Details">
        <EventDetailsForm
          event={{
            id: event.id,
            title: event.title,
            summary: event.summary,
            description: event.description,
            venueId: event.venue.id,
            status: event.status,
            refundPolicy: event.refundPolicy,
            transfersAllowed: event.transfersAllowed,
            partialCancellationAllowed: event.partialCancellationAllowed,
          }}
          venues={venues}
          readOnly={ctx.readOnly}
        />
      </Section>

      <Section
        title="Ticket tiers"
        sub="Capacity can only be raised above what is already sold or held — invariant I1."
      >
        {event.tiers.length > 0 && (
          <Table className="mb-4">
            <thead>
              <Tr>
                <Th>Tier</Th>
                <Th numeric>Price</Th>
                <Th numeric>Sold</Th>
                <Th numeric>Held</Th>
                <Th numeric>Capacity</Th>
              </Tr>
            </thead>
            <tbody>
              {event.tiers.map((t) => (
                <Tr key={t.id}>
                  <Td>
                    {t.name}
                    {t.isSeasonPass && (
                      <span className="ml-2 text-[10.5px] font-extrabold text-primary">
                        SEASON
                      </span>
                    )}
                  </Td>
                  <Td numeric>{inr(t.pricePaise)}</Td>
                  <Td numeric>{t.quantitySold}</Td>
                  <Td numeric>{t.quantityHeld}</Td>
                  <Td numeric>{t.quantityTotal}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <div className="flex flex-col gap-5">
          {event.tiers.map((t) => (
            <div
              key={t.id}
              className="border-t border-divider pt-4 first:border-0 first:pt-0"
            >
              <p className="text-[12px] font-extrabold text-ink-muted mb-2.5">
                Edit “{t.name}”
              </p>
              <TierForm
                eventId={event.id}
                tier={{
                  id: t.id,
                  name: t.name,
                  pricePaise: t.pricePaise,
                  quantityTotal: t.quantityTotal,
                  quantitySold: t.quantitySold,
                  quantityHeld: t.quantityHeld,
                  perUserLimit: t.perUserLimit,
                  isSeasonPass: t.isSeasonPass,
                }}
                readOnly={ctx.readOnly}
                eventIsLive={event.status === "LIVE"}
              />
            </div>
          ))}
          <div className="border-t border-divider pt-4">
            <p className="text-[12px] font-extrabold text-ink-muted mb-2.5">
              Add a tier
            </p>
            <TierForm
              eventId={event.id}
              readOnly={ctx.readOnly}
              eventIsLive={event.status === "LIVE"}
            />
          </div>
        </div>
      </Section>

      <Section
        title="Sessions"
        sub="A night running 8 PM–1 AM belongs to its start date and stays scannable until it ends."
      >
        {event.sessions.length > 0 && (
          <Table className="mb-4">
            <thead>
              <Tr>
                <Th>#</Th>
                <Th>Name</Th>
                <Th>Starts</Th>
                <Th>Ends</Th>
              </Tr>
            </thead>
            <tbody>
              {event.sessions.map((s) => (
                <Tr key={s.id}>
                  <Td>{s.sequence}</Td>
                  <Td>{s.name ?? `Night ${s.sequence}`}</Td>
                  <Td className="whitespace-nowrap">
                    {formatIstDate(s.startsAt)} · {formatIstTime(s.startsAt)}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {formatIstDate(s.endsAt)} · {formatIstTime(s.endsAt)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <SessionForm eventId={event.id} readOnly={ctx.readOnly} />
      </Section>

      <Section title="Gates" sub="Scanner staff are assigned to a gate.">
        {event.gates.length > 0 && (
          <ul className="flex flex-wrap gap-2 mb-4">
            {event.gates.map((g) => (
              <li
                key={g.id}
                className="rounded-full bg-divider px-3 py-1.5 text-[12px] font-bold"
              >
                {g.code} · {g.name}
              </li>
            ))}
          </ul>
        )}
        <GateForm eventId={event.id} readOnly={ctx.readOnly} />
      </Section>
    </div>
  );
}

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface border border-border rounded-[var(--radius-card)] p-4 lg:p-5">
      <h2 className="text-[14.5px] font-extrabold">{title}</h2>
      {sub && (
        <p className="text-[11.5px] font-semibold text-ink-muted mt-0.5 mb-3.5">
          {sub}
        </p>
      )}
      {!sub && <div className="h-3.5" />}
      {children}
    </section>
  );
}
