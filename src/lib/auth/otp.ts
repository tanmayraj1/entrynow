import "server-only";

import { createHash, randomInt } from "node:crypto";
import { getSmsAdapter } from "@/lib/adapters/sms";
import { getBusinessConfig } from "@/lib/config";
import { incrementWithExpiry, redis, ttl } from "@/lib/redis";

/**
 * Phone OTP (spec C1, limits from A3).
 *
 *   6 digits · 5 min validity · max 3 sends / 10 min / phone
 *   max 5 verify attempts, then a 30-minute lock
 *
 * The code is stored as a SHA-256 hash: a Redis dump should not hand anyone a
 * live login. Everything is keyed by phone, not by session, so opening a new
 * tab cannot reset an attacker's attempt counter.
 */

const key = {
  code: (phone: string) => `otp:code:${phone}`,
  sends: (phone: string) => `otp:sends:${phone}`,
  attempts: (phone: string) => `otp:attempts:${phone}`,
  lock: (phone: string) => `otp:lock:${phone}`,
};

const hash = (code: string) => createHash("sha256").update(code).digest("hex");

/** Accepts 9876543210, +91 98765 43210, 0091…; returns "919876543210". */
export function normalisePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2)))
    return digits;
  if (digits.length === 13 && digits.startsWith("091")) return digits.slice(1);
  return null;
}

export type SendResult =
  | { ok: true; expiresInSeconds: number; devCode?: string }
  | { ok: false; reason: "RATE_LIMITED" | "LOCKED"; retryAfterSeconds: number };

export async function sendOtp(phone: string): Promise<SendResult> {
  const cfg = await getBusinessConfig();

  const lockTtl = await ttl(key.lock(phone));
  if (lockTtl > 0) {
    return { ok: false, reason: "LOCKED", retryAfterSeconds: lockTtl };
  }

  const sends = await incrementWithExpiry(key.sends(phone), 10 * 60);
  if (sends > cfg.otpMaxSendsPer10Min) {
    return {
      ok: false,
      reason: "RATE_LIMITED",
      retryAfterSeconds: await ttl(key.sends(phone)),
    };
  }

  const sms = getSmsAdapter();
  const code =
    sms.fixedCode ??
    String(randomInt(0, 10 ** cfg.otpLength)).padStart(cfg.otpLength, "0");

  const validity = cfg.otpValidityMinutes * 60;
  await redis.set(key.code(phone), hash(code), "EX", validity);
  // A fresh code deserves a fresh attempt budget.
  await redis.del(key.attempts(phone));

  await sms.send(
    phone,
    `${code} is your Entry Now verification code. Valid for ${cfg.otpValidityMinutes} minutes.`,
  );

  return {
    ok: true,
    expiresInSeconds: validity,
    // Surfaced only by the sandbox driver, so local sign-in needs no SMS.
    devCode: sms.fixedCode ? code : undefined,
  };
}

export type VerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason: "EXPIRED" | "WRONG" | "LOCKED";
      attemptsLeft?: number;
      retryAfterSeconds?: number;
    };

export async function verifyOtp(
  phone: string,
  code: string,
): Promise<VerifyResult> {
  const cfg = await getBusinessConfig();

  const lockTtl = await ttl(key.lock(phone));
  if (lockTtl > 0) {
    return { ok: false, reason: "LOCKED", retryAfterSeconds: lockTtl };
  }

  const stored = await redis.get(key.code(phone));
  if (!stored) return { ok: false, reason: "EXPIRED" };

  if (stored !== hash(code)) {
    const attempts = await incrementWithExpiry(
      key.attempts(phone),
      cfg.otpValidityMinutes * 60,
    );
    if (attempts >= cfg.otpMaxVerifyAttempts) {
      // Burn the code as well as locking, so waiting out the lock does not
      // resume guessing against the same secret.
      await redis.del(key.code(phone));
      await redis.set(key.lock(phone), "1", "EX", cfg.otpLockMinutes * 60);
      return {
        ok: false,
        reason: "LOCKED",
        retryAfterSeconds: cfg.otpLockMinutes * 60,
      };
    }
    return {
      ok: false,
      reason: "WRONG",
      attemptsLeft: cfg.otpMaxVerifyAttempts - attempts,
    };
  }

  // Single use.
  await redis.del(key.code(phone), key.attempts(phone), key.sends(phone));
  return { ok: true };
}
