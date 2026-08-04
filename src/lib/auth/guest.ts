import "server-only";

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { createSession } from "./session";

/**
 * Checkout without an account (D-036).
 *
 * A booking still needs a `User` row — `Booking.userId` is required, and
 * tickets, refunds, the wallet and the gate all hang off it. So a guest
 * checkout does not bypass the user table; it fills in the three fields that
 * actually matter (name, phone, email), creates an **unclaimed** row, and signs
 * the buyer into it so the rest of the app works exactly as it does for anyone
 * else. Nothing downstream needs a guest branch.
 *
 * ## The account-takeover trap, and the two things that close it
 *
 * The obvious version of this feature is a hole: type a stranger's mobile
 * number, get signed in as them, read their tickets. Phone is `@unique`, so
 * "find or create by phone" would hand over whatever account already exists.
 *
 * 1. **A claimed row is never handed out.** A row is *claimed* once someone has
 *    actually proven they hold it — `phoneVerifiedAt`, a `passwordHash`, or an
 *    organizer/admin role. Guest checkout refuses those outright and sends the
 *    buyer to OTP sign-in. Only a row that no one could sign into by any other
 *    means is reused, and reusing it is what makes a returning guest's tickets
 *    appear together rather than scattering across duplicates.
 *
 * 2. **Claiming a row revokes every session on it.** Otherwise the attack runs
 *    the other way round: guest-book against a stranger's number today, keep
 *    the cookie, and inherit the account the day they verify it for real. See
 *    `claimUserSessions`, called from the OTP path.
 *
 * A guest session is also short — `GUEST_SESSION_DAYS` — because it was issued
 * on an unverified claim. It is enough to collect the tickets and come back for
 * the event; it is not a standing login.
 */

const GUEST_SESSION_DAYS = 7;

export type GuestCheckoutResult =
  | { ok: true; userId: string }
  | { ok: false; field?: "name" | "phone" | "email"; error: string };

/** 10-digit Indian mobile, stored E.164 without the plus (spec C1.1). */
function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  const local = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(local) ? `91${local}` : null;
}

function validEmail(raw: string): boolean {
  // Deliberately loose. The address is a delivery target, and the only honest
  // test of one is sending to it; a clever regex mostly rejects valid addresses.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw);
}

/**
 * Everything except the cookie.
 *
 * Split out from `startGuestCheckout` so the rules above can be tested against
 * a real database without a request scope — `createSession` needs `cookies()`,
 * and a test that has to fake a request scope tends to end up asserting the
 * fake. This half holds all the decisions worth testing.
 */
export async function resolveGuestUser(input: {
  name: string;
  phone: string;
  email: string;
}): Promise<GuestCheckoutResult> {
  const name = input.name.trim();
  if (name.length < 2) {
    return { ok: false, field: "name", error: "Enter the name for the ticket." };
  }

  const phone = normalisePhone(input.phone);
  if (!phone) {
    return { ok: false, field: "phone", error: "Enter a valid 10-digit mobile number." };
  }

  const email = input.email.trim().toLowerCase();
  if (!validEmail(email)) {
    return { ok: false, field: "email", error: "Enter an email address we can send the ticket to." };
  }

  const existing = await db.user.findUnique({
    where: { phone },
    select: {
      id: true,
      phoneVerifiedAt: true,
      passwordHash: true,
      organizerProfile: { select: { id: true } },
      adminRole: { select: { id: true } },
    },
  });

  const claimed =
    existing &&
    (existing.phoneVerifiedAt !== null ||
      existing.passwordHash !== null ||
      existing.organizerProfile !== null ||
      existing.adminRole !== null);

  if (claimed) {
    return {
      ok: false,
      field: "phone",
      error:
        "This number already has an Entry Now account. Sign in with the code " +
        "we text you — your tickets are all in one place that way.",
    };
  }

  // An email that belongs to somebody else's account is the same problem
  // wearing a different hat, and `email` is unique too.
  const emailOwner = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (emailOwner && emailOwner.id !== existing?.id) {
    return {
      ok: false,
      field: "email",
      error:
        "This email is already on an Entry Now account. Sign in instead, or " +
        "use a different address.",
    };
  }

  const user = existing
    ? await db.user.update({
        where: { id: existing.id },
        // Never touch `phoneVerifiedAt` — only a real OTP sets that.
        data: { name, email },
      })
    : await db.user.create({ data: { phone, email, name } });

  return { ok: true, userId: user.id };
}

export async function startGuestCheckout(input: {
  name: string;
  phone: string;
  email: string;
}): Promise<GuestCheckoutResult> {
  const resolved = await resolveGuestUser(input);
  if (!resolved.ok) return resolved;

  const h = await headers();
  await createSession(resolved.userId, {
    userAgent: h.get("user-agent") ?? undefined,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim(),
    days: GUEST_SESSION_DAYS,
  });

  return resolved;
}

/**
 * Revoke every session on a user row at the moment it is first claimed.
 *
 * The row may have been created by a guest checkout that only ever proved
 * someone could type the number. When the real holder verifies it, any cookie
 * minted under the old, unproven claim has to die — otherwise guest checkout
 * becomes a way to plant a session on a number and wait.
 *
 * Called from the OTP path only, and only when the row was previously
 * unverified, so an ordinary repeat sign-in does not log people out of their
 * other devices.
 */
export async function claimUserSessions(userId: string): Promise<void> {
  await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
