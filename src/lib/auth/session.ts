import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import type { AdminPermission, OrganizerStatus } from "@/generated/prisma";

/**
 * Sessions — httpOnly JWT, 30-day rolling (spec C1.3).
 *
 * The JWT carries only a session id and the user id. The row in `sessions`
 * stores a SHA-256 of that id, so the token is verifiable *and* revocable: a
 * stolen cookie stops working the moment the row is revoked, which a
 * stateless-JWT-only design cannot do.
 */

const COOKIE = "se_session";
const MAX_AGE_DAYS = 30;

function secret(): Uint8Array {
  const s = process.env.SESSION_JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_JWT_SECRET must be set and at least 32 characters");
  }
  return new TextEncoder().encode(s);
}

const hashToken = (id: string) =>
  createHash("sha256").update(id).digest("hex");

export interface SessionUser {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  walletBalancePaise: number;
  /**
   * True for ANY OrganizerProfile row, including SIGNUP, KYC_REJECTED and
   * SUSPENDED. It answers "has an organizer account", never "may act as a
   * verified organizer" — use `organizer.status`, or better, `requireOrganizer`
   * in `src/lib/auth/rbac.ts`.
   */
  isOrganizer: boolean;
  /** Likewise: any AdminRole row. Says nothing about which permissions. */
  isAdmin: boolean;
  /** Present iff `isOrganizer`. Carries the status the portal must gate on. */
  organizer: { id: string; status: OrganizerStatus } | null;
  /**
   * The admin's granted permissions. Empty for non-admins.
   *
   * Loaded here rather than re-queried per route because every admin page and
   * every admin server action has to check it — a per-call query would be a
   * round trip on the hot path of the whole portal.
   */
  adminPermissions: AdminPermission[];
}

/** Issue a session and set the cookie. */
export async function createSession(
  userId: string,
  meta?: {
    userAgent?: string;
    ip?: string;
    /**
     * Lifetime in days. Guest checkout passes a short one: that session was
     * issued on an unverified claim to a phone number, so it should expire
     * well before a session backed by a real OTP (D-036).
     */
    days?: number;
  },
) {
  const sessionId = randomUUID();
  const days = meta?.days ?? MAX_AGE_DAYS;
  const expiresAt = new Date(Date.now() + days * 86_400_000);

  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(sessionId),
      expiresAt,
      userAgent: meta?.userAgent?.slice(0, 255),
      ip: meta?.ip,
    },
  });

  const token = await new SignJWT({ sid: sessionId, uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_DAYS * 86_400,
  });
}

/**
 * The signed-in user, or null. Safe to call from any server component; it
 * never throws, because a malformed cookie must not 500 a page.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  let sid: string;
  try {
    const { payload } = await jwtVerify(token, secret());
    sid = payload.sid as string;
    if (!sid) return null;
  } catch {
    return null; // expired, tampered, or signed with a rotated secret
  }

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(sid) },
    include: {
      user: {
        include: {
          // `status` and `permissions` are selected, not just ids: without them
          // `isOrganizer` is true for a SUSPENDED profile and every admin looks
          // identical to every other admin.
          organizerProfile: { select: { id: true, status: true } },
          adminRole: { select: { id: true, permissions: true } },
        },
      },
    },
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt < new Date() ||
    session.user.deletedAt
  ) {
    return null;
  }

  const u = session.user;
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    walletBalancePaise: u.walletBalancePaise,
    isOrganizer: Boolean(u.organizerProfile),
    isAdmin: Boolean(u.adminRole),
    organizer: u.organizerProfile
      ? { id: u.organizerProfile.id, status: u.organizerProfile.status }
      : null,
    adminPermissions: u.adminRole?.permissions ?? [],
  };
}

/** Revoke the current session and clear the cookie. */
export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret());
      await db.session.updateMany({
        where: { tokenHash: hashToken(payload.sid as string) },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Already invalid — clearing the cookie is still the right outcome.
    }
  }

  jar.delete(COOKIE);
}

/** Find-or-create by verified phone (spec C1.3). */
export async function findOrCreateUserByPhone(phone: string) {
  const existing = await db.user.findUnique({ where: { phone } });
  if (existing) {
    if (!existing.phoneVerifiedAt) {
      // First real proof that someone holds this number. The row may have been
      // created by a guest checkout, where all anyone proved was that they
      // could type it — so every session minted under that weaker claim is
      // revoked here, before the new one is issued (D-036).
      const { claimUserSessions } = await import("./guest");
      await claimUserSessions(existing.id);
      return db.user.update({
        where: { id: existing.id },
        data: { phoneVerifiedAt: new Date() },
      });
    }
    return existing;
  }
  return db.user.create({
    data: { phone, phoneVerifiedAt: new Date() },
  });
}
