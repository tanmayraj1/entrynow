"use client";

import * as React from "react";
import { MapPin, Plus } from "lucide-react";
import { ActionForm } from "@/components/dash/action-form";
import { Field, Input, Select } from "@/components/ui";
import { createVenue } from "./actions";

/**
 * "My venue isn't in the list."
 *
 * Until now the answer was the hint on the new-event form: *contact support to
 * add one*. Venues were seeded and nothing in the product created them, so an
 * organizer holding a night at a farmhouse, a society ground or a new banquet
 * hall could not list their event at all without a human in the loop.
 *
 * Rendered as a **sibling** of the event form, never inside it. HTML forms do
 * not nest, and `ActionForm` renders a real `<form>` — putting this inside the
 * details form would make the browser drop one of them, silently.
 *
 * Collapsed by default. The list is right for almost everyone, and an
 * always-open "create" form next to a picker invites duplicates of rows that
 * already exist.
 */
export function AddVenue({
  cityId,
  cityName,
  localities,
}: {
  cityId: string;
  cityName: string;
  /** All localities we serve; filtered here so the city can change above. */
  localities: { id: string; name: string; cityId: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const cityLocalities = localities.filter((l) => l.cityId === cityId);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-extrabold text-primary hover:text-primary-dark cursor-pointer"
      >
        <Plus size={14} strokeWidth={2.6} />
        My venue isn&apos;t listed — add it
      </button>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-[var(--radius-card)] p-4 lg:p-5">
      <div className="flex items-start justify-between gap-3 mb-3.5">
        <div>
          <h3 className="text-[14px] font-extrabold">Add a venue</h3>
          <p className="text-[12px] font-semibold text-ink-muted mt-0.5">
            Only you will see it. It stays on your account for future events.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 text-[12px] font-bold text-ink-muted hover:text-ink cursor-pointer"
        >
          Cancel
        </button>
      </div>

      <ActionForm
        action={createVenue}
        submitLabel="Add venue"
        size="sm"
        hidden={{ cityId }}
      >
        <Field label="Venue name" required>
          <Input name="name" required placeholder="Shreeji Farms Lawn" />
        </Field>
        <Field label="Address" required>
          <Input
            name="addressLine"
            required
            placeholder="Off Sanand Road, near Bopal Circle"
          />
        </Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Pincode">
            <Input name="pincode" inputMode="numeric" placeholder="380058" />
          </Field>
          {cityLocalities.length > 0 && (
            <Field label="Locality" hint="Helps people filter by area.">
              <Select name="localityId" defaultValue="">
                <option value="">Not sure</option>
                {cityLocalities.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        {/* The field that decides whether the map pin is right.
            
            Asking for a Google Maps link rather than coordinates is the whole
            trick: nobody knows their venue's latitude, and everybody can find
            it on Maps and hit Share. The action reads the point out of the
            URL, and falls back to geocoding the address if this is blank. */}
        <Field
          label="Location"
          hint={`Open the venue in Google Maps, tap Share, and paste the link. Leave blank and we'll try to find it from the address — if we can't, the pin lands on ${cityName} centre and you can fix it later.`}
        >
          <Input
            name="location"
            placeholder="https://maps.app.goo.gl/…  or  23.0225, 72.5714"
          />
        </Field>
      </ActionForm>
    </div>
  );
}

/** The small "pin" line the venue picker shows under a selected venue. */
export function VenueHint({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-muted">
      <MapPin size={12} strokeWidth={2.4} className="shrink-0" />
      {text}
    </span>
  );
}
