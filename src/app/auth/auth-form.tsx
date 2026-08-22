"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { confirmOtp, requestOtp, type ActionState } from "./actions";
import {
  confirmFirebaseCode,
  firebaseErrorMessage,
  resetRecaptcha,
  sendFirebaseCode,
} from "@/lib/auth/firebase-client";
import type { ConfirmationResult } from "firebase/auth";

/**
 * The invisible reCAPTCHA needs a stable element to attach to. One id is fine
 * because only one sign-in form is ever mounted at a time.
 */
const RECAPTCHA_ID = "en-recaptcha";

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
  const devCode = phoneState.devCode;

  /**
   * The Firebase driver, if this deployment runs one.
   *
   * The server decides — `requestOtp` reports `clientDriven` — so the form
   * never guesses from the presence of an env var. Switching back to
   * server-issued OTP is one variable on the server and this whole branch
   * simply stops being taken.
   */
  const clientDriven = phoneState.clientDriven === true;
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [fbError, setFbError] = useState<string | null>(null);
  const [fbBusy, setFbBusy] = useState(false);
  const [submitting, startSubmit] = useTransition();
  const sentFor = useRef<string | null>(null);

  const error = fbError ?? otpState.error ?? phoneState.error;

  const requestFirebaseCode = useCallback(
    async (target: string) => {
      setFbError(null);
      setFbBusy(true);
      try {
        // Firebase wants E.164; the server normalises to a bare "91…".
        const result = await sendFirebaseCode(`+${target}`, RECAPTCHA_ID);
        setConfirmation(result);
      } catch (err) {
        setFbError(firebaseErrorMessage(err));
        // A failed send leaves the reCAPTCHA in a state that makes the retry
        // fail too, with a less helpful error. Tear it down so the next
        // attempt builds a fresh one.
        await resetRecaptcha();
        sentFor.current = null;
      } finally {
        setFbBusy(false);
      }
    },
    [],
  );

  // Once the server has accepted the number, the browser asks Firebase to send
  // the SMS. Guarded by the number itself rather than a boolean, so changing
  // the number re-sends and a re-render never does.
  useEffect(() => {
    if (!clientDriven || step !== "otp" || !phone) return;
    if (sentFor.current === phone) return;
    sentFor.current = phone;
    void requestFirebaseCode(phone);
  }, [clientDriven, step, phone, requestFirebaseCode]);

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
        <form
          action={otpAction}
          onSubmit={
            clientDriven
              ? (e) => {
                  // Firebase must turn the code into a token before the server
                  // sees anything, so this step cannot be a plain form post.
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const code = String(fd.get("code") ?? "").trim();
                  if (!confirmation || !code) return;
                  setFbError(null);
                  setFbBusy(true);
                  void (async () => {
                    try {
                      const idToken = await confirmFirebaseCode(confirmation, code);
                      const out = new FormData();
                      out.set("phone", phone);
                      // The token, never the code — the code is Firebase's
                      // business and the server would have no way to check it.
                      out.set("idToken", idToken);
                      startSubmit(() => otpAction(out));
                    } catch (err) {
                      setFbError(firebaseErrorMessage(err));
                    } finally {
                      setFbBusy(false);
                    }
                  })();
                }
              : undefined
          }
          className="flex flex-col gap-4"
        >
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
              {clientDriven && !confirmation
                ? `Sending a code to +${phone}…`
                : `Sent to +${phone}.`}
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

          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={otpPending || fbBusy || submitting}
            disabled={clientDriven && !confirmation}
          >
            Verify &amp; continue
          </Button>

          {clientDriven ? (
            <ResendButton
              onResend={() => {
                sentFor.current = null;
                setConfirmation(null);
                void resetRecaptcha().then(() => requestFirebaseCode(phone));
              }}
            />
          ) : (
            <ResendButton
              onResend={() => {
                const fd = new FormData();
                fd.set("phone", phone);
                phoneAction(fd);
              }}
            />
          )}
        </form>
      )}

      {/* Firebase attaches its invisible reCAPTCHA here. It has to be in the
          DOM before the first send and survive the phone → code step change,
          so it lives outside both forms rather than inside either. Rendered
          only for the client-driven driver; with server OTP there is nothing
          to attach and an empty div would just be litter. */}
      {clientDriven && <div id={RECAPTCHA_ID} />}
    </>
  );
}

/** Resend, gated by a visible countdown (spec C1.4). */
function ResendButton({ onResend }: { onResend: () => void }) {
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
        onResend();
        setSeconds(30);
      }}
      className="text-[12.5px] font-bold text-primary cursor-pointer"
    >
      Resend code
    </button>
  );
}
