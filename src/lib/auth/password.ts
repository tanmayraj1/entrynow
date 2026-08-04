import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

/**
 * Password hashing — scrypt from Node's own crypto.
 *
 * scrypt rather than bcrypt/argon2 because it is memory-hard, in the standard
 * library, and needs no native build step in a container. Parameters are the
 * Node defaults (N=16384, r=8, p=1) at a 64-byte key, which costs roughly
 * 100ms per verify — slow enough to make offline cracking expensive, fast
 * enough for a login.
 *
 * Format is `salt:key`, both hex, so the salt travels with the hash and a
 * future parameter change can be detected by length rather than needing a
 * schema column.
 *
 * Deliberately NOT marked `server-only`, unlike the rest of `lib/auth`. This
 * module is pure `node:crypto` with no database, secret or request access, and
 * `node:crypto` cannot be bundled into a client component anyway — so the
 * marker adds no protection while making the module unimportable from
 * `prisma/seed.ts`, which legitimately needs to hash the demo password with
 * the exact function the login verifies against.
 */

const KEY_LENGTH = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await scryptAsync(plain, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(
  plain: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false;
  const [salt, keyHex] = stored.split(":");
  if (!salt || !keyHex) return false;

  const expected = Buffer.from(keyHex, "hex");
  const actual = (await scryptAsync(plain, salt, expected.length)) as Buffer;
  // Constant-time: a fast-fail comparison leaks how much of the hash matched.
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * What we require of a password.
 *
 * Length only. Composition rules ("one uppercase, one symbol") measurably push
 * people towards `Password1!` and are no longer recommended by NIST; length is
 * the property that actually costs an attacker.
 */
export function validatePassword(plain: string): string | null {
  if (plain.length < 8) return "Use at least 8 characters.";
  if (plain.length > 200) return "That password is too long.";
  return null;
}

export function normaliseEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  // Deliberately permissive: the only authority on whether an address works is
  // sending to it, and this is a demo path with no verification (D-025).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  if (email.length > 200) return null;
  return email;
}
