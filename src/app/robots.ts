import type { MetadataRoute } from "next";
import { absoluteUrl, isIndexable } from "@/lib/site";

/**
 * What a crawler may read.
 *
 * While `DEMO_MODE` is on this is a flat refusal, and that is the important
 * half — see `isIndexable`. Every listing in this build is invented, published
 * under a real brand, and a search result is a much longer-lived thing than a
 * demo. Link previews are unaffected: chat apps read Open Graph tags and never
 * look at this file.
 *
 * The disallow list below is the real one, and it is deliberately not "the
 * pages that need a login". A crawler cannot sign in, so those are already
 * invisible; what it *can* do is burn the crawl budget on them and index the
 * sign-in walls it gets back. `/api` and `/booking` are here because a
 * half-finished checkout URL in a search result is worse than useless, and
 * `/scan` because a gate scanner is not a web page anyone should arrive at
 * from Google.
 */
/**
 * Rendered per request, not baked at build.
 *
 * By default Next prerenders this file, which freezes whatever `DEMO_MODE` was
 * at build time into a static `robots.txt`. Being wrong here is asymmetric and
 * expensive in both directions — a live site silently delisted, or a demo
 * quietly indexed — and the answer costs one env lookup, so it is worth asking
 * every time rather than once.
 */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/account/",
          "/auth",
          "/booking/",
          "/organizer/login",
          "/organizer/dashboard",
          "/organizer/events",
          "/organizer/financials",
          "/organizer/promos",
          "/organizer/announcements",
          "/organizer/settings",
          "/scan",
          "/tickets/",
          "/styleguide",
        ],
      },
    ],
    // No `host:` — it is a Yandex-only directive that Google ignores, it wants
    // a bare hostname rather than a URL, and Next renders whatever it is given
    // verbatim. An `Host: http://…/` line is just a malformed row in a file
    // whose whole job is to be parsed strictly.
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
