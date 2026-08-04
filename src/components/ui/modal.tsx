"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Modal / bottom sheet. Renders as a centred dialog on desktop and a bottom
 * sheet under the 768px breakpoint, matching the mobile responsive rules.
 *
 * Uses the native <dialog> element so focus trapping, Escape-to-close and
 * inert-background come from the platform rather than a hand-rolled trap.
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

  const widths = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-3xl" };

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
        "backdrop:bg-[rgba(22,48,43,.45)] bg-transparent p-0 m-0 max-w-none max-h-none",
        "w-full h-full sm:w-auto sm:h-auto sm:m-auto",
      )}
    >
      <div
        className={cn(
          "bg-surface text-ink shadow-[var(--shadow-modal)] w-full",
          "fixed bottom-0 left-0 right-0 rounded-t-[var(--radius-card-lg)] max-h-[92vh]",
          "sm:static sm:rounded-[var(--radius-card-lg)] sm:max-h-[85vh]",
          widths[size],
          "flex flex-col",
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
