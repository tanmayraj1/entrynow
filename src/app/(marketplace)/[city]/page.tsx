import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BadgeCheck, Search, Sparkles, Star } from "lucide-react";
import { CategoryGlyph, categoryAccent } from "@/components/brand/category-glyph";
import { Reveal } from "@/components/brand/reveal";
import { cn } from "@/lib/cn";
import {
  EmptyStateArt,
  HeroBackdrop,
  OrnamentBand,
  StepMedallion,
} from "@/components/brand/illustrations";
import { EventCard } from "@/components/marketplace/event-card";
import { getViewerContext } from "@/lib/queries/viewer";
import { FeaturedTabs } from "@/components/marketplace/featured-tabs";
import { MapExplorer } from "@/components/marketplace/map-explorer";
import { BannerCarousel } from "@/components/marketplace/banner-carousel";
import { getMapPins } from "@/lib/queries/map";
import { Chip } from "@/components/ui";
import {
  getActiveBanners,
  getCategories,
  getCityBySlug,
  getCityStats,
  getFeaturedEvents,
  getFestivalsWithCounts,
  getLocalities,
  getPopularOrganizers,
  type FeaturedTab,
} from "@/lib/queries/marketplace";
import { formatIstShortDate } from "@/lib/ist";
import { TicketTearScreen } from "@/components/brand/ticket-tear";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: PageProps<"/[city]">): Promise<Metadata> {
  const { city } = await params;
  const found = await getCityBySlug(city);
  if (!found) return {};
  return {
    title: `${found.name}'s festivals, one ticket away`,
    description: `Garba nights, Diwali melas, concerts and more in ${found.name}. Book digital tickets, scan and enter.`,
  };
}

const TABS: { key: FeaturedTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "weekend", label: "This weekend" },
  { key: "big", label: "Big events" },
  { key: "small", label: "Intimate" },
];

export default async function CityHomePage({
  params,
  searchParams,
}: PageProps<"/[city]">) {
  const { city: citySlug } = await params;
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "all") as FeaturedTab;

  const city = await getCityBySlug(citySlug);
  if (!city) notFound();

  return (
    <Suspense
      key={tab}
      fallback={<TicketTearScreen label="Finding tonight's events" />}
    >
      <CityHome citySlug={citySlug} city={city} tab={tab} />
    </Suspense>
  );
}

/**
 * Everything below the 404 decision.
 *
 * Split out so the city lookup — the query that decides whether this is a real
 * city — runs *outside* the Suspense boundary. Once a boundary flushes, Next
 * has committed a 200 and `notFound()` can only change the body (D-037). The
 * eight queries below are what actually take the time, so they belong inside,
 * where the ticket tear can cover them.
 */
async function CityHome({
  citySlug,
  city,
  tab,
}: {
  citySlug: string;
  city: NonNullable<Awaited<ReturnType<typeof getCityBySlug>>>;
  tab: FeaturedTab;
}) {
  // One batch, not two. `getViewerContext` used to be awaited *after* this
  // block, which cost a whole extra round trip to Singapore — about 60ms of
  // pure distance for a query that depends on nothing here.
  const [
    categories,
    festivals,
    featured,
    organizers,
    banners,
    stats,
    localities,
    mapPins,
    viewer,
  ] = await Promise.all([
    getCategories(),
    getFestivalsWithCounts(city.id),
    getFeaturedEvents(city.id, tab),
    getPopularOrganizers(city.id),
    getActiveBanners(city.id),
    getCityStats(city.id),
    getLocalities(city.id),
    // Rendered server-side so the map section has pins before its first
    // client fetch — the list is real content, not a loading state.
    getMapPins(city.id, { limit: 80 }),
    getViewerContext(),
  ]);

  const trendingChips = [
    { label: "Navratri 2026", href: `/${citySlug}/festivals/navratri-2026` },
    { label: "This weekend", href: `/${citySlug}/events?when=weekend` },
    { label: "Under ₹500", href: `/${citySlug}/events?maxPrice=500` },
    { label: "Near me", href: `/${citySlug}/events?near=1` },
  ];

  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      {/* Height is a MINIMUM on mobile and fixed only from `md` up. The search
          form stacks into three fields plus a button below `md`, which with the
          headline and chips is taller than any fixed height that still looks
          right on a phone — so a fixed `h-*` here silently clipped the trending
          chips under `overflow-hidden` (D-027). */}
      <section className="relative min-h-[440px] md:min-h-0 md:h-[400px] overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: "var(--brand-mesh)" }}
        />
        {/* Brand photograph, layered between the mesh and the vector backdrop.
            `object-cover` + `priority` because this is the LCP element — a
            lazy hero is a blank rectangle for the first second on 4G.
            The mesh stays underneath so a slow or failed image leaves the
            original gradient rather than a hole, and the multiply-free
            scrim below keeps the white headline readable over the bright
            stage lights in the upper third. */}
        <Image
          src="/images/hero-entry-v2.png"
          alt=""
          aria-hidden
          fill
          priority
          sizes="100vw"
          className="absolute inset-0 object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,26,56,.62)_0%,rgba(14,26,56,.44)_45%,rgba(14,26,56,.66)_100%)]" />
        <HeroBackdrop />
        {/* Bottom scrim so the search card's shadow has something to land on. */}
        <div className="absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(180deg,transparent,rgba(14,26,56,.55))]" />

        {/* `pb-14` clears the torana strip absolutely positioned at the bottom
            edge; without it the chips sit under the garland on a phone. */}
        <div className="relative min-h-[440px] md:h-full flex flex-col items-center justify-center gap-4 md:gap-5 px-4 md:px-12 pt-8 pb-14 md:py-0 text-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-[12px] font-bold text-white/90 backdrop-blur-[6px]">
              <Sparkles size={13} strokeWidth={2.6} className="text-gold" />
              {stats.liveEvents.toLocaleString("en-IN")} live events in{" "}
              {city.name} right now
            </p>
            <h1 className="text-white text-[26px] md:text-[38px] leading-[1.08] tracking-[-1px] mt-3.5 [text-shadow:0_2px_28px_rgba(0,0,0,.4)]">
              Garba, comedy, concerts, theatre.
              <br className="hidden md:block" /> Your ticket in three taps.
            </h1>
            <p className="hidden md:block text-white/85 text-[15px] mt-2.5">
              Every night out in {city.name} — booked, scanned, entered.
            </p>
          </div>

          {/* What / Where / When */}
          <form
            action={`/${citySlug}/events`}
            className="bg-surface rounded-[18px] p-2.5 w-full max-w-[860px] shadow-[0_16px_48px_rgba(22,48,43,.35)] flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-0"
          >
            <label className="flex-[1.3] px-4 py-1.5 md:border-r border-border text-left">
              <span className="block text-[11px] font-bold text-ink-muted tracking-[0.06em]">
                WHAT
              </span>
              <input
                name="q"
                placeholder="Event, artist or venue"
                className="border-none outline-none text-[14.5px] w-full py-0.5 bg-transparent"
              />
            </label>
            <label className="flex-1 px-4 py-1.5 md:border-r border-border text-left">
              <span className="block text-[11px] font-bold text-ink-muted tracking-[0.06em]">
                WHERE
              </span>
              <input
                name="locality"
                list="locality-options"
                autoComplete="off"
                placeholder={`Locality — ${localities
                  .slice(0, 2)
                  .map((l) => l.name)
                  .join(", ")}…`}
                className="border-none outline-none text-[14.5px] w-full py-0.5 bg-transparent"
              />
              {/* Real localities, so the field can be typed or picked. The
                  query accepts the name or the slug. */}
              <datalist id="locality-options">
                {localities.map((l) => (
                  <option key={l.id} value={l.name} />
                ))}
              </datalist>
            </label>
            <label className="flex-[.9] px-4 py-1.5 text-left">
              <span className="block text-[11px] font-bold text-ink-muted tracking-[0.06em]">
                WHEN
              </span>
              <input
                name="date"
                type="date"
                className="border-none outline-none text-[14.5px] w-full py-0.5 bg-transparent"
              />
            </label>
            <button
              type="submit"
              className="text-white font-bold text-[15px] px-7 py-3.5 rounded-[13px] flex items-center justify-center gap-2 cursor-pointer shrink-0 transition-[filter] hover:brightness-110"
              style={{
                background: "var(--brand-gradient)",
                boxShadow: "var(--shadow-cta)",
              }}
            >
              <Search size={16} strokeWidth={2.6} />
              Search
            </button>
          </form>

          <div className="flex gap-2.5 flex-wrap justify-center">
            {trendingChips.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="bg-white/[.14] border border-white/35 text-white text-[13px] font-semibold px-4 py-[7px] rounded-full backdrop-blur-[6px] hover:bg-white/[.28] hover:text-white"
              >
                {c.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Torana across the hero's lower edge — the garland strung over a
            doorway, which is what a hero on this product is. */}
        <OrnamentBand className="absolute inset-x-0 bottom-0 h-[30px] opacity-90" />
      </section>

      {/* --------------------------------------------------- Banner carousel */}
      {/* Replaces the old "Offers for you" grid that sat two-thirds of the way
          down the page — promoted content earns its slot by being seen. */}
      <BannerCarousel banners={banners} citySlug={citySlug} />

      {/* ------------------------------------------------- Explore on the map */}
      <Section
        title="Explore on the map"
        subtitle="Drag the map — the list follows"
      >
        <MapExplorer
          citySlug={citySlug}
          cityName={city.name}
          cityCenter={{ lat: Number(city.lat), lng: Number(city.lng) }}
          initialPins={mapPins}
        />
      </Section>

      {/* --------------------------------------------------------- Categories */}
      <Section
        title="Browse by category"
        action={{ href: `/${citySlug}/events`, label: "See all →" }}
      >
        {/* Monochrome plates, one of three flat accents per category. The
            colour lives in the glyph, not the surface — twelve coloured tiles
            read as a paint chart and drown the event cards below (D-019). */}
        <div className="flex gap-3 md:gap-3.5 overflow-x-auto pb-3.5 -mx-1 px-1">
          {categories.map((cat, i) => {
            const accent = categoryAccent(cat.slug);
            return (
              <Reveal key={cat.id} delayMs={Math.min(i * 28, 340)} className="shrink-0">
                <Link
                  href={`/${citySlug}/events?category=${cat.slug}`}
                  className="group w-[108px] md:w-[126px] flex flex-col items-center gap-2.5 text-ink hover:text-ink"
                  style={{ ["--accent" as string]: accent }}
                >
                  <span
                    className={cn(
                      "relative grid place-items-center w-full aspect-square rounded-[20px]",
                      "bg-surface border border-border overflow-hidden",
                      "transition-[transform,border-color,box-shadow,background-color] duration-200",
                      "group-hover:-translate-y-1 group-hover:border-[var(--accent)]",
                      "group-hover:bg-[var(--accent)] group-hover:shadow-[var(--shadow-e3)]",
                      "motion-reduce:transition-none motion-reduce:group-hover:translate-y-0",
                    )}
                  >
                    <CategoryGlyph
                      slug={cat.slug}
                      size={44}
                      strokeWidth={2.2}
                      className="relative text-[var(--accent)] transition-colors duration-200 group-hover:text-white"
                    />
                  </span>
                  <span className="text-[12.5px] md:text-[13.5px] font-bold text-center leading-tight group-hover:text-[var(--accent)] transition-colors">
                    {cat.name}
                  </span>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </Section>

      {/* -------------------------------------------------- Festival calendar */}
      <Section
        title="Festival calendar"
        subtitle={`Plan ahead — ${city.name}'s year of celebrations`}
      >
        <div className="flex gap-3.5 overflow-x-auto pb-2.5">
          {festivals.map((f) => (
            <Link
              key={f.id}
              href={`/${citySlug}/festivals/${f.slug}`}
              className="shrink-0 w-[230px] bg-surface border-[1.5px] border-border rounded-[16px] p-4 flex flex-col gap-1.5 text-ink hover:border-primary hover:shadow-[0_8px_24px_rgba(13,138,114,.12)] transition-colors"
            >
              <span
                className="w-[38px] h-1.5 rounded-[3px]"
                style={{ background: categoryAccent(f.slug) }}
              />
              <span className="text-[16.5px] font-extrabold mt-1.5">
                {f.name}
              </span>
              <span className="text-[13px] text-ink-muted font-semibold">
                {formatIstShortDate(f.startsAt)} – {formatIstShortDate(f.endsAt)}
              </span>
              <span className="text-[12.5px] text-primary font-bold">
                {f.eventCount} {f.eventCount === 1 ? "event" : "events"} in{" "}
                {city.name}
              </span>
            </Link>
          ))}
        </div>
      </Section>

      {/* ----------------------------------------------------- Featured events */}
      <Section
        title="Featured events"
        right={
          <FeaturedTabs tabs={TABS} active={tab} citySlug={citySlug} />
        }
      >
        {featured.length > 0 ? (
          // A poster rail, not a grid — the BookMyShow home pattern. Native
          // overflow scroll with snap; the negative margin lets the rail bleed
          // to the viewport edge on phones so a half-visible card advertises
          // that it scrolls.
          <div className="flex gap-3.5 md:gap-4 overflow-x-auto pb-3 -mx-4 px-4 md:mx-0 md:px-0 snap-x">
            {featured.map((e, i) => (
              <Reveal
                key={e.id}
                delayMs={Math.min(i * 45, 270)}
                className="shrink-0 w-[168px] sm:w-[190px] md:w-[210px] snap-start"
              >
                <EventCard
                  event={e}
                  citySlug={citySlug}
                  signedIn={viewer.signedIn}
                  wishlisted={viewer.wishlisted.has(e.id)}
                />
              </Reveal>
            ))}
          </div>
        ) : (
          <EmptyRail
            message={
              tab === "weekend"
                ? "Nothing on this weekend yet — the calendar fills up fast, check back soon."
                : "No events in this view yet."
            }
            citySlug={citySlug}
          />
        )}
      </Section>

      {/* -------------------------------------------------- Popular organizers */}
      {organizers.length > 0 && (
        <Section title="Popular organizers">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {organizers.map((o) => (
              <Link
                key={o.id}
                href={`/${citySlug}/organizers/${o.slug}`}
                className="se-lift bg-surface border border-border rounded-[16px] p-4 flex items-center gap-3.5 text-ink hover:text-ink"
              >
                <span className="size-12 rounded-full bg-primary-tint text-primary-dark grid place-items-center font-extrabold text-[15px] shrink-0">
                  {initials(o.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="font-extrabold text-[15px] truncate">
                      {o.name}
                    </span>
                    {o.verified && (
                      <BadgeCheck size={14} className="text-primary shrink-0" />
                    )}
                  </span>
                  <span className="flex items-center gap-2.5 text-[12px] text-ink-muted font-semibold mt-0.5">
                    <span className="flex items-center gap-1">
                      <Star size={12} className="fill-gold text-gold" />
                      {Number(o.ratingAvg).toFixed(1)}
                    </span>
                    <span>{compact(o.followerCount)} followers</span>
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* -------------------------------------------------------- How it works */}
      <Section title="How it works">
        <ol className="grid gap-4 md:grid-cols-3">
          {[
            { n: 1, t: "Find your night", d: "Filter by locality, price, language or festival — or just drag the map until something looks good." },
            { n: 2, t: "Book in minutes", d: "UPI-first checkout. Your seats are held for 8 minutes while you pay, and released the moment you don't." },
            { n: 3, t: "Scan and enter", d: "A QR per attendee. One scan only — show it at the gate, no printout, no network needed." },
          ].map((s) => (
            <li
              key={s.n}
              className="bg-surface border border-border rounded-[18px] p-6 flex flex-col gap-2.5"
              style={{ boxShadow: "var(--shadow-e1)" }}
            >
              <StepMedallion n={s.n} />
              <span className="font-extrabold text-[16.5px]">{s.t}</span>
              <span className="text-[13px] text-body-soft leading-relaxed">
                {s.d}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      {/* --------------------------------------------------------- Stats band */}
      <section className="bg-ink text-white px-4 md:px-6 lg:px-12 py-10 mt-6">
        <div className="grid gap-6 sm:grid-cols-3 text-center">
          {[
            { v: stats.liveEvents.toLocaleString("en-IN"), l: `Live events in ${city.name}` },
            { v: stats.organizers.toLocaleString("en-IN"), l: "Verified organizers" },
            { v: compact(stats.ticketsSold), l: "Tickets issued" },
          ].map((s) => (
            <div key={s.l}>
              <p className="text-[32px] font-extrabold tabular">{s.v}</p>
              <p className="text-[13px] text-white/70 font-semibold">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------------- FAQ */}
      <Section title="Frequently asked">
        <div className="grid gap-3 md:grid-cols-2">
          {[
            { q: "How do I get my tickets?", a: "Instantly, on the confirmation screen and by WhatsApp and email. Each attendee gets their own QR." },
            { q: "Can I cancel?", a: "It depends on the organizer's policy, shown on every event page before you pay. Most allow a full refund up to 72 hours before." },
            { q: "What if the QR won't scan?", a: "Gate staff can look up your booking ID. Your ticket is also cached on your phone, so it works without network." },
            { q: "Can I transfer a ticket?", a: "Yes, once per ticket, up to 2 hours before the event. The old QR stops working immediately." },
          ].map((f) => (
            <details
              key={f.q}
              className="bg-surface border border-border rounded-[14px] px-4 py-3.5 group"
            >
              <summary className="font-extrabold text-[14px] cursor-pointer list-none flex items-center justify-between gap-3">
                {f.q}
                <span className="text-ink-muted group-open:rotate-45 transition-transform text-[18px] leading-none">
                  +
                </span>
              </summary>
              <p className="text-[13px] text-body-soft leading-relaxed mt-2">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------

function Section({
  title,
  subtitle,
  action,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: { href: string; label: string };
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="px-4 md:px-6 lg:px-12 pt-8 md:pt-10">
      <div className="flex justify-between items-baseline gap-4 mb-4 flex-wrap">
        <h2 className="text-[20px] md:text-[24px] tracking-[-0.4px]">{title}</h2>
        {subtitle && (
          <span className="text-[13.5px] text-ink-muted">{subtitle}</span>
        )}
        {action && (
          <Link href={action.href} className="text-[14px] font-bold">
            {action.label}
          </Link>
        )}
        {right}
      </div>
      {children}
    </section>
  );
}

/** Spec I15's principle — never a dead page. */
function EmptyRail({
  message,
  citySlug,
}: {
  message: string;
  citySlug: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-[18px] px-6 py-10 text-center flex flex-col items-center gap-3">
      <EmptyStateArt />
      <p className="text-[14px] font-semibold text-ink-muted max-w-md">
        {message}
      </p>
      <Link href={`/${citySlug}/events`}>
        <Chip as="span">Browse all events</Chip>
      </Link>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/** 48200 -> "48.2K". Indian-friendly compact counts. */
function compact(n: number) {
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000) return `${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}
