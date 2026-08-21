"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A centred modal dialog, at every width.
 *
 * Uses the native <dialog> element so focus trapping, Escape-to-close and an
 * inert background come from the platform rather than a hand-rolled trap.
 *
 * **Centring is the browser's, not ours.** A modal `<dialog>` gets
 * `position: fixed; inset: 0; margin: auto` from the UA stylesheet, which
 * centres a shrink-to-fit box for free. The previous version overrode all
 * three — `w-full h-full m-0` for a mobile bottom sheet — and tried to restore
 * them at `sm:` with `sm:w-auto sm:h-auto sm:m-auto`. Those overrides silently
 * lost the cascade, so the dialog stayed a full-viewport block with the panel
 * as its first static child: the popup sat in the **top-left corner** on
 * desktop, which is what it had been doing.
 *
 * So the element is left shrink-to-fit and simply bounded. Nothing here needs
 * to win an override, which is why it now behaves the same at 390 and 1440.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /** Cancel/confirm dialogs that must not be dismissed by a stray Escape. */
  dismissible?: boolean;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" };

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        // Backdrop click: the dialog element itself is the backdrop area.
        if (dismissible && e.target === ref.current) onClose();
      }}
      className={cn(
        "backdrop:bg-[rgba(22,48,43,.45)] bg-transparent p-0",
        // Bounded, never sized. `m-auto` is the UA default restated so a
        // future utility cannot quietly drop it again.
        "m-auto w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]",
        widths[size],
      )}
    >
      <div
        className={cn(
          "bg-surface text-ink shadow-[var(--shadow-modal)] w-full",
          "rounded-[var(--radius-card-lg)] max-h-[calc(100dvh-2rem)]",
          "flex flex-col overflow-hidden",
        )}
      >
        {title && (
          <header className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border shrink-0">
            <h2 className="text-[16.5px]">{title}</h2>
            {dismissible && (
              <button
                type="button"
                data-hit
                onClick={onClose}
                aria-label="Close"
                className="text-ink-muted hover:text-ink cursor-pointer"
              >
                <X size={18} strokeWidth={2.4} />
              </button>
            )}
          </header>
        )}

        <div className="overflow-y-auto px-5 py-4 grow">{children}</div>

        {footer && (
          <footer className="px-5 py-4 border-t border-border shrink-0">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}
