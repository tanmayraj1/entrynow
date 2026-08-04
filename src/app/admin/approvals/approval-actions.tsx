"use client";

import * as React from "react";
import { ActionForm } from "@/components/dash/action-form";
import { Field, Textarea } from "@/components/ui";
import { approveEvent, rejectEvent } from "../actions";

export function ApprovalActions({
  eventId,
  isEdit,
}: {
  eventId: string;
  isEdit: boolean;
}) {
  const [rejecting, setRejecting] = React.useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <ActionForm
          action={approveEvent}
          submitLabel={isEdit ? "Approve change & notify" : "Approve & publish"}
          hidden={{ eventId }}
          size="sm"
          confirm={
            isEdit
              ? "Apply this change, publish it, and notify every attendee with a 72-hour free-cancellation window?"
              : undefined
          }
        />
        <button
          type="button"
          data-hit
          onClick={() => setRejecting((v) => !v)}
          aria-expanded={rejecting}
          className="text-[12.5px] font-extrabold text-danger hover:underline cursor-pointer"
        >
          {rejecting ? "Cancel" : "Request changes"}
        </button>
      </div>

      {rejecting && (
        <ActionForm
          action={rejectEvent}
          submitLabel="Send back"
          hidden={{ eventId }}
          variant="danger"
          size="sm"
        >
          <Field
            label="What needs fixing"
            required
            hint="The organizer sees this note and nothing else, so make it actionable."
          >
            <Textarea
              name="note"
              rows={3}
              required
              minLength={10}
              placeholder="The cover image is a stock photo with a watermark, and Night 3 ends before it starts."
            />
          </Field>
        </ActionForm>
      )}
    </div>
  );
}
