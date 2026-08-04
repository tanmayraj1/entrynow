"use client";

import { ActionForm } from "@/components/dash/action-form";
import { Field, Input, Select } from "@/components/ui";
import { toggleCatalogActive, upsertBanner } from "../actions";

export function CatalogToggle({
  kind,
  id,
  name,
  isActive,
  eventCount,
}: {
  kind: "city" | "category" | "festival";
  id: string;
  name: string;
  isActive: boolean;
  eventCount: number;
}) {
  return (
    <ActionForm
      action={toggleCatalogActive}
      submitLabel={isActive ? "Hide" : "Show"}
      hidden={{ kind, id }}
      variant="ghost"
      size="sm"
      className="shrink-0 items-end"
      confirm={
        isActive
          ? `Hide ${name} from the marketplace?${
              eventCount > 0
                ? ` ${eventCount} event${eventCount === 1 ? "" : "s"} reference it — they keep working, they just stop being browsable this way.`
                : ""
            }`
          : undefined
      }
    />
  );
}

export function BannerForm({ cities }: { cities: { id: string; name: string }[] }) {
  return (
    <ActionForm action={upsertBanner} submitLabel="Save banner" size="sm">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Title" required>
          <Input name="title" required minLength={3} placeholder="Navratri 2026 is live" />
        </Field>
        <Field label="Subtitle">
          <Input name="subtitle" placeholder="Nine nights, 40 grounds, one pass" />
        </Field>
        <Field label="Links to" hint="A path like /ahmedabad/festivals/navratri.">
          <Input name="href" placeholder="/ahmedabad/events" />
        </Field>
        <Field label="City" hint="Leave blank to show everywhere.">
          <Select name="cityId" defaultValue="">
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue="DRAFT">
            <option value="DRAFT">Draft</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="LIVE">Live</option>
          </Select>
        </Field>
      </div>
    </ActionForm>
  );
}
