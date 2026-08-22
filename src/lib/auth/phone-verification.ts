import "server-only";

import { createRemoteJWKSet, jwtVerify } from "jose";
import { sendOtp, verifyOtp } from "./otp";

/**
 * How we prove someone controls a phone number.
 *
 * Two drivers, chosen by `PHONE_VERIFY_DRIVER`, because the two answers to
 * "has this number been verified?" have genuinely different shapes:
 *
 *   - **`otp`** (default) — we generate the code, we send it through
 *     `SmsAdapter`, we check it. Every limit in spec A3 is ours to enforce:
 *     6 digits, 5 minutes, 3 sends per 10 minutes, 5 attempts then a lock.
 *     The `sandbox` SMS driver makes this work with no provider account, which
 *     is what `DEMO_MODE` runs on.
 *
 *   - **`firebase`** — the *browser* runs Firebase's phone flow and comes back
 *     with a signed ID token. We never see the code; we check the token.
 *
 * The seam exists because the second one is a compromise we expect to reverse.
 * Firebase is here to skip India's DLT registration, which gates every SMS
 * provider and takes weeks (D-041). When DLT clears, moving to MSG91 is a new
 * `SmsAdapter` driver and `PHONE_VERIFY_DRIVER=otp` — the sign-in actions, the
 * session model and the `User` table never learn that anything changed.
 *
 * **Firebase is a phone-ownership oracle here, not an identity provider.** It
 * is never asked who someone is; it is asked whether this browser proved
 * control of this number. The answer feeds `findOrCreateUserByPhone` exactly
 * as a correct OTP would, so `User`, sessions, RBAC and the guest-checkout
 * guards (D-036) are untouched by the choice.
 */

export type StartResult =
  | {
      ok: true;
      /**
       * True when the browser must run the flow itself. The form switches to
       * the Firebase SDK and the server sends nothing.
       */
      clientDriven: boolean;
      expiresInSeconds?: number;
      /** Sandbox only — lets local sign-in work with no SMS provider. */
      devCode?: string;
    }
  | {
      ok: false;
      reason: "RATE_LIMITED" | "LOCKED" | "UNAVAILABLE";
      retryAfterSeconds: number;
      message?: string;
    };

export type VerifyProofResult =
  | { ok: true }
  | {
      ok: false;
      reason: "EXPIRED" | "WRONG" | "LOCKED" | "UNAVAILABLE";
      attemptsLeft?: number;
      retryAfterSeconds?: number;
      message?: string;
    };

export interface PhoneVerifier {
  readonly name: string;
  /** Does the browser drive the send-and-enter-code exchange? */
  readonly clientDriven: boolean;
  start(phone: string): Promise<StartResult>;
  /** `proof` is a 6-digit code, or a Firebase ID token when client-driven. */
  verify(phone: string, proof: string): Promise<VerifyProofResult>;
}

// ---------------------------------------------------------------------------
// Server-issued OTP — the default, and the one the spec describes
// ---------------------------------------------------------------------------

const serverOtp: PhoneVerifier = {
  name: "otp",
  clientDriven: false,
  async start(phone) {
    const r = await sendOtp(phone);
    if (!r.ok) return r;
    return {
      ok: true,
      clientDriven: false,
      expiresInSeconds: r.expiresInSeconds,
      devCode: r.devCode,
    };
  },
  verify(phone, proof) {
    return verifyOtp(phone, proof);
  },
};

// ---------------------------------------------------------------------------
// Firebase — the browser verifies, we check its receipt
// ---------------------------------------------------------------------------

/**
 * Google's public keys for Firebase ID tokens.
 *
 * Verified with `jose` rather than `firebase-admin`, deliberately. The Admin
 * SDK would need a service-account JSON — a real secret, in a repo that is
 * public — and it is a heavy import to pay for on every cold start. A Firebase
 * ID token is an ordinary RS256 JWT signed by Google, so the project already
 * has everything needed to check one: `jose` signs the session cookie and the
 * ticket QR. The only server-side configuration is a project id, which is not
 * a secret at all.
 *
 * `createRemoteJWKSet` caches and rotates the key set on its own.
 */
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);

/**
 * Firebase returns E.164 (`+919876543210`); we store `919876543210`.
 *
 * Exported for testing. This one comparison is what stops a user verifying a
 * number they own and then submitting somebody else's in the form field, so it
 * is worth a test of its own rather than only being exercised through a token.
 */
export function sameNumber(claim: unknown, expected: string): boolean {
  if (typeof claim !== "string") return false;
  return claim.replace(/\D/g, "") === expected.replace(/\D/g, "");
}

const firebase: PhoneVerifier = {
  name: "firebase",
  clientDriven: true,

  async start(phone) {
    // Nothing to do: the browser has already asked Firebase to send the SMS by
    // the time this matters. Returning `ok` moves the form to the code step.
    void phone;
    if (!process.env.FIREBASE_PROJECT_ID) {
      return {
        ok: false,
        reason: "UNAVAILABLE",
        retryAfterSeconds: 0,
        message: "Phone sign-in is not configured on this deployment.",
      };
    }
    return { ok: true, clientDriven: true };
  },

  async verify(phone, proof) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) {
      return {
        ok: false,
        reason: "UNAVAILABLE",
        message: "Phone sign-in is not configured on this deployment.",
      };
    }

    try {
      const { payload } = await jwtVerify(proof, FIREBASE_JWKS, {
        // Both of these matter. Without them, a token minted by *any* Firebase
        // project on earth would verify against Google's keys and sign someone
        // in — the signature is valid, it is simply not for us.
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
        // Firebase ID tokens live an hour; a sign-in should be seconds old.
        // Anything older is a replayed token rather than a fresh verification.
        maxTokenAge: "10 minutes",
      });

      // The token must have been earned by *proving a phone*. An email or
      // Google sign-in from the same Firebase project also produces a valid
      // token, and accepting one would let anybody who can sign in by any
      // means claim a phone number they never demonstrated control of.
      const provider = (payload.firebase as { sign_in_provider?: string } | undefined)
        ?.sign_in_provider;
      if (provider !== "phone") {
        return { ok: false, reason: "WRONG", message: "That sign-in did not verify a phone number." };
      }

      // And it must be the number we are about to become. Without this check a
      // user verifies their own phone, then submits someone else's in the form
      // field, and the server hands them that account.
      if (!sameNumber(payload.phone_number, phone)) {
        return { ok: false, reason: "WRONG", message: "That code was for a different number." };
      }

      return { ok: true };
    } catch (err) {
      // `jose` throws for an expired token, a bad signature, a wrong audience
      // and a malformed string alike. None of them are worth distinguishing to
      // the person at the keyboard: the answer is always "try again".
      const expired =
        err instanceof Error &&
        /exp|expired|"iat" claim timestamp/i.test(err.message);
      return {
        ok: false,
        reason: expired ? "EXPIRED" : "WRONG",
      };
    }
  },
};

export function getPhoneVerifier(): PhoneVerifier {
  return process.env.PHONE_VERIFY_DRIVER === "firebase" ? firebase : serverOtp;
}

/** Safe to expose: tells the sign-in form which flow to render. */
export function phoneVerificationIsClientDriven(): boolean {
  return getPhoneVerifier().clientDriven;
}
