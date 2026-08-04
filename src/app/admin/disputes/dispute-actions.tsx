"use client";

import * as React from "react";
import { ActionForm } from "@/components/dash/action-form";
import { Field, Select, Textarea } from "@/components/ui";
import { updateDispute } from "../actions";

/**
 * The legal next states come from `src/lib/state-machines.ts`, mirrored here
 * for the control. The server calls `assertTransition` regardless — this list
 * decides what is *shown*, never what is *allowed*.
 */
export function DisputeActions({
  disputeId,
  status,
}: {
  disputeId: string;
  status: string;
}) {
  const [resolving, setResolving] = React.useState(false);

  if (status === "OPEN" && !resolving) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <ActionForm
          action={updateDispute}
          submitLabel="Start investigating"
          hidden={{ disputeId, status: "INVESTIGATING" }}
          size="sm"
          confirm="Move to investigating? This freezes the organizer's scheduled payouts until it is resolved."
        />
        <button
          type="button"
          data-hit
          onClick={() => setResolving(true)}
          className="text-[12.5px] font-extrabold text-ink-muted hover:text-ink cursor-pointer"
        >
          Reject outright
        </button>
      </div>
    );
  }

  const options =
    status === "OPEN"
      ? [{ value: "RESOLVED_REJECT", label: "Reject — no refund" }]
      : [
          { value: "RESOLVED_REFUND", label: "Resolve — full refund" },
          { value: "RESOLVED_PARTIAL", label: "Resolve — partial refund" },
          { value: "RESOLVED_REJECT", label: "Reject — no refund" },
        ];

  return (
    <ActionForm
      action={updateDispute}
      submitLabel="Record resolution"
      hidden={{ disputeId }}
      size="sm"
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Outcome" required>
          <Select name="status" required defaultValue={options[0].value}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        label="Resolution note"
        required
        hint="This is the record if the decision is ever queried."
      >
        <Textarea name="note" rows={3} required minLength={10} />
      </Field>
      <p className="text-[11.5px] font-semibold text-ink-muted">
        Recording a refund outcome here does not move money on its own — issue
        the refund from the booking so the ledger and the attendee&apos;s wallet
        stay in step.
      </p>
    </ActionForm>
  );
}
