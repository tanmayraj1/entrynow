"use client";

import * as React from "react";
import { ActionForm } from "@/components/dash/action-form";
import {
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
  Toggle,
} from "@/components/ui";
import {
  createGate,
  deleteEventDraft,
  setGatesClosed,
  submitEventForReview,
  toggleEventPause,
  updateEventDetails,
  upsertSession,
  upsertTier,
} from "../../actions";
import { inr, toRupees } from "@/lib/money";

/**
 * The organizer's editing forms.
 *
 * Client components only because they need `useActionState`; every value they
 * render is passed down from the server page, and every value they submit is
 * re-validated and re-authorised inside the action. Nothing here is trusted.
 */

export function EventDetailsForm({
  event,
  venues,
  readOnly,
}: {
  event: {
    id: string;
    title: string;
    summary: string | null;
    description: string | null;
    venueId: string;
    status: string;
    refundPolicy: string;
    transfersAllowed: boolean;
    partialCancellationAllowed: boolean;
  };
  venues: { id: string; name: string }[];
  readOnly: boolean;
}) {
  return (
    <ActionForm
      action={updateEventDetails}
      submitLabel="Save details"
      hidden={{ eventId: event.id }}
      disabled={readOnly}
      disabledReason={readOnly ? "This account is read-only." : undefined}
    >
      <Field label="Title" required>
        <Input name="title" defaultValue={event.title} required />
      </Field>
      <Field label="Summary" hint="One line, shown on the card.">
        <Input name="summary" defaultValue={event.summary ?? ""} />
      </Field>
      <Field label="Description">
        <Textarea name="description" rows={6} defaultValue={event.description ?? ""} />
      </Field>
      <Field
        label="Venue"
        hint={
          event.status === "LIVE"
            ? "Changing the venue on a live event needs admin review. It keeps selling at the current venue until approved."
            : undefined
        }
      >
        <Select name="venueId" defaultValue={event.venueId}>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Refund policy">
        <Select name="refundPolicy" defaultValue={event.refundPolicy}>
          <option value="NO_REFUND">No refunds</option>
          <option value="FLEXIBLE_72H">Flexible — free up to 72h before</option>
          <option value="CUSTOM">Custom tiers</option>
        </Select>
      </Field>
      <Toggle
        name="transfersAllowed"
        defaultChecked={event.transfersAllowed}
        label="Allow ticket transfers"
        hint="Attendees can pass a ticket to someone else up to 2h before."
      />
      <Toggle
        name="partialCancellationAllowed"
        defaultChecked={event.partialCancellationAllowed}
        label="Allow partial cancellation"
        hint="Cancel some tickets from a booking rather than all of them."
      />
    </ActionForm>
  );
}

export function TierForm({
  eventId,
  tier,
  readOnly,
  eventIsLive,
}: {
  eventId: string;
  tier?: {
    id: string;
    name: string;
    pricePaise: number;
    quantityTotal: number;
    quantitySold: number;
    quantityHeld: number;
    perUserLimit: number;
    isSeasonPass: boolean;
  };
  readOnly: boolean;
  eventIsLive: boolean;
}) {
  const committed = tier ? tier.quantitySold + tier.quantityHeld : 0;

  return (
    <ActionForm
      action={upsertTier}
      submitLabel={tier ? "Save tier" : "Add tier"}
      hidden={{ eventId, tierId: tier?.id }}
      disabled={readOnly}
      size="sm"
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Name" required>
          <Input name="name" defaultValue={tier?.name ?? ""} required />
        </Field>
        <Field
          label="Price (₹)"
          required
          hint={
            eventIsLive && tier
              ? "You can lower this now; raising it needs admin review."
              : undefined
          }
        >
          <Input
            name="priceRupees"
            type="number"
            min={0}
            step="1"
            defaultValue={tier ? toRupees(tier.pricePaise) : ""}
            required
          />
        </Field>
        <Field
          label="Capacity"
          required
          hint={
            committed > 0
              ? `${committed} already committed — cannot go below that.`
              : undefined
          }
        >
          <Input
            name="quantityTotal"
            type="number"
            min={Math.max(1, committed)}
            step="1"
            defaultValue={tier?.quantityTotal ?? ""}
            required
          />
        </Field>
        <Field label="Per-user limit" hint="Across all their bookings.">
          <Input
            name="perUserLimit"
            type="number"
            min={1}
            step="1"
            defaultValue={tier?.perUserLimit ?? 10}
          />
        </Field>
      </div>
      <Checkbox
        name="isSeasonPass"
        defaultChecked={tier?.isSeasonPass}
        label="Season pass"
        hint="Valid every night, scannable once per night."
      />
    </ActionForm>
  );
}

export function SessionForm({
  eventId,
  readOnly,
}: {
  eventId: string;
  readOnly: boolean;
}) {
  return (
    <ActionForm
      action={upsertSession}
      submitLabel="Add session"
      hidden={{ eventId }}
      disabled={readOnly}
      size="sm"
    >
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Name" hint="Optional — “Night 3”.">
          <Input name="name" placeholder="Night 1" />
        </Field>
        <Field label="Starts" required>
          <Input name="startsAt" type="datetime-local" required />
        </Field>
        <Field
          label="Ends"
          required
          hint="Past midnight? Pick the next date."
        >
          <Input name="endsAt" type="datetime-local" required />
        </Field>
      </div>
    </ActionForm>
  );
}

export function GateForm({
  eventId,
  readOnly,
}: {
  eventId: string;
  readOnly: boolean;
}) {
  return (
    <ActionForm
      action={createGate}
      submitLabel="Add gate"
      hidden={{ eventId }}
      disabled={readOnly}
      size="sm"
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Name" required>
          <Input name="name" placeholder="Gate 2 — General" required />
        </Field>
        <Field label="Code" required hint="Short, shown on the scanner.">
          <Input name="code" placeholder="G2" maxLength={8} required />
        </Field>
      </div>
    </ActionForm>
  );
}

export function EventStatusActions({
  event,
  readOnly,
}: {
  event: { id: string; status: string; publishedAt: string | null };
  readOnly: boolean;
}) {
  const canSubmit = event.status === "DRAFT" || event.status === "REJECTED";
  const canPause = event.status === "LIVE" || event.status === "PAUSED";
  const canDelete = event.status === "DRAFT" && event.publishedAt === null;

  return (
    <div className="flex flex-wrap gap-3">
      {canSubmit && (
        <ActionForm
          action={submitEventForReview}
          submitLabel="Submit for review"
          hidden={{ eventId: event.id }}
          disabled={readOnly}
          size="sm"
        />
      )}
      {canPause && (
        <ActionForm
          action={toggleEventPause}
          submitLabel={event.status === "LIVE" ? "Pause event" : "Go live again"}
          hidden={{ eventId: event.id }}
          disabled={readOnly}
          variant={event.status === "LIVE" ? "outline" : "primary"}
          size="sm"
          confirm={
            event.status === "LIVE"
              ? "Pause this event? It comes off the listings immediately. Tickets already sold stay valid."
              : undefined
          }
        />
      )}
      {canDelete && (
        <ActionForm
          action={deleteEventDraft}
          submitLabel="Delete draft"
          hidden={{ eventId: event.id }}
          disabled={readOnly}
          variant="danger"
          size="sm"
          confirm="Delete this draft permanently? It has never been published, so nothing is lost but your work on it."
        />
      )}
    </div>
  );
}

export function GateCloseToggle({
  eventId,
  closed,
  readOnly,
}: {
  eventId: string;
  closed: boolean;
  readOnly: boolean;
}) {
  return (
    <ActionForm
      action={setGatesClosed}
      submitLabel={closed ? "Reopen gates" : "Close gates"}
      hidden={{ eventId, closed: String(!closed) }}
      disabled={readOnly}
      variant={closed ? "primary" : "outline"}
      size="sm"
      confirm={
        closed
          ? undefined
          : "Close the gates? Scanners will start refusing every ticket with GATES_CLOSED."
      }
    />
  );
}

/** Small read-only money label, so tier rows do not each format their own. */
export function Paise({ value }: { value: number }) {
  return <span className="tabular">{inr(value)}</span>;
}
