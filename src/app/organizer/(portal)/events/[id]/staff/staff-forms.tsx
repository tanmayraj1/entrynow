"use client";

import { ActionForm } from "@/components/dash/action-form";
import { Checkbox, Field, Input, Select } from "@/components/ui";
import { assignStaff, revokeStaff } from "../../../actions";

export function AssignStaffForm({
  eventId,
  gates,
  readOnly,
}: {
  eventId: string;
  gates: { id: string; label: string }[];
  readOnly: boolean;
}) {
  return (
    <ActionForm
      action={assignStaff}
      submitLabel="Give scan access"
      hidden={{ eventId }}
      disabled={readOnly}
      size="sm"
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Mobile number" required>
          <Input
            name="phone"
            type="tel"
            inputMode="numeric"
            placeholder="98765 43210"
            required
          />
        </Field>
        <Field label="Gate" hint="Leave on “Any gate” for a floating supervisor.">
          <Select name="gateId" defaultValue="">
            <option value="">Any gate</option>
            {gates.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Checkbox
        name="canOverride"
        label="Can override a failed scan"
        hint="Lets them admit someone the scanner rejected. Every override is logged."
      />
    </ActionForm>
  );
}

export function RevokeStaffButton({
  assignmentId,
  name,
  readOnly,
}: {
  assignmentId: string;
  name: string;
  readOnly: boolean;
}) {
  return (
    <ActionForm
      action={revokeStaff}
      submitLabel="Revoke"
      hidden={{ assignmentId }}
      disabled={readOnly}
      variant="ghost"
      size="sm"
      className="items-end"
      confirm={`Revoke scan access for ${name}? They stop being able to admit anyone immediately.`}
    />
  );
}
