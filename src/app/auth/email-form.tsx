"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, ShieldAlert } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { emailAuth, type EmailActionState } from "./actions";

/**
 * Email + password, demo only.
 *
 * One action serves both sign-in and sign-up, and the intent is a hidden
 * field rather than two endpoints: separate endpoints with different error
 * messages let anyone enumerate which addresses have accounts.
 *
 * The "no verification" warning is not decoration. Without it, a reviewer
 * would reasonably assume the address had been confirmed, and this build lets
 * anyone claim any address they can type.
 */
export function EmailForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [state, action, pending] = useActionState<EmailActionState, FormData>(
    emailAuth,
    {},
  );

  useEffect(() => {
    if (state.notice === "signed-in") {
      router.replace(next);
      router.refresh();
    }
  }, [state.notice, next, router]);

  // The server can bounce a sign-up back to sign-in ("that email already has
  // an account"), so it owns the mode once it has spoken.
  const active = (state.intent as "signin" | "signup") ?? mode;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="intent" value={active} />

      <div>
        <h1 className="text-[22px] tracking-[-0.4px]">
          {active === "signup" ? "Create an account" : "Sign in with email"}
        </h1>
        <p className="text-[13px] text-ink-muted font-semibold mt-1.5">
          {active === "signup"
            ? "Pick any email and password — this demo does not send a confirmation."
            : "Use the email and password you set up here."}
        </p>
      </div>

      {active === "signup" && (
        <Field label="Your name">
          <Input name="name" autoComplete="name" placeholder="Meera Patel" />
        </Field>
      )}

      <Field label="Email" required>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          defaultValue={state.email ?? ""}
          required
          autoFocus
          invalid={Boolean(state.error)}
        />
      </Field>

      <Field
        label="Password"
        required
        hint={active === "signup" ? "At least 8 characters." : undefined}
      >
        <Input
          name="password"
          type="password"
          autoComplete={active === "signup" ? "new-password" : "current-password"}
          placeholder="••••••••"
          required
          invalid={Boolean(state.error)}
        />
      </Field>

      {state.error && (
        <p role="alert" className="text-[12.5px] font-semibold text-danger">
          {state.error}
        </p>
      )}

      <p className="text-[11.5px] font-semibold text-status-warning-fg bg-status-warning-bg rounded-[10px] px-3 py-2 flex items-start gap-2">
        <ShieldAlert size={14} className="shrink-0 mt-0.5" />
        Demo build — email addresses are <b>not verified</b>, so anyone can
        claim any address. Do not use a password you use elsewhere.
      </p>

      <Button type="submit" fullWidth size="lg" loading={pending}>
        <Mail size={16} strokeWidth={2.4} />
        {active === "signup" ? "Create account & continue" : "Sign in"}
      </Button>

      <button
        type="button"
        onClick={() => setMode(active === "signup" ? "signin" : "signup")}
        className="text-[12.5px] font-bold text-primary cursor-pointer"
      >
        {active === "signup"
          ? "Already have an account? Sign in"
          : "New here? Create an account"}
      </button>

      <p className="text-[11.5px] text-ink-muted text-center leading-relaxed">
        By continuing you agree to our <Link href="/legal/terms">terms</Link> and{" "}
        <Link href="/legal/privacy">privacy policy</Link>.
      </p>
    </form>
  );
}
