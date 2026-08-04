"use client";

import { ActionForm } from "@/components/dash/action-form";
import { Field, Input, Textarea } from "@/components/ui";
import { cancelEvent, setEventPaused } from "../../actions";

export function PauseControls({
  eventId,
  status,
}: {
  eventId: string;
  status: string;
}) {
  const pause = status === "LIVE";
  if (status !== "LIVE" && status !== "PAUSED") {
    return (
      <p className="text-[12.5px] font-semibold text-ink-muted">
        Only a live or paused event can be paused or resumed — this one is{" "}
        {status.toLowerCase()}.
      </p>
    );
  }

  return (
    <ActionForm
      action={setEventPaused}
      submitLabel={pause ? "Pause event" : "Resume event"}
      hidden={{ eventId, pause: String(pause) }}
      variant={pause ? "outline" : "primary"}
      size="sm"
      confirm={
        pause
          ? "Pause this event? It comes off the listings immediately. Tickets already sold stay valid and no money moves."
          : undefined
      }
    >
      <Field
        label="Reason"
        hint="Optional, but it lands on the audit row and helps the next person."
      >
        <Input name="reason" placeholder="Venue licence under review" />
      </Field>
    </ActionForm>
  );
}

/**
 * Cancel — the only genuinely irreversible control on the platform.
 *
 * The typed-title confirmation is deliberate friction. `window.confirm` alone
 * is dismissed reflexively, and this action moves real money to hundreds of
 * people and cannot be walked back: CANCELLED is terminal in the event
 * machine. Typing the title forces the operator to look at *which* event they
 * are about to end. The server checks the typed value too, so removing this
 * field from the DOM does not bypass it.
 */
export function CancelEventForm({
  eventId,
  title,
}: {
  eventId: string;
  title: string;
}) {
  return (
    <ActionForm
      action={cancelEvent}
      submitLabel="Cancel event & refund everyone"
      hidden={{ eventId }}
      variant="danger"
      size="sm"
    >
      <Field label="Reason" required hint="Attendees see this on their refund notice.">
        <Textarea
          name="reason"
          rows={2}
          required
          minLength={10}
          placeholder="Venue withdrew the licence 48 hours before the first night."
        />
      </Field>
      <Field
        label={`Type the event title to confirm`}
        required
        hint={`Exactly: ${title}`}
      >
        <Input name="confirmTitle" required autoComplete="off" />
      </Field>
    </ActionForm>
  );
}
