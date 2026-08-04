import { NextResponse } from "next/server";

/**
 * The PWA manifest for the gate scanner.
 *
 * Served from a route rather than a static file so `start_url` stays scoped to
 * `/scan` — installed from the marketplace, the icon would otherwise open the
 * shop rather than the gate.
 *
 * `display: fullscreen`, not `standalone`: at a gate the browser chrome is
 * dead pixels, and an accidental swipe on the URL bar mid-queue navigates away
 * from a viewfinder someone is holding up.
 */
export function GET() {
  return NextResponse.json(
    {
      name: "Entry Now — Gate Scanner",
      short_name: "EN Gate",
      description:
        "Scan Entry Now tickets at the gate. Works offline once the night's manifest is pulled.",
      start_url: "/scan",
      scope: "/scan",
      display: "fullscreen",
      orientation: "portrait",
      background_color: "#0a1226",
      theme_color: "#0a1226",
      icons: [
        {
          src: "/scan/icon.svg",
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any maskable",
        },
      ],
      categories: ["business", "utilities"],
    },
    {
      headers: {
        "content-type": "application/manifest+json",
        "cache-control": "public, max-age=3600",
      },
    },
  );
}
