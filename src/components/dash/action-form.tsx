"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * The portal's form wrapper.
 *
 * Every portal mutation returns the same `{ ok, error, notice, id }` shape, so
 * the plumbing — pending state, the error banner, the success banner, the
 * disabled submit — is written once here rather than in twenty forms with
 * twenty slightly different behaviours.
 *
 * `router.refresh()` on success rather than a redirect: the server components
 * above re-render with the new data and the user stays where they were, which
 * is what someone editing a tier expects. A redirect would lose their place.
 */

export interface PortalActionResult {
  ok: boolean;
  error?: string;
  notice?: string;
  id?: string;
}

export function ActionForm({
  action,
  submitLabel,
  children,
  hidden,
  disabled,
  disabledReason,
  variant = "primary",
  size = "md",
  confirm,
  className,
  footer,
  onDone,
}: {
  action: (
    prev: PortalActionResult,
    formData: FormData,
  ) => Promise<PortalActionResult>;
  submitLabel: string;
  children?: React.ReactNode;
  /** Fixed values the action needs — eventId, tierId. */
  hidden?: Record<string, string | undefined>;
  disabled?: boolean;
  disabledReason?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
  /** A destructive action states what it will do and waits for a yes. */
  confirm?: string;
  className?: string;
  footer?: React.ReactNode;
  onDone?: (result: PortalActionResult) => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    PortalActionResult,
    FormData
  >(action, { ok: false });

  const doneRef = React.useRef<PortalActionResult | null>(null);
  React.useEffect(() => {
    if (!state.ok || state === doneRef.current) return;
    doneRef.current = state;
    router.refresh();
    onDone?.(state);
  }, [state, router, onDone]);

  return (
    <form
      action={formAction}
      className={cn("flex flex-col gap-3.5", className)}
      onSubmit={(e) => {
        // `confirm()` here rather than a modal: this is the last gate before an
        // irreversible write, and a native dialog cannot be missed, mis-styled
        // or dismissed by a stray re-render.
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(hidden ?? {}).map(([k, v]) =>
        v === undefined ? null : (
          <input key={k} type="hidden" name={k} value={v} />
        ),
      )}

      {children}

      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 text-[12.5px] font-bold text-danger bg-danger-tint rounded-[10px] px-3 py-2.5"
        >
          <AlertCircle size={15} strokeWidth={2.4} className="shrink-0 mt-px" />
          <span>{state.error}</span>
        </p>
      )}
      {state.ok && state.notice && (
        <p
          role="status"
          className="flex items-start gap-2 text-[12.5px] font-bold text-status-success-fg bg-status-success-bg rounded-[10px] px-3 py-2.5"
        >
          <CheckCircle2
            size={15}
            strokeWidth={2.4}
            className="shrink-0 mt-px"
          />
          <span>{state.notice}</span>
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Button
          type="submit"
          variant={variant}
          size={size}
          loading={pending}
          disabled={disabled}
        >
          {submitLabel}
        </Button>
        {disabled && disabledReason && (
          <span className="text-[11.5px] font-semibold text-ink-muted">
            {disabledReason}
          </span>
        )}
        {footer}
      </div>
    </form>
  );
}
