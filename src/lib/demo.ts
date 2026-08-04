/**
 * Demo mode.
 *
 * The demo build deliberately weakens two things that are load-bearing in a
 * real deployment:
 *
 *   - the phone OTP is a fixed code (`SMS_DRIVER=sandbox`);
 *   - email sign-up creates a usable account with **no verification**, so
 *     anyone can claim any address.
 *
 * Both are reasonable for a private review environment and catastrophic on a
 * public one — the fixed OTP alone means anyone can sign in as the seeded
 * admins. So neither is implicit: they are gated on `DEMO_MODE=true`, the app
 * refuses to boot with demo mode on in production unless that is explicitly
 * acknowledged, and every page carries a banner so nobody can mistake this
 * build for a live one (D-025).
 *
 * Deliberately NOT `NEXT_PUBLIC_`: a client-readable flag could be flipped in
 * devtools, and this decides whether an unverified login is accepted. The
 * server passes the resolved value down as a prop where the UI needs it.
 */

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

/**
 * Fail fast rather than silently serving an insecure build.
 *
 * Called from `instrumentation.ts`, so a misconfigured deploy dies at boot —
 * where someone is watching the logs — instead of at 2 a.m. when an attacker
 * finds the fixed OTP.
 */
export function assertDemoModeIsIntentional(): void {
  if (!isDemoMode()) return;

  const acknowledged = process.env.DEMO_MODE_ALLOW_PRODUCTION === "true";
  if (process.env.NODE_ENV === "production" && !acknowledged) {
    throw new Error(
      "DEMO_MODE=true in a production build. Demo mode accepts a fixed OTP " +
        "and unverified email sign-ups, so anyone can sign in as anyone — " +
        "including the seeded admin accounts.\n\n" +
        "If this deployment is a PRIVATE review environment behind access " +
        "control, set SITE_PASSWORD and DEMO_MODE_ALLOW_PRODUCTION=true.\n" +
        "If it is public, set DEMO_MODE=false and configure SMS_DRIVER.",
    );
  }

  /**
   * The acknowledgement has to be backed by something.
   *
   * This check exists because the first deploy proved the failure mode is
   * real: `DEMO_MODE_ALLOW_PRODUCTION=true` was set on the understanding that
   * Vercel's free "Standard Protection" gated the site, and it did not — it
   * covers preview deployments and non-production custom domains, not the
   * production `*.vercel.app` alias. The build came up fully public with a
   * fixed super-admin OTP.
   *
   * So the flag is no longer taken at its word. `SITE_PASSWORD` is what
   * `src/middleware.ts` enforces, and requiring it here means the promise and
   * the mechanism cannot drift apart again.
   */
  if (
    process.env.NODE_ENV === "production" &&
    acknowledged &&
    !process.env.SITE_PASSWORD
  ) {
    throw new Error(
      "DEMO_MODE_ALLOW_PRODUCTION=true claims this deployment is behind " +
        "access control, but SITE_PASSWORD is not set — so nothing is " +
        "actually gating it and the fixed OTP is public.\n\n" +
        "Set SITE_PASSWORD to a strong shared password (src/middleware.ts " +
        "enforces it), or set DEMO_MODE=false.",
    );
  }

  console.warn(
    "[demo] DEMO_MODE is ON — fixed OTP, unverified email sign-up, and a " +
      "simulated payment gateway. Do not expose this build publicly.",
  );
}

/** Card numbers the demo gateway recognises. Shown on the payment screen. */
export const DEMO_CARDS = [
  {
    number: "4111 1111 1111 1111",
    label: "Visa — succeeds",
    outcome: "success" as const,
  },
  {
    number: "5555 5555 5555 4444",
    label: "Mastercard — succeeds",
    outcome: "success" as const,
  },
  {
    number: "4000 0000 0000 0002",
    label: "Declined by bank",
    outcome: "failure" as const,
  },
];

export const DEMO_UPI_SUCCESS = "success@upi";
export const DEMO_UPI_FAILURE = "failure@upi";

/** Any expiry in the future and any 3-digit CVV are accepted. */
export const DEMO_CARD_HINT = "Any future expiry · any 3-digit CVV";

/**
 * Which way the demo gateway should resolve, from whatever the user typed.
 *
 * Digits-only comparison so the spacing on the card screen does not matter,
 * and anything unrecognised succeeds — a demo should not dead-end someone who
 * typed their own test number.
 */
export function demoOutcomeFor(input: string): "success" | "failure" {
  const digits = input.replace(/\D/g, "");
  if (digits) {
    const card = DEMO_CARDS.find((c) => c.number.replace(/\D/g, "") === digits);
    if (card) return card.outcome;
  }
  if (input.trim().toLowerCase() === DEMO_UPI_FAILURE) return "failure";
  return "success";
}
