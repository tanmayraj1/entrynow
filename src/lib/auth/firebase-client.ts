/**
 * The browser half of the Firebase phone flow.
 *
 * NOT `server-only` — this is the one piece that must run in the browser,
 * because Firebase's phone verification is client-driven by design: the SDK
 * solves a reCAPTCHA, asks Google to send the SMS, and exchanges the code for
 * an ID token. The server never sees the code; it checks the token
 * (`phone-verification.ts`).
 *
 * Everything here is lazily imported. `firebase/auth` is a large module and
 * only the sign-in screens need it, so it must not land in the shared bundle
 * that every marketplace page downloads.
 *
 * The config values are `NEXT_PUBLIC_` and that is correct, not an oversight:
 * a Firebase web API key identifies a project, it does not authorise anything.
 * What protects the project is the reCAPTCHA below and the authorised-domains
 * list in the Firebase console.
 */

import type { ConfirmationResult } from "firebase/auth";

export interface FirebaseConfigured {
  apiKey: string;
  authDomain: string;
  projectId: string;
}

export function firebaseConfig(): FirebaseConfigured | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!apiKey || !authDomain || !projectId) return null;
  return { apiKey, authDomain, projectId };
}

async function getAuth() {
  const cfg = firebaseConfig();
  if (!cfg) throw new Error("Firebase phone sign-in is not configured.");

  const [{ getApps, initializeApp }, authMod] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
  ]);

  // `getApps()` first: React strict mode mounts effects twice in development
  // and `initializeApp` throws on a duplicate name.
  const app = getApps()[0] ?? initializeApp(cfg);
  const auth = authMod.getAuth(app);
  // Send the OTP SMS in the user's language where Firebase supports it.
  auth.useDeviceLanguage();
  return { auth, authMod };
}

/**
 * A single invisible reCAPTCHA, reused across attempts.
 *
 * Firebase requires an `AppVerifier` for every send. Constructing a new one
 * per attempt leaves orphaned widgets that make the second "resend" fail with
 * an opaque internal error, so it is created once and cleared explicitly.
 */
let verifier: import("firebase/auth").RecaptchaVerifier | null = null;

export async function resetRecaptcha() {
  try {
    verifier?.clear();
  } catch {
    // Already torn down by a navigation. Nothing to do.
  }
  verifier = null;
}

/**
 * Ask Firebase to text a code. Returns the confirmation handle the code is
 * later exchanged against.
 *
 * `phone` must be E.164 — Firebase rejects anything else, and the server
 * stores the same number without the plus.
 */
export async function sendFirebaseCode(
  phoneE164: string,
  containerId: string,
): Promise<ConfirmationResult> {
  const { auth, authMod } = await getAuth();
  if (!verifier) {
    verifier = new authMod.RecaptchaVerifier(auth, containerId, {
      size: "invisible",
    });
  }
  return authMod.signInWithPhoneNumber(auth, phoneE164, verifier);
}

/**
 * Exchange the typed code for an ID token.
 *
 * The token — not the code — is what goes to the server, and it is the only
 * thing the server will accept as proof.
 */
export async function confirmFirebaseCode(
  confirmation: ConfirmationResult,
  code: string,
): Promise<string> {
  const credential = await confirmation.confirm(code);
  return credential.user.getIdToken();
}

/** Firebase error codes worth saying something specific about. */
export function firebaseErrorMessage(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  switch (code) {
    case "auth/invalid-phone-number":
      return "That number isn't valid. Check it and try again.";
    case "auth/too-many-requests":
      return "Too many attempts from this device. Try again in a little while.";
    case "auth/invalid-verification-code":
      return "That code isn't right. Try again.";
    case "auth/code-expired":
      return "That code has expired. Ask for a new one.";
    case "auth/quota-exceeded":
      return "We can't send codes right now. Please try again shortly.";
    case "auth/captcha-check-failed":
      return "The security check failed. Reload the page and try again.";
    default:
      return "We couldn't send the code. Please try again.";
  }
}
