import path from "node:path";
import type { NextConfig } from "next";

/**
 * Security headers, applied to every response.
 *
 * Deliberately NOT including a Content-Security-Policy yet: this app renders
 * one `dangerouslySetInnerHTML` (the ticket QR SVG) and composes gradients
 * from `var(--gradient-${slug})` at runtime, so a CSP tight enough to be worth
 * having needs a nonce plumbed through the root layout. A permissive
 * `unsafe-inline` CSP would look like protection while providing none — it
 * lands in Iteration 9, with the nonce.
 */
const securityHeaders = [
  // The QR on a ticket and the map at a venue get screenshotted and shared;
  // neither is a reason to allow framing. Clickjacking a "Cancel booking"
  // button is the concrete risk.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // `self` still permits the scanner's own getUserMedia call and the "near me"
  // geolocation prompt; everything else is off.
  {
    key: "Permissions-Policy",
    value: "geolocation=(self), camera=(self), microphone=(), payment=()",
  },
  // Only ever sent over HTTPS, so it is inert locally.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // There is a stray package-lock.json in the home directory above this
  // project; without an explicit root Turbopack walks up and adopts it.
  turbopack: { root: path.resolve(import.meta.dirname) },

  images: {
    // Real festival photography replaces the design's <image-slot> placeholders.
    formats: ["image/avif", "image/webp"],
  },

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // The scanner's offline manifest is a list of every valid token for
        // the night. No proxy, CDN or browser may keep a copy.
        source: "/api/scan/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, private" },
          ...securityHeaders,
        ],
      },
    ];
  },
};

export default nextConfig;
