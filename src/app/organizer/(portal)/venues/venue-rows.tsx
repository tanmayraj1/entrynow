"use client";

import { ActionForm } from "@/components/dash/action-form";
import { Field, Input } from "@/components/ui";
import { setVenueActive, updateVenue } from "../actions";

/**
 * Editing one of your own venues.
 *
 * The location field is deliberately blank rather than pre-filled with the
 * stored coordinates: leaving it alone keeps the existing pin, and the only
 * reason to touch it is to replace the pin with a fresh Maps link. Showing
 * "23.0225, 72.5714" would invite someone to edit a digit by hand and move the
 * gate a kilometre without meaning to.
 */
export function EditVenue({
  venue,
  readOnly,
}: {
  venue: {
    id: string;
    name: string;
    addressLine: string;
    pincode: string | null;
    lat: number;
    lng: number;
    isActive: boolean;
    eventCount: number;
  };
  readOnly: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <ActionForm
        action={updateVenue}
        submitLabel="Save venue"
        size="sm"
        hidden={{ venueId: venue.id }}
        disabled={readOnly}
        disabledReason={readOnly ? "This account is read-only." : undefined}
      >
        <Field label="Venue name" required>
          <Input name="name" defaultValue={venue.name} required />
        </Field>
        <Field label="Address" required>
          <Input name="addressLine" defaultValue={venue.addressLine} required />
        </Field>
        <Field label="Pincode">
          <Input
            name="pincode"
            inputMode="numeric"
            defaultValue={venue.pincode ?? ""}
          />
        </Field>
        <Field
          label="Move the pin"
          hint={`Currently ${venue.lat.toFixed(5)}, ${venue.lng.toFixed(5)}. Paste a Google Maps link to move it; leave blank to keep it.`}
        >
          <Input name="location" placeholder="https://maps.app.goo.gl/…" />
        </Field>
      </ActionForm>

      {!readOnly && (
        <ActionForm
          action={setVenueActive}
          submitLabel={venue.isActive ? "Retire venue" : "Restore venue"}
          variant={venue.isActive ? "outline" : "secondary"}
          size="sm"
          hidden={{ venueId: venue.id, isActive: String(!venue.isActive) }}
          confirm={
            venue.isActive
              ? venue.eventCount > 0
                ? `Retire "${venue.name}"? Its ${venue.eventCount} existing ${venue.eventCount === 1 ? "event keeps" : "events keep"} it — you just cannot pick it for new ones.`
                : `Retire "${venue.name}"?`
              : undefined
          }
        />
      )}
    </div>
  );
}
