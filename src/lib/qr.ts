import "server-only";

import { SignJWT, jwtVerify } from "jose";

/**
 * The QR payload.
 *
 * Until now the QR carried a bare `qrTokenId`, which made the documented
 * promise — "rotating `QR_JWT_SECRET` invalidates every ticket" — simply
 * false: nothing read the secret, and a raw token stays valid forever. Signing
 * the payload makes that promise true and buys three more things:
 *
 *   - **A forged QR fails signature verification** before it touches the
 *     database, so an attacker cannot brute-force `qrTokenId`s at the gate.
 *   - **The ticket's event is inside the signature**, so a token from another
 *     event is rejected without a lookup.
 *   - **`exp` bounds the damage** from a photographed screen. It is set well
 *     past the event, not tight, because a wrong clock at a ground must never
 *     turn a paying attendee away — the atomic single-use claim, not expiry,
 *     is what stops a shared screenshot.
 *
 * The QR stays short: a compact JWS over three claims is ~180 characters,
 * which scans reliably at gate distance in poor light. A longer payload needs
 * a denser symbol and starts failing on cheap cameras.
 */

const ISSUER = "entrynow";
const AUDIENCE = "gate";

function secret(): Uint8Array {
  const raw = process.env.QR_JWT_SECRET;
  if (!raw || raw.length < 24) {
    throw new Error(
      "QR_JWT_SECRET is missing or too short. Tickets cannot be signed — " +
        "set it to at least 24 characters.",
    );
  }
  return new TextEncoder().encode(raw);
}

export interface QrClaims {
  /** `Ticket.qrTokenId`. Rotated on transfer, which kills the old QR. */
  jti: string;
  /** Event id — lets the gate reject a foreign ticket without a query. */
  ev: string;
}

/**
 * Sign a ticket's QR.
 *
 * `expiresAt` should be the event's last session end plus a wide margin. Pass
 * it explicitly rather than defaulting to a fixed window: a nine-night Garba
 * runs far longer than a one-night comedy set, and a single global TTL would
 * either expire the Garba passes or leave the comedy tickets live for weeks.
 */
export async function signQr(
  claims: QrClaims,
  expiresAt: Date,
): Promise<string> {
  return new SignJWT({ ev: claims.ev })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(claims.jti)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret());
}

export type QrVerifyResult =
  | { ok: true; claims: QrClaims }
  | { ok: false; reason: "MALFORMED" | "EXPIRED" | "BAD_SIGNATURE" };

/**
 * Verify a scanned QR.
 *
 * Distinguishes expiry from a bad signature because the gate says different
 * things about them: an expired ticket is a real ticket for the wrong night,
 * and a bad signature is a forgery. Both refuse entry; only one gets an
 * apology.
 */
export async function verifyQr(token: string): Promise<QrVerifyResult> {
  if (!token || token.split(".").length !== 3) {
    return { ok: false, reason: "MALFORMED" };
  }
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (!payload.jti || typeof payload.ev !== "string") {
      return { ok: false, reason: "MALFORMED" };
    }
    return { ok: true, claims: { jti: payload.jti, ev: payload.ev } };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ERR_JWT_EXPIRED") return { ok: false, reason: "EXPIRED" };
    return { ok: false, reason: "BAD_SIGNATURE" };
  }
}

/**
 * Accept either form.
 *
 * Tickets issued before signing existed carry a bare `qrTokenId`, and they are
 * in people's wallets. Refusing them would strand real attendees at a gate, so
 * an unsigned token is accepted and reported as `legacy` — the caller logs
 * that, and the atomic single-use claim still protects the turnstile. Remove
 * this branch once every pre-signing event has completed.
 */
export async function parseScannedToken(
  raw: string,
): Promise<
  | { kind: "signed"; qrTokenId: string; eventId: string }
  | { kind: "legacy"; qrTokenId: string }
  | { kind: "invalid"; reason: "MALFORMED" | "EXPIRED" | "BAD_SIGNATURE" }
> {
  const token = raw.trim();
  if (!token) return { kind: "invalid", reason: "MALFORMED" };

  if (token.split(".").length === 3) {
    const result = await verifyQr(token);
    return result.ok
      ? { kind: "signed", qrTokenId: result.claims.jti, eventId: result.claims.ev }
      : { kind: "invalid", reason: result.reason };
  }

  // A cuid is [a-z0-9] and comfortably over 20 chars; anything else is noise
  // from a barcode that is not one of ours.
  if (/^[a-z0-9]{20,40}$/i.test(token)) {
    return { kind: "legacy", qrTokenId: token };
  }
  return { kind: "invalid", reason: "MALFORMED" };
}
