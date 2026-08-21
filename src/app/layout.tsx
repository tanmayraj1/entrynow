import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import {
  isIndexable,
  siteUrl,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
} from "@/lib/site";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

/**
 * Everything a crawler and a chat app read, set once and inherited.
 *
 * `metadataBase` is the load-bearing line. Without it Next emits `og:image`
 * as a *relative* path, and every scraper — WhatsApp, Slack, X, iMessage —
 * drops a relative image on the floor, which is a share card that renders
 * everywhere in development and nowhere in production.
 *
 * Per-route `generateMetadata` overrides title, description and canonical;
 * the Open Graph and Twitter blocks below are the defaults everything else
 * merges into. The card image itself is file-based — `app/opengraph-image.tsx`
 * and the two nested overrides — so it is never named here.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_IN",
    url: "/",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    // Without this the card is a 120px thumbnail beside the text. The image is
    // designed at 1200×630 and is the whole point.
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  // Indian phone numbers all over the marketplace copy; Safari turning each
  // one into a blue tel: link fights the type scale for no benefit.
  formatDetection: { telephone: false, address: false },
  robots: isIndexable()
    ? { index: true, follow: true }
    : // See `isIndexable`. Demo data must not enter a search index, and the
      // meta tag is the belt to robots.txt's braces — a crawler that reached a
      // URL from a link rather than the sitemap never reads robots.txt for
      // permission to *index* what it already fetched.
      { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Booking and scanner use sticky bottom bars; letting the page zoom is fine,
  // locking it out is an accessibility failure.
  maximumScale: 5,
  // The brand navy — this paints the browser chrome on Android and the status
  // bar of an installed PWA. It was `#0D8A72`, a teal that appears nowhere in
  // the product: a leftover from the pre-Entry-Now palette that quietly framed
  // every mobile page in a colour the brand does not own.
  themeColor: "#16264c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // `data-theme` defaults to the marketplace palette. Each route group's own
  // layout overrides it on its wrapper element.
  return (
    <html
      lang="en"
      data-theme="market"
      className={`${jakarta.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
