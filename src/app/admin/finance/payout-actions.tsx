"use client";

import * as React from "react";
import { ActionForm } from "@/components/dash/action-form";
import { Field, Input } from "@/components/ui";
import { approvePayout, markPayoutPaid } from "../actions";

export function PayoutActions({
  payoutId,
  status,
}: {
  payoutId: string;
  status: string;
}) {
  const [paying, setPaying] = React.useState(false);

  if (status === "SCHEDULED" || status === "ACCRUING" || status === "FAILED") {
    return (
      <ActionForm
        action={approvePayout}
        submitLabel="Approve"
        hidden={{ payoutId }}
        size="sm"
        confirm="Approve this payout for processing?"
      />
    );
  }

  if (status === "PROCESSING") {
    return paying ? (
      <ActionForm
        action={markPayoutPaid}
        submitLabel="Confirm paid"
        hidden={{ payoutId }}
        size="sm"
        className="min-w-[190px]"
      >
        <Field label="Bank UTR" required>
          <Input name="utr" required minLength={6} autoComplete="off" />
        </Field>
      </ActionForm>
    ) : (
      <button
        type="button"
        data-hit
        onClick={() => setPaying(true)}
        className="text-[12.5px] font-extrabold text-primary hover:underline cursor-pointer"
      >
        Mark paid
      </button>
    );
  }

  return (
    <span className="text-[11.5px] font-semibold text-ink-muted">
      {status === "FROZEN"
        ? "Resolve the freeze first"
        : status === "PAID"
          ? "Settled"
          : "—"}
    </span>
  );
}
