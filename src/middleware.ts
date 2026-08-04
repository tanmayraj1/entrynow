import { NextResponse, type NextRequest } from "next/server";

/**
 * The access-control gate for a demo deployment.
 *
 * **Scoped to `/admin` only**, and the reason is a trade rather than an
 * oversight. `DEMO_MODE` accepts a fixed OTP, so anyone who finds the URL can
 * sign in as any seeded account. For an attendee or an organizer that is
 * harmless — the data is seeded, and the worst case is someone browsing fake
 * bookings. For the platform admin it is not: that role can cancel an event
 * (terminal, irreversible, triggers bulk refunds), suspend an organizer and
 * rewrite the commission rates.
 *
 * The realistic failure mode was never an attacker. It was a client opening
 * the link mid-review to find half the events cancelled by a passer-by. So the
 * gate covers exactly the surface that can cause that, and the whole
 * marketplace, booking flow, organizer portal and gate scanner stay open —
 * gating those taxed the entire demo to protect a fraction of it.
 *
 * `src/lib/demo.ts` refuses to boot a production build with
 * `DEMO_MODE_ALLOW_PRODUCTION=true` unless `SITE_PASSWORD` is set, so this
 * file is what makes that acknowledgement true. Vercel's free "Standard
 * Protection" does not cover the production `*.vercel.app` alias (it covers
 * previews and non-production custom domains) and Password Protection is a
 * paid add-on, so the gate lives in the app, where it costs nothing and is
 * portable to any host.
 *
 * HTTP Basic rather than a login page: the browser owns the credential prompt
 * and the re-send on every request, so there is no session, no cookie and no
 * new surface to get wrong — and nothing to confuse with the app's *real*
 * sign-in, which is a different thing entirely.
 *
 * Unset `SITE_PASSWORD` and the gate disappears, which is what local
 * development and a genuinely public launch both want.
 */

/**
 * ASCII only, and no double quotes.
 *
 * A header value is a ByteString, so any code point above 255 throws when the
 * response is constructed — which surfaces as a 500 rather than the 401 that
 * makes the browser show its password prompt. The house em dash is U+2014 and
 * did exactly that.
 */
const REALM = "Entry Now - private review build";

export function middleware(request: NextRequest) {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      // "user:pass" — the username is ignored. One shared password is the
      // whole model; per-reviewer accounts would be a real auth system, and
      // the app already has one of those.
      const decoded = atob(header.slice(6));
      const password = decoded.slice(decoded.indexOf(":") + 1);
      if (constantTimeEqual(password, expected)) return NextResponse.next();
    } catch {
      // Malformed base64 falls through to the challenge below.
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      // A gate response must never be cached — a CDN holding a 401 would lock
      // out someone who has already authenticated.
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Length-independent comparison.
 *
 * `node:crypto`'s `timingSafeEqual` is not available in the Edge runtime this
 * middleware runs in, so this is the hand-rolled equivalent: always walk the
 * full length of the expected value, and fold any length difference into the
 * result rather than returning early on it.
 */
function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export const config = {
  /**
   * The admin portal and nothing else.
   *
   * `/admin` catches the page itself; `/admin/:path*` catches every route
   * under it. The payment webhook needs no exclusion at this scope — it never
   * matched — which is just as well, because a gateway cannot present Basic
   * credentials and gating it would break every capture.
   *
   * Note this protects the admin *pages*. The admin server actions are
   * protected independently by `authorizeAdmin(permission)` on every single
   * one of them, and would be even if this file did not exist — a middleware
   * matcher is a convenience here, never the security boundary.
   */
  matcher: ["/admin", "/admin/:path*"],
};
