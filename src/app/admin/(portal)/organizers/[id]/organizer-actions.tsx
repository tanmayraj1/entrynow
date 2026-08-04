"use client";

import * as React from "react";
import { ActionForm } from "@/components/dash/action-form";
import { Field, Textarea } from "@/components/ui";
import {
  decideKyc,
  reinstateOrganizer,
  suspendOrganizer,
} from "../../actions";

export function KycDecision({ organizerId }: { organizerId: string }) {
  const [rejecting, setRejecting] = React.useState(false);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] font-extrabold">KYC decision</p>
      <div className="flex flex-wrap items-center gap-3">
        <ActionForm
          action={decideKyc}
          submitLabel="Verify"
          hidden={{ organizerId, verdict: "approve" }}
          size="sm"
          confirm="Verify this organizer? They can publish events immediately."
        />
        <button
          type="button"
          data-hit
          onClick={() => setRejecting((v) => !v)}
          aria-expanded={rejecting}
          className="text-[12.5px] font-extrabold text-danger hover:underline cursor-pointer"
        >
          {rejecting ? "Cancel" : "Send back"}
        </button>
      </div>

      {rejecting && (
        <ActionForm
          action={decideKyc}
          submitLabel="Send back for correction"
          hidden={{ organizerId, verdict: "reject" }}
          variant="danger"
          size="sm"
        >
          <Field label="What is wrong" required>
            <Textarea
              name="note"
              rows={3}
              required
              minLength={10}
              placeholder="The PAN card image is cropped and the name does not match the legal name given."
            />
          </Field>
        </ActionForm>
      )}
    </div>
  );
}

export function SuspendControls({
  organizerId,
  name,
  suspended,
}: {
  organizerId: string;
  name: string;
  suspended: boolean;
}) {
  if (suspended) {
    return (
      <ActionForm
        action={reinstateOrganizer}
        submitLabel="Reinstate"
        hidden={{ organizerId }}
        size="sm"
        confirm={`Reinstate ${name}? Frozen payouts return to whatever state they were in before the freeze. Their events stay paused until they publish them.`}
      />
    );
  }

  return (
    <ActionForm
      action={suspendOrganizer}
      submitLabel="Suspend organizer"
      hidden={{ organizerId }}
      variant="danger"
      size="sm"
      confirm={`Suspend ${name}? Every live event pauses and every payout freezes, immediately.`}
    >
      <Field
        label="Reason"
        required
        hint="Recorded on the audit row and shown to the organizer."
      >
        <Textarea
          name="reason"
          rows={3}
          required
          minLength={10}
          placeholder="Three unresolved chargebacks and no response to support for 9 days."
        />
      </Field>
    </ActionForm>
  );
}
