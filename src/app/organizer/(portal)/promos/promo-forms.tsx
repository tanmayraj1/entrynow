"use client";

import { ActionForm } from "@/components/dash/action-form";
import { Field, Input, Select } from "@/components/ui";
import { deactivatePromo, upsertPromo } from "../actions";

export function PromoForm({
  events,
  readOnly,
}: {
  events: { id: string; title: string }[];
  readOnly: boolean;
}) {
  return (
    <ActionForm
      action={upsertPromo}
      submitLabel="Create code"
      disabled={readOnly}
      disabledReason={readOnly ? "This account is read-only." : undefined}
      size="sm"
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Code" required hint="3–20 letters and digits.">
          <Input
            name="code"
            placeholder="GARBA20"
            required
            pattern="[A-Za-z0-9]{3,20}"
            className="uppercase"
          />
        </Field>
        <Field label="Applies to">
          <Select name="eventId" defaultValue="">
            <option value="">All your events</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type">
          <Select name="kind" defaultValue="PCT">
            <option value="PCT">Percentage off</option>
            <option value="FLAT">Flat ₹ off</option>
          </Select>
        </Field>
        <Field label="Amount" required hint="Percent, or rupees for a flat code.">
          <Input name="amount" type="number" min={1} step="1" required />
        </Field>
        <Field label="Usage limit" hint="Blank for unlimited.">
          <Input name="usageLimit" type="number" min={1} step="1" />
        </Field>
        <Field label="Description">
          <Input name="description" placeholder="Early-bird for Night 1" />
        </Field>
      </div>
    </ActionForm>
  );
}

export function PromoToggle({
  promoId,
  isActive,
  code,
  readOnly,
}: {
  promoId: string;
  isActive: boolean;
  code: string;
  readOnly: boolean;
}) {
  return (
    <ActionForm
      action={deactivatePromo}
      submitLabel={isActive ? "Pause" : "Reactivate"}
      hidden={{ promoId }}
      disabled={readOnly}
      variant="ghost"
      size="sm"
      className="items-end"
      confirm={
        isActive
          ? `Pause ${code}? Nobody can apply it until you reactivate. Discounts already given are unaffected.`
          : undefined
      }
    />
  );
}
