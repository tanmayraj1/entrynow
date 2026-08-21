import type { Metadata } from "next";
import { MapPin } from "lucide-react";
import { EmptyState, StatusPill } from "@/components/ui";
import { requireOrganizer } from "@/lib/auth/rbac";
import { listOwnVenues } from "@/lib/queries/organizer/venues";
import { getLocalities } from "@/lib/queries/marketplace";
import { db } from "@/lib/db";
import { AddVenue } from "../venue-form";
import { EditVenue } from "./venue-rows";

export const metadata: Metadata = { title: "Venues" };

/**
 * The organizer's own venues.
 *
 * Only rows they created — the platform catalogue is not theirs to edit, and
 * showing it here with disabled controls would just be a list of things they
 * cannot do. Those still appear in the event form's picker, which is where
 * they matter.
 */
export default async function OrganizerVenuesPage() {
  const ctx = await requireOrganizer({ allowUnverified: true });

  const [venues, cities] = await Promise.all([
    listOwnVenues(ctx.organizerId),
    db.city.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const home = cities[0];
  const localities = home ? await getLocalities(home.id) : [];

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div>
        <h1 className="text-[20px] font-extrabold leading-tight">Your venues</h1>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          Venues you added yourself. Only you can see them — the platform&apos;s
          own list appears alongside these when you pick a venue for an event.
        </p>
      </div>

      {!ctx.readOnly && home && (
        <AddVenue
          cityId={home.id}
          cityName={home.name}
          localities={localities.map((l) => ({ ...l, cityId: home.id }))}
        />
      )}

      {venues.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No venues of your own yet"
          body="Add one when the place you're running an event at isn't in our list — a farmhouse, a society ground, a new banquet hall."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {venues.map((v) => (
            <section
              key={v.id}
              className="bg-surface border border-border rounded-[var(--radius-card)] p-4 lg:p-5"
            >
              <div className="flex items-start justify-between gap-3 mb-3.5">
                <div className="min-w-0">
                  <h2 className="text-[15px] font-extrabold truncate">{v.name}</h2>
                  <p className="text-[12.5px] font-semibold text-ink-muted mt-0.5">
                    {v.addressLine}
                    {v.locality ? ` · ${v.locality.name}` : ""} · {v.city.name}
                    {v.pincode ? ` ${v.pincode}` : ""}
                  </p>
                  <p className="text-[11.5px] font-semibold text-ink-muted mt-1">
                    {v.eventCount === 0
                      ? "Not used by any event yet"
                      : `Used by ${v.eventCount} ${v.eventCount === 1 ? "event" : "events"}`}
                  </p>
                </div>
                {!v.isActive && <StatusPill tone="pending" label="Retired" />}
              </div>
              <EditVenue
                venue={{
                  id: v.id,
                  name: v.name,
                  addressLine: v.addressLine,
                  pincode: v.pincode,
                  lat: v.lat,
                  lng: v.lng,
                  isActive: v.isActive,
                  eventCount: v.eventCount,
                }}
                readOnly={ctx.readOnly}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
