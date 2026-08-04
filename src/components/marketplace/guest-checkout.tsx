"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Field, Input } from "@/components/ui";
import { beginGuestCheckout, type GuestState } from "@/app/booking/actions";
import { cn } from "@/lib/cn";

/**
 * The signed-out checkout gate: buy as a guest, or sign in.
 *
 * Guest is the default and the first tab. Making an account the price of a
 * ticket is the single biggest drop-off on a checkout, and everything the
 * platform actually needs from a buyer — a name for the ticket, a number for
 * the gate, an address to send it to — is collected here anyway.
 *
 * All three fields are mandatory, and each earns its place:
 *   • **Name** is printed on the ticket and checked at the gate.
 *   • **Phone** is the delivery channel and the identity the scanner shows.
 *   • **Email** is the copy that survives a lost phone.
 *
 * Signing in is still offered, and is the better path for anyone who already
 * has tickets — a guest checkout cannot reach an existing account, by design
 * (see `src/lib/auth/guest.ts`).
 */
export function GuestCheckout({ next }: { next: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"guest" | "account">("guest");
  const [state, action, pending] = useActionState<GuestState, FormData>(
    beginGuestCheckout,
    {},
  );

  useEffect(() => {
    if (state.notice === "ready") {
      // Same URL. The page re-renders with a session and goes straight to the
      // order summary, so the buyer never loses the seats they picked.
      router.replace(next);
      router.refresh();
    }
  }, [state.notice, next, router]);

  return (
    <div className="px-4 py-10 md:py-14 flex justify-center">
      <div className="w-full max-w-[440px]">
        <div
          role="tablist"
          aria-label="How to check out"
          className="grid grid-cols-2 gap-1.5 p-1.5 bg-bg border border-border rounded-[16px] mb-3"
        >
          <TabButton
            active={tab === "guest"}
            onClick={() => setTab("guest")}
            label="Continue as guest"
          />
          <TabButton
            active={tab === "account"}
            onClick={() => setTab("account")}
            label="Sign in"
          />
        </div>

        <div className="bg-surface border border-border rounded-[20px] p-6 md:p-8">
          {tab === "guest" ? (
            <form action={action} className="flex flex-col gap-4">
              <div>
                <h1 className="text-[22px] tracking-[-0.4px]">
                  Where should the tickets go?
                </h1>
                <p className="text-[13px] text-ink-muted font-semibold mt-1.5">
                  No account needed. We&apos;ll send them to your phone and your
                  email, and your name goes on the ticket for the gate.
                </p>
              </div>

              <Field label="Full name" required>
                <Input
                  name="name"
                  autoComplete="name"
                  placeholder="Meera Shah"
                  defaultValue={state.values?.name}
                  required
                  autoFocus
                  invalid={state.field === "name"}
                />
              </Field>

              <Field label="Mobile number" required>
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-bold text-ink-muted shrink-0">
                    +91
                  </span>
                  <Input
                    name="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="98765 43210"
                    defaultValue={state.values?.phone}
                    required
                    invalid={state.field === "phone"}
                  />
                </div>
              </Field>

              <Field label="Email" required>
                <Input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  defaultValue={state.values?.email}
                  required
                  invalid={state.field === "email"}
                />
              </Field>

              {state.error && (
                <p role="alert" className="text-[12.5px] font-semibold text-danger">
                  {state.error}{" "}
                  {state.field === "phone" && (
                    <Link href={`/auth?next=${encodeURIComponent(next)}`}>
                      Sign in
                    </Link>
                  )}
                </p>
              )}

              <Button type="submit" fullWidth size="lg" loading={pending}>
                Continue to payment
              </Button>

              <p className="text-[11.5px] text-ink-muted text-center leading-relaxed">
                By continuing you agree to our{" "}
                <Link href="/legal/terms">terms</Link> and{" "}
                <Link href="/legal/privacy">privacy policy</Link>.
              </p>
            </form>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <h1 className="text-[22px] tracking-[-0.4px]">
                  Sign in to check out
                </h1>
                <p className="text-[13px] text-ink-muted font-semibold mt-1.5">
                  Best if you&apos;ve booked before — your wallet balance,
                  saved details and every past ticket come with you.
                </p>
              </div>
              <Link href={`/auth?next=${encodeURIComponent(next)}`}>
                <Button fullWidth size="lg">
                  Sign in with your phone
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
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
      {label}
    </button>
  );
}
