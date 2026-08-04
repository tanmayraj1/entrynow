"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ActionForm, type PortalActionResult } from "@/components/dash/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { createEventDraft } from "../../actions";

export function NewEventForm({
  categories,
  cities,
  venues,
  readOnly,
}: {
  categories: { id: string; name: string }[];
  cities: { id: string; name: string }[];
  venues: { id: string; name: string; cityId: string }[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [cityId, setCityId] = React.useState(cities[0]?.id ?? "");

  // The venue list narrows to the chosen city, because a venue in another city
  // is never the right answer and offering it invites the mistake. The server
  // does not depend on this — it revalidates the pairing regardless.
  const cityVenues = venues.filter((v) => v.cityId === cityId);

  const onDone = React.useCallback(
    (result: PortalActionResult) => {
      if (result.id) router.push(`/organizer/events/${result.id}`);
    },
    [router],
  );

  return (
    <ActionForm
      action={createEventDraft}
      submitLabel="Create draft"
      disabled={readOnly}
      disabledReason={readOnly ? "This account is read-only." : undefined}
      onDone={onDone}
    >
      <Field label="Title" required hint="What attendees will search for.">
        <Input
          name="title"
          placeholder="Rangilo Garba — Navratri 2026"
          required
          minLength={4}
        />
      </Field>

      <Field label="Summary" hint="One line for the event card.">
        <Textarea
          name="summary"
          rows={2}
          placeholder="Nine nights of live dhol at Karnavati Club."
        />
      </Field>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Category" required>
          <Select name="categoryId" required defaultValue="">
            <option value="" disabled>
              Choose…
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="City" required>
          <Select
            name="cityId"
            required
            value={cityId}
            onChange={(e) => setCityId(e.target.value)}
          >
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Venue"
        required
        hint={
          cityVenues.length === 0
            ? "No venues listed in this city yet — pick another city, or contact support to add one."
            : undefined
        }
      >
        <Select name="venueId" required defaultValue="" disabled={!cityVenues.length}>
          <option value="" disabled>
            Choose…
          </option>
          {cityVenues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
      </Field>
    </ActionForm>
  );
}
