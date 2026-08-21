import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { requireOrganizer } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { listSelectableVenues } from "@/lib/queries/organizer/venues";
import { NewEventForm } from "./new-event-form";

export const metadata: Metadata = { title: "New event" };

/**
 * Step 1 of the wizard: create the draft.
 *
 * Deliberately the *smallest* form that can produce a valid row. Everything
 * else — tiers, sessions, gates, description, cover — is edited on the event
 * page once the draft exists, so a half-finished event is a saved draft rather
 * than a long form someone loses to a closed tab.
 */
export default async function NewEventPage() {
  const ctx = await requireOrganizer({ allowUnverified: true });

  const [categories, cities, venues, localities] = await Promise.all([
    db.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    db.city.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    // Scoped to this organizer: platform venues plus their own, never another
    // organizer's (D-040). No city filter — the wizard lets the city change
    // while the form is open, so it filters on the client.
    listSelectableVenues(ctx.organizerId),
    db.locality.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, cityId: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div>
        <Link
          href="/organizer/events"
          className="inline-flex items-center gap-1.5 text-[12px] font-bold text-ink-muted hover:text-ink mb-2"
        >
          <ArrowLeft size={14} strokeWidth={2.6} />
          All events
        </Link>
        <h1 className="text-[20px] font-extrabold leading-tight">New event</h1>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          This saves a draft. Nothing goes public until you submit it for review.
        </p>
      </div>

      <div className="bg-surface border border-border rounded-[var(--radius-card)] p-4 lg:p-5">
        <NewEventForm
          categories={categories}
          cities={cities}
          venues={venues}
          localities={localities}
          readOnly={ctx.readOnly}
        />
      </div>
    </div>
  );
}
