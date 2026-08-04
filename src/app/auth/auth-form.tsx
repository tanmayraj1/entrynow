"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { confirmOtp, requestOtp, type ActionState } from "./actions";

/**
 * Phone → OTP sign-in.
 *
 * Two `useActionState` forms rather than one, because the two steps have
 * genuinely different validation and error vocabularies (spec C1.4).
 */
export function AuthForm({
  next,
  heading = "Sign in to book",
  blurb = "We'll text you a code. Your number is how tickets reach you and how you're identified at the gate.",
  showTerms = true,
}: {
  next: string;
  /** Overridden by the staff doors, where "to book" is the wrong promise. */
  heading?: string;
  blurb?: string;
  /** The terms line belongs on the consumer sign-up, not on a staff login. */
  showTerms?: boolean;
}) {
  const router = useRouter();
  const [phoneState, phoneAction, phonePending] = useActionState<
    ActionState,
    FormData
  >(requestOtp, { step: "phone" });
  const [otpState, otpAction, otpPending] = useActionState<ActionState, FormData>(
    confirmOtp,
    { step: "otp" },
  );

  // The OTP step's own errors can send us back to the phone step (expired,
  // locked); otherwise stay wherever the last action landed.
  const step =
    otpState.step === "phone" ? "phone" : phoneState.step === "otp" ? "otp" : "phone";
  const phone = otpState.phone ?? phoneState.phone ?? "";
  const error = otpState.error ?? phoneState.error;
  const devCode = phoneState.devCode;

  useEffect(() => {
    if (otpState.notice === "signed-in") {
      router.replace(next);
      router.refresh();
    }
  }, [otpState.notice, next, router]);

  return (
    <>
      {step === "phone" ? (
        <form action={phoneAction} className="flex flex-col gap-4">
          <div>
            <h1 className="text-[22px] tracking-[-0.4px]">{heading}</h1>
            <p className="text-[13px] text-ink-muted font-semibold mt-1.5">
              {blurb}
            </p>
          </div>

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
                defaultValue={phone.replace(/^91/, "")}
                required
                autoFocus
                invalid={Boolean(phoneState.error)}
              />
            </div>
          </Field>

          {error && (
            <p role="alert" className="text-[12.5px] font-semibold text-danger">
              {error}
            </p>
          )}

          <Button type="submit" fullWidth size="lg" loading={phonePending}>
            Send code
          </Button>

          {showTerms && (
            <p className="text-[11.5px] text-ink-muted text-center leading-relaxed">
              By continuing you agree to our{" "}
              <Link href="/legal/terms">terms</Link> and{" "}
              <Link href="/legal/privacy">privacy policy</Link>.
            </p>
          )}
        </form>
      ) : (
        <form action={otpAction} className="flex flex-col gap-4">
          <input type="hidden" name="phone" value={phone} />

          <div>
            <button
              type="submit"
              formAction={phoneAction}
              name="phone"
              value=""
              className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink-muted hover:text-primary cursor-pointer mb-3"
            >
              <ArrowLeft size={14} strokeWidth={2.4} />
              Change number
            </button>
            <h1 className="text-[22px] tracking-[-0.4px]">Enter the code</h1>
            <p className="text-[13px] text-ink-muted font-semibold mt-1.5">
              Sent to +{phone}.
            </p>
          </div>

          <Field label="6-digit code" required>
            <Input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              defaultValue={devCode ?? ""}
              required
              autoFocus
              invalid={Boolean(otpState.error)}
              className="text-center text-[20px] tracking-[0.4em] font-extrabold"
            />
          </Field>

          {devCode && (
            <p className="text-[11.5px] font-semibold text-primary-dark bg-primary-tint rounded-[10px] px-3 py-2 flex items-center gap-2">
              <ShieldCheck size={14} />
              Sandbox mode — the code is <b>{devCode}</b>, already filled in.
            </p>
          )}

          {error && (
            <p role="alert" className="text-[12.5px] font-semibold text-danger">
              {error}
            </p>
          )}

          <Button type="submit" fullWidth size="lg" loading={otpPending}>
            Verify &amp; continue
          </Button>

          <ResendButton action={phoneAction} phone={phone} />
        </form>
      )}
    </>
  );
}

/** Resend, gated by a visible countdown (spec C1.4). */
function ResendButton({
  action,
  phone,
}: {
  action: (fd: FormData) => void;
  phone: string;
}) {
  const [seconds, setSeconds] = useState(30);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  if (seconds > 0) {
    return (
      <p className="text-[12px] text-ink-muted font-semibold text-center">
        Didn&apos;t get it? Resend in {seconds}s
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        const fd = new FormData();
        fd.set("phone", phone);
        action(fd);
        setSeconds(30);
      }}
      className="text-[12.5px] font-bold text-primary cursor-pointer"
    >
      Resend code
    </button>
  );
}
