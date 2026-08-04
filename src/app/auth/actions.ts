"use server";

import { headers } from "next/headers";
import {
  createSession,
  destroySession,
  findOrCreateUserByPhone,
} from "@/lib/auth/session";
import { normalisePhone, sendOtp, verifyOtp } from "@/lib/auth/otp";
import {
  hashPassword,
  normaliseEmail,
  validatePassword,
  verifyPassword,
} from "@/lib/auth/password";
import { isDemoMode } from "@/lib/demo";
import { db } from "@/lib/db";

/**
 * Auth server actions.
 *
 * Every failure is returned as a typed result rather than thrown, so the form
 * can render the specific message the spec asks for — remaining attempts, the
 * lock countdown, the resend window (spec C1.4).
 */

export interface ActionState {
  error?: string;
  notice?: string;
  /** Sandbox only: lets local sign-in work without an SMS provider. */
  devCode?: string;
  phone?: string;
  step?: "phone" | "otp";
}

export async function requestOtp(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = String(formData.get("phone") ?? "");
  const phone = normalisePhone(raw);

  if (!phone) {
    return {
      step: "phone",
      error: "Enter a 10-digit Indian mobile number.",
    };
  }

  const result = await sendOtp(phone);

  if (!result.ok) {
    const mins = Math.ceil(result.retryAfterSeconds / 60);
    return {
      step: "phone",
      phone,
      error:
        result.reason === "LOCKED"
          ? `Too many wrong codes. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`
          : `You've asked for too many codes. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
    };
  }

  return {
    step: "otp",
    phone,
    notice: `Code sent to +${phone}.`,
    devCode: result.devCode,
  };
}

export async function confirmOtp(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const phone = String(formData.get("phone") ?? "");
  const code = String(formData.get("code") ?? "").trim();

  if (!phone) return { step: "phone", error: "Start again — the number was lost." };
  if (!/^\d{4,8}$/.test(code)) {
    return { step: "otp", phone, error: "Enter the code from your SMS." };
  }

  const result = await verifyOtp(phone, code);

  if (!result.ok) {
    if (result.reason === "LOCKED") {
      const mins = Math.ceil((result.retryAfterSeconds ?? 0) / 60);
      return {
        step: "phone",
        phone,
        error: `Too many wrong codes. This number is locked for ${mins} minute${mins === 1 ? "" : "s"}.`,
      };
    }
    if (result.reason === "EXPIRED") {
      return {
        step: "phone",
        phone,
        error: "That code has expired. Ask for a new one.",
      };
    }
    return {
      step: "otp",
      phone,
      error: `That code isn't right. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? "" : "s"} left.`,
    };
  }

  const user = await findOrCreateUserByPhone(phone);
  const h = await headers();
  await createSession(user.id, {
    userAgent: h.get("user-agent") ?? undefined,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim(),
  });

  // The caller redirects; returning success keeps this action pure enough to
  // unit test without a router.
  return { step: "otp", phone, notice: "signed-in" };
}

export async function signOut() {
  await destroySession();
}

// ---------------------------------------------------------------------------
// Email + password (demo)
// ---------------------------------------------------------------------------

/**
 * Email sign-in and sign-up, with **no address verification**.
 *
 * Gated on `DEMO_MODE` and refused otherwise. Without verification, "sign up"
 * means "claim any address you can type", so this must never be reachable on a
 * public build — see `src/lib/demo.ts` and D-025.
 *
 * Sign-in and sign-up share one action because splitting them leaks account
 * existence: two endpoints with different failure vocabularies let anyone
 * enumerate which addresses are registered.
 */
export async function emailAuth(
  _prev: EmailActionState,
  formData: FormData,
): Promise<EmailActionState> {
  if (!isDemoMode()) {
    return {
      error:
        "Email sign-in is only available in the demo build. Use your phone number.",
    };
  }

  const email = normaliseEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const intent = String(formData.get("intent") ?? "signin");
  const name = String(formData.get("name") ?? "").trim();

  if (!email) return { error: "Enter a valid email address.", intent };

  const existing = await db.user.findUnique({ where: { email } });

  if (intent === "signup") {
    const invalid = validatePassword(password);
    if (invalid) return { error: invalid, intent: "signup", email };
    if (existing?.passwordHash) {
      return {
        error: "That email already has an account. Sign in instead.",
        intent: "signin",
        email,
      };
    }

    // An existing phone-only account with this address gets a password added
    // rather than a second account — otherwise the same person ends up with
    // two identities and their tickets split across them.
    const user = existing
      ? await db.user.update({
          where: { id: existing.id },
          data: {
            passwordHash: await hashPassword(password),
            name: existing.name ?? (name || null),
          },
        })
      : await db.user.create({
          data: {
            email,
            name: name || null,
            passwordHash: await hashPassword(password),
          },
        });

    await startSession(user.id);
    return { notice: "signed-in" };
  }

  // Sign in. The password is verified even when no user exists, so the
  // response time does not reveal whether the address is registered.
  const ok = await verifyPassword(password, existing?.passwordHash ?? null);
  if (!existing || !ok) {
    return { error: "That email and password do not match.", intent: "signin", email };
  }

  await startSession(existing.id);
  return { notice: "signed-in" };
}

export interface EmailActionState {
  error?: string;
  notice?: string;
  intent?: string;
  email?: string;
}

async function startSession(userId: string) {
  const h = await headers();
  await createSession(userId, {
    userAgent: h.get("user-agent") ?? undefined,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim(),
  });
}
