"use client";

import { ActionForm } from "@/components/dash/action-form";
import { Input } from "@/components/ui";
import { updateConfig } from "../actions";

export function ConfigRow({
  configKey,
  value,
  isDefault,
  updatedAt,
}: {
  configKey: string;
  value: string;
  isDefault: boolean;
  updatedAt: string | null;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-[13px] font-extrabold">{configKey}</p>
        <p className="text-[11.5px] font-semibold text-ink-muted">
          {isDefault
            ? "Using the built-in default — no row stored yet"
            : `Overridden${updatedAt ? ` · ${updatedAt}` : ""}`}
        </p>
      </div>
      <ActionForm
        action={updateConfig}
        submitLabel="Save"
        hidden={{ key: configKey }}
        variant="outline"
        size="sm"
        className="flex-row items-center gap-2 shrink-0"
      >
        <Input
          name="value"
          defaultValue={value}
          aria-label={`Value for ${configKey}`}
          className="w-[160px] tabular"
        />
      </ActionForm>
    </div>
  );
}
