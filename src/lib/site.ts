/**
 * Who we are, in the words a crawler and a chat app read.
 *
 * Everything here is duplicated into `<head>` on every page, into the sitemap,
 * into the JSON-LD block and onto the generated share cards. One module so
 * those four can never drift into describing four different products.
 */

import type { Metadata } from "next";
import { isDemoMode } from "@/lib/demo";

export const SITE_NAME = "Entry Now";

/** Used as the `og:title` fallback and on the default share card. */
export const SITE_TAGLINE = "India’s festivals, one ticket away";

/**
 * The `<meta name="description">`, sized for one — a search engine shows about
 * 155 characters and truncates the rest mid-word.
 */
export const SITE_DESCRIPTION =
  "Book Garba and Navratri nights, Diwali melas, Holi, concerts, comedy, " +
  "food fests and more. Digital tickets, one QR each, scanned at the gate.";

/**
 * The same claim, short enough to fit a share card whole.
 *
 * Separate from `SITE_DESCRIPTION` because the two have different budgets:
 * 1200×630 at 27px runs out around 90 characters, and a card that ends in
 * "one QR ea…" looks like the render failed rather than like it was edited.
 */
export const SITE_PITCH =
  "Garba, melas, concerts and comedy. One QR each, scanned at the gate.";

/**
 * This deployment's **stable** public origin, with no trailing slash.
 *
 * Deliberately not `appUrl()` from the payments adapter, and the difference
 * matters. That one prefers `VERCEL_URL` — the per-*deployment* hostname —
 * because a self-delivered webhook must come back to the build that created
 * the order. A canonical URL wants the opposite: naming
 * `entrynow-a1b2c3.vercel.app` in a `<link rel="canonical">` tells a search
 * engine the real address of every page is a host that stops existing at the
 * next push, and tells anyone who shares the link the same thing.
 *
 * So `VERCEL_PROJECT_PRODUCTION_URL` — the production alias, stable across
 * deploys — is preferred, and `VERCEL_URL` is only the last resort before
 * localhost so that preview builds still resolve to *something* absolute.
 */
export function siteUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
    "http://localhost:3000";
  return base.replace(/\/+$/, "");
}

/**
 * Absolute URL for a site-relative path.
 *
 * An input that is already absolute is returned untouched. Cover images are
 * the reason: most are repo paths like `/images/posters/x.jpg`, but nothing
 * stops an organizer pasting a full URL, and prefixing the origin to one would
 * put `https://entrynow.in/https://…` in the sitemap — a dead link in the one
 * file whose job is to be a list of live ones.
 */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Whether search engines should index this build.
 *
 * **`SEARCH_INDEXING` decides; demo mode is only the default.**
 *
 * These began as one switch, and that was wrong. Demo mode answers "may an
 * unverified login work here" — it is on in production because the payment
 * screen still needs its test cards. Indexing answers "should Google list
 * this". Tying the second to the first meant the launch could not be
 * announced without also opening the fixed OTP, so the site shipped with
 * `robots.txt: Disallow: /`, `noindex` on every page and an empty sitemap:
 * Google held the URL with "No information is available for this page", and
 * Search Console could not fetch anything.
 *
 * So the override is explicit and three-valued:
 *
 *   - `SEARCH_INDEXING=on`   — index, whatever demo mode says. Live launch.
 *   - `SEARCH_INDEXING=off`  — never index. Preview and staging deployments.
 *   - unset                  — follow demo mode, the old behaviour.
 *
 * The unset default stays cautious for a reason worth keeping in view: every
 * event, organizer, venue and price in a demo database is invented and
 * published under a real brand, and someone who finds "Rangilo Re Garba
 * Mahotsav 2026, from ₹499" in a search result may turn up at a ground that
 * was never booked. Removing a page from an index is far slower than adding
 * one. Turning this on is a statement that the catalogue is real enough to
 * stand behind.
 *
 * None of this affects link previews. WhatsApp, iMessage, Slack, Discord and
 * X read Open Graph tags and ignore `robots` entirely.
 */
export function isIndexable(): boolean {
  switch (process.env.SEARCH_INDEXING?.trim().toLowerCase()) {
    case "on":
    case "true":
    case "1":
      return true;
    case "off":
    case "false":
    case "0":
      return false;
    default:
      return !isDemoMode();
  }
}

/**
 * The canonical + Open Graph + Twitter block for one page.
 *
 * **Next does not deep-merge `openGraph` or `twitter`.** A route that returns
 * `twitter: { title, description }` from `generateMetadata` does not add two
 * fields to the root layout's object — it replaces the whole thing, and the
 * `card: "summary_large_image"` set once in the root goes with it. The visible
 * result is a 120px thumbnail instead of a 1200×630 card, on exactly the pages
 * anyone would actually share, and nothing warns you.
 *
 * Same trap for `siteName` and `locale`. So no page writes those objects by
 * hand; they call this, and the defaults are restated in one place.
 */
export function shareMetadata({
  title,
  description,
  path,
  type = "website",
  index = true,
}: {
  title: string;
  description: string;
  /** Site-relative. `metadataBase` makes it absolute. */
  path: string;
  type?: "website" | "article" | "profile";
  /** `false` emits `noindex, follow` — crawl through, but do not list. */
  index?: boolean;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    ...(index ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      type,
      siteName: SITE_NAME,
      locale: "en_IN",
      url: path,
      title,
      description,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}
