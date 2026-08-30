import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, QrCode, ShieldCheck, Zap } from "lucide-react";
import { MarketplaceShell } from "@/components/marketplace/marketplace-shell";
import { CategoryGlyph, categoryAccent } from "@/components/brand/category-glyph";
import { EventCard } from "@/components/marketplace/event-card";
import { Reveal } from "@/components/brand/reveal";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd, faqJsonLd, itemListJsonLd, websiteJsonLd } from "@/lib/seo";
import { getPreferredCitySlug } from "@/lib/city-context";
import {
  getCategoryTiles,
  getCityTiles,
  getNationalRail,
  getNationalStats,
} from "@/lib/queries/national";
import { shareMetadata, SITE_NAME } from "@/lib/site";

/**
 * The national home page.
 *
 * **This used to be a redirect.** `/` sent every visitor to `/{city}` on the
 * grounds that the marketplace is city-scoped (spec C2.2), which is true of
 * every listing but was the wrong answer for the root: it left the strongest
 * URL on the domain holding no content at all. Google indexed the redirect
 * target instead, so the result for the brand's own name read "Ahmedabad's
 * festivals, one ticket away" — a city page standing in for a company — and
 * there was no page anywhere that a non-geographic query like "book event
 * tickets" or "ticket booking" could land on. Those queries have no city in
 * them, so no city page can answer them (D-044).
 *
 * The redirect is gone for everyone rather than for crawlers only. Serving a
 * landing page to Googlebot and a redirect to people is cloaking, which is a
 * manual-action offence and deserves to be.
 *
 * What the returning visitor loses is one tap, and not really that: the header
 * still opens on their remembered city, every tile below links into a city,
 * and the shell is the same. What they gain is a page that shows what is on
 * anywhere in the country rather than assuming they never travel.
 */

export const revalidate = 300;

/**
 * The brand is spelled out here, unlike every other page.
 *
 * `title.template` in the root layout appends "· Entry Now" to child segments
 * — and `app/page.tsx` is not a child segment, it is the same segment the
 * template is defined in, so Next does not apply it. The homepage shipped
 * titled "Book event tickets online in India" with no brand anywhere in it,
 * on the one page most likely to be returned for a search of the brand name.
 */
const TITLE = `Book event tickets online in India · ${SITE_NAME}`;
const DESCRIPTION =
  "Book Garba and Navratri passes, concerts, comedy and melas across India. " +
  "Instant digital tickets — one QR each, scanned at the gate.";

export const metadata: Metadata = shareMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: "/",
});

/**
 * Answers to what people actually type, kept honest.
 *
 * Rendered on the page AND passed to `faqJsonLd` from the same array — Google
 * treats marked-up answers that are not visible as a structured-data
 * violation, and the only reliable way to keep the two in step is to have one
 * source. Every claim here is one the product can keep today: no line promises
 * a refund policy, a payout schedule or a city that does not exist yet.
 */
const FAQ = [
  {
    q: "How do I book Garba tickets online?",
    a: "Pick your city, open the Garba or Navratri listing, choose a night and a pass type, and pay by UPI or card. Your ticket arrives instantly in the app, by SMS and by email — there is nothing to collect and no physical pass to carry.",
  },
  {
    q: "Is there a booking fee?",
    a: "The price you see on the event page is the price you pay. Any fee is shown in the breakdown before you pay, never added at the last step.",
  },
  {
    q: "What is the ticket, exactly?",
    a: "A signed QR code, one per person. It is scanned once at the gate and cannot be scanned twice, so a screenshot forwarded to somebody else will not get them in.",
  },
  {
    q: "Can I book for a city I do not live in?",
    a: "Yes. Switch city from the header — nothing is tied to where you are, and your tickets stay in one place whichever city you book in.",
  },
  {
    q: "Can I get a refund if I cannot go?",
    a: "It depends on the event: each one states its refund policy on its own page, before you pay. Where refunds are allowed, you cancel from your tickets and the money goes back the way it came.",
  },
  {
    q: "How do I sell tickets for my own event?",
    a: "List it from the organizer portal. You get a live dashboard, promo codes, gate scanning on any phone, and settlement after the event. Plans and commission are published rather than negotiated per organizer.",
  },
];

export default async function HomePage() {
  const citySlug = await getPreferredCitySlug();
  const [cities, categories, rail, stats] = await Promise.all([
    getCityTiles(),
    getCategoryTiles(citySlug),
    getNationalRail(12),
    getNationalStats(),
  ]);

  const live = cities.filter((c) => c.eventCount > 0);
  const soon = cities.filter((c) => c.eventCount === 0);

  return (
    <MarketplaceShell citySlug={citySlug} autoPromptCity={false}>
      <JsonLd data={websiteJsonLd(citySlug)} />
      <JsonLd data={breadcrumbJsonLd([{ name: SITE_NAME, path: "/" }])} />
      <JsonLd data={faqJsonLd(FAQ)} />
      {rail.length > 0 && (
        <JsonLd
          data={itemListJsonLd(
            "Events on sale now",
            rail.map((e) => ({
              name: e.title,
              path: `/${e.citySlug}/events/${e.slug}`,
            })),
          )}
        />
      )}

      {/* ------------------------------------------------------------- Hero */}
      <section className="px-4 md:px-6 lg:px-12 pt-10 pb-8 md:pt-16 md:pb-12">
        <div className="max-w-3xl">
          {/* The only h1 on the page, and it carries the phrase this page is
              for. Everything below is h2 — a second h1 splits the signal. */}
          <h1 className="text-[30px] md:text-[46px] leading-[1.08] font-extrabold tracking-tight text-ink">
            Book event tickets online,{" "}
            <span className="text-primary">anywhere in India</span>
          </h1>
          <p className="mt-4 text-[15px] md:text-[17px] leading-relaxed text-body-soft max-w-2xl">
            Garba and Navratri nights, concerts, comedy, food fests and melas.
            One QR per ticket, scanned at the gate — no printouts, no queue at
            the counter, no wondering whether the pass is real.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href={`/${citySlug}/events`}
              className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[14px] font-extrabold bg-primary text-white shadow-[var(--shadow-cta-themed)] hover:bg-primary-dark transition-colors"
            >
              Browse events <ArrowRight size={16} strokeWidth={2.5} />
            </Link>
            <Link
              href="/organizer/onboarding"
              className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[14px] font-extrabold bg-surface text-ink border border-border-strong hover:border-primary hover:text-primary transition-colors"
            >
              Sell tickets for your event
            </Link>
          </div>

          {stats.events > 0 && (
            <p className="mt-5 text-[13px] text-ink-muted tabular">
              {stats.events} event{stats.events === 1 ? "" : "s"} on sale ·{" "}
              {stats.organizers} verified organiser
              {stats.organizers === 1 ? "" : "s"} · {stats.cities} cities
            </p>
          )}
        </div>
      </section>

      {/* -------------------------------------------------------- Categories */}
      <section className="px-4 md:px-6 lg:px-12 py-8 border-t border-divider">
        <h2 className="text-[20px] md:text-[24px] font-extrabold text-ink">
          What do you want to book?
        </h2>
        <p className="mt-1.5 text-[14px] text-body-soft">
          Every category, in the city where it is busiest.
        </p>
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {categories.map((cat, i) => (
            <Reveal key={cat.slug} delayMs={i * 30}>
              <Link
                href={`/${cat.citySlug}/events?category=${cat.slug}`}
                className="se-lift group flex flex-col items-center gap-2.5 rounded-[18px] border border-divider bg-surface px-3 py-5 text-center h-full"
              >
                <CategoryGlyph
                  slug={cat.slug}
                  size={38}
                  className={categoryAccent(cat.slug)}
                />
                <span className="text-[13px] font-bold text-ink leading-snug">
                  {cat.name}
                </span>
                <span className="text-[11.5px] text-ink-muted tabular">
                  {cat.eventCount > 0
                    ? `${cat.eventCount} on sale`
                    : "Coming soon"}
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------- Live events */}
      {rail.length > 0 && (
        <section className="px-4 md:px-6 lg:px-12 py-8 border-t border-divider">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-[20px] md:text-[24px] font-extrabold text-ink">
                On sale now
              </h2>
              <p className="mt-1.5 text-[14px] text-body-soft">
                The next nights to go, across every city.
              </p>
            </div>
            <Link
              href={`/${citySlug}/events`}
              className="shrink-0 text-[13.5px] font-bold text-primary hover:underline"
            >
              See all
            </Link>
          </div>
          <div className="mt-6 flex gap-4 overflow-x-auto pb-2 snap-x">
            {rail.map((e, i) => (
              <Reveal
                key={e.id}
                delayMs={i * 40}
                className="shrink-0 w-[168px] sm:w-[190px] md:w-[210px] snap-start"
              >
                <EventCard event={e} citySlug={e.citySlug} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------ Cities */}
      <section className="px-4 md:px-6 lg:px-12 py-8 border-t border-divider">
        <h2 className="text-[20px] md:text-[24px] font-extrabold text-ink">
          Pick your city
        </h2>
        <p className="mt-1.5 text-[14px] text-body-soft">
          Ahmedabad first, and opening as organisers come on.
        </p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          {live.map((c) => (
            <Link
              key={c.slug}
              href={`/${c.slug}`}
              className="se-lift inline-flex items-baseline gap-2 rounded-[14px] border border-divider bg-surface px-4 py-3"
            >
              <span className="text-[14px] font-bold text-ink">{c.name}</span>
              <span className="text-[11.5px] text-ink-muted tabular">
                {c.eventCount} event{c.eventCount === 1 ? "" : "s"}
              </span>
            </Link>
          ))}
          {/* A city with nothing on is still a real page with a real empty
              state, and saying so is more honest than hiding it — someone in
              Surat should be able to see that we mean to be there. */}
          {soon.map((c) => (
            <Link
              key={c.slug}
              href={`/${c.slug}`}
              className="inline-flex items-baseline gap-2 rounded-[14px] border border-dashed border-divider px-4 py-3 text-ink-muted hover:text-ink"
            >
              <span className="text-[14px] font-semibold">{c.name}</span>
              <span className="text-[11.5px]">soon</span>
            </Link>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------- Why / how */}
      <section className="px-4 md:px-6 lg:px-12 py-8 border-t border-divider">
        <h2 className="text-[20px] md:text-[24px] font-extrabold text-ink">
          A ticket that behaves like a ticket
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: QrCode,
              title: "One QR, scanned once",
              body: "Every ticket is signed and can be scanned exactly once. Forwarding a screenshot does not get a second person in, which is what makes a gate move.",
            },
            {
              icon: Zap,
              title: "Instant delivery",
              body: "The ticket lands in the app, by SMS and by email the moment payment clears. Nothing to collect, nothing to print, nothing to lose.",
            },
            {
              icon: ShieldCheck,
              title: "Priced as shown",
              body: "The amount on the event page is the amount you pay. Any fee appears in the breakdown before payment, not as a surprise at the end.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-[18px] border border-divider bg-surface p-5"
            >
              <Icon size={22} strokeWidth={2.2} className="text-primary" />
              <h3 className="mt-3 text-[15px] font-extrabold text-ink">
                {title}
              </h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-body-soft">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------------- FAQ */}
      <section className="px-4 md:px-6 lg:px-12 py-8 pb-14 border-t border-divider">
        <h2 className="text-[20px] md:text-[24px] font-extrabold text-ink">
          Questions people ask
        </h2>
        <div className="mt-6 grid gap-3 md:grid-cols-2 max-w-5xl">
          {FAQ.map((item) => (
            <div
              key={item.q}
              className="rounded-[18px] border border-divider bg-surface p-5"
            >
              <h3 className="text-[14.5px] font-extrabold text-ink">
                {item.q}
              </h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-body-soft">
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </section>
    </MarketplaceShell>
  );
}
