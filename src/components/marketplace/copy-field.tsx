"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Read-only value with a copy button that confirms it worked. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (insecure context or denied permission) — the value
      // is visible and selectable, so this is not worth an error banner.
    }
  }

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-bold text-body-soft">{label}</span>
      <span className="flex items-center gap-2">
        <input
          readOnly
          value={value}
          aria-label={label}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 bg-bg border border-border rounded-[var(--radius-input)] px-3.5 py-2.5 text-[13px] font-bold text-ink outline-none"
        />
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="shrink-0 size-10 grid place-items-center rounded-[var(--radius-input)] border border-border bg-surface hover:border-primary hover:text-primary cursor-pointer transition-colors"
        >
          {copied ? (
            <Check size={16} strokeWidth={2.4} className="text-primary" />
          ) : (
            <Copy size={16} strokeWidth={2.2} />
          )}
        </button>
      </span>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </label>
  );
}
