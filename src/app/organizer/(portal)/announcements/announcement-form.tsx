"use client";

import { ActionForm } from "@/components/dash/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { sendAnnouncement } from "../actions";

export function AnnouncementForm({
  events,
  readOnly,
}: {
  events: { id: string; title: string }[];
  readOnly: boolean;
}) {
  if (events.length === 0) {
    return (
      <p className="text-[12.5px] font-semibold text-ink-muted">
        You have no live events to announce to yet.
      </p>
    );
  }

  return (
    <ActionForm
      action={sendAnnouncement}
      submitLabel="Send to attendees"
      disabled={readOnly}
      disabledReason={readOnly ? "This account is read-only." : undefined}
      size="sm"
      confirm="Send this to every confirmed attendee? It cannot be recalled."
    >
      <Field label="Event" required>
        <Select name="eventId" required defaultValue={events[0]?.id}>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Subject" required>
        <Input
          name="subject"
          placeholder="Gate 2 is now the female-ring entry"
          required
          minLength={3}
        />
      </Field>
      <Field label="Message" required>
        <Textarea
          name="body"
          rows={5}
          required
          minLength={10}
          placeholder="Doors open at 7:30 PM tonight instead of 8. Same gate, same tickets."
        />
      </Field>
    </ActionForm>
  );
}
