"use client";

import { useState } from "react";
import { Mail, Smartphone } from "lucide-react";
import { cn } from "@/lib/cn";
import { AuthForm } from "./auth-form";
import { EmailForm } from "./email-form";

/**
 * Two ways in: phone + OTP, or email + password.
 *
 * Phone is the default and the only one offered outside the demo build. It is
 * what the gate scanner identifies people by and what a ticket is delivered
 * to, so an email-only account is a second-class citizen here by design — see
 * spec C1.5, which requires phone verification before a first booking.
 *
 * Rendered as a client tab rather than two routes so switching does not lose
 * whatever was already typed into the other form.
 */
export function AuthTabs({
  next,
  demoMode,
}: {
  next: string;
  /** Resolved on the server — a client-readable flag could be flipped. */
  demoMode: boolean;
}) {
  const [tab, setTab] = useState<"phone" | "email">("phone");

  if (!demoMode) {
    return (
      <div className="w-full max-w-[420px] bg-surface border border-border rounded-[20px] p-6 md:p-8">
        <AuthForm next={next} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[420px]">
      <div
        role="tablist"
        aria-label="Sign-in method"
        className="grid grid-cols-2 gap-1.5 p-1.5 bg-bg border border-border rounded-[16px] mb-3"
      >
        <TabButton
          active={tab === "phone"}
          onClick={() => setTab("phone")}
          icon={<Smartphone size={15} strokeWidth={2.4} />}
          label="Phone + OTP"
        />
        <TabButton
          active={tab === "email"}
          onClick={() => setTab("email")}
          icon={<Mail size={15} strokeWidth={2.4} />}
          label="Email + password"
        />
      </div>

      <div className="bg-surface border border-border rounded-[20px] p-6 md:p-8">
        {tab === "phone" ? <AuthForm next={next} /> : <EmailForm next={next} />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-[11px] py-2.5",
        "text-[13px] font-bold cursor-pointer transition-colors",
        active
          ? "bg-surface text-ink shadow-[var(--shadow-e1)]"
          : "text-ink-muted hover:text-ink",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
