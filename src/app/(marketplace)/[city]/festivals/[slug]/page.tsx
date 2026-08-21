import Link from "next/link";
import { EmptyStateArt } from "@/components/brand/illustrations";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { EventCard } from "@/components/marketplace/event-card";
import { getViewerContext } from "@/lib/queries/viewer";
import { Button } from "@/components/ui";
import { db } from "@/lib/db";
import { getCityBySlug } from "@/lib/queries/marketplace";
import { searchEvents } from "@/lib/queries/listing";
import { formatIstShortDate, istDateKey } from "@/lib/ist";

/** Festival SEO landing — "Navratri in Ahmedabad". Statically regenerated. */
export const revalidate = 900;

async function load(citySlug: string, slug: string) {
  const [city, festival] = await Promise.all([
    getCityBySlug(citySlug),
    db.festival.findFirst({ where: { slug, isActive: true } }),
  ]);
  if (!city || !festival) return null;
  return { city, festival };
}

export async function generateMetadata({
  params,
}: PageProps<"/[city]/festivals/[slug]">): Promise<Metadata> {
  const { city, slug } = await params;
  const data = await load(city, slug);
  if (!data) return {};
  return {
    title: `${data.festival.name} in ${data.city.name}`,
    description:
      data.festival.description ??
      `${data.festival.name} events in ${data.city.name} — dates, venues, tickets.`,
  };
}

export default async function FestivalPage({
  params,
}: PageProps<"/[city]/festivals/[slug]">) {
  const { city: citySlug, slug } = await params;
  const data = await load(citySlug, slug);
  if (!data) notFound();
  const { city, festival } = data;

  const { events } = await searchEvents(city.id, { festival: slug, sort: "trending" });
  const viewer = await getViewerContext();

  // Night navigator — the distinct IST dates this festival's events run on.
  const sessions = await db.eventSession.findMany({
    where: { event: { festivalId: festival.id, cityId: city.id, status: "LIVE" } },
    orderBy: { startsAt: "asc" },
    select: { startsAt: true, eventId: true },
  });
  const nights = new Map<string, { date: Date; events: Set<string> }>();
  for (const s of sessions) {
    const key = istDateKey(s.startsAt);
    if (!nights.has(key)) nights.set(key, { date: s.startsAt, events: new Set() });
    nights.get(key)!.events.add(s.eventId);
  }
  const nightList = [...nights.entries()].map(([key, v], i) => ({
    key,
    num: i + 1,
    date: v.date,
    count: v.events.size,
  }));

  const vibes = [
    { name: "Traditional raas", blurb: "Strict dress code, live singers", gradient: "navratri" },
    { name: "Big ground energy", blurb: "Thousands, orchestra, late nights", gradient: "concert" },
    { name: "Family friendly", blurb: "Early finish, family rings", gradient: "diwali" },
    { name: "Budget picks", blurb: "Under ₹500 a night", gradient: "food" },
  ];

  return (
    <div className="pb-10">
      <section
        className="px-4 md:px-6 lg:px-12 py-14 text-white"
        style={{ background: `var(--gradient-${festival.gradient})` }}
      >
        <p className="text-[12px] font-extrabold tracking-[0.1em] opacity-90">
          {formatIstShortDate(festival.startsAt)} –{" "}
          {formatIstShortDate(festival.endsAt)}
        </p>
        <h1 className="text-[30px] md:text-[44px] tracking-[-1px] mt-1.5">
          {festival.name} in {city.name}
        </h1>
        {festival.tagline && (
          <p className="text-[15px] md:text-[17px] opacity-90 mt-2 max-w-2xl">
            {festival.tagline}
          </p>
        )}
        <p className="text-[13.5px] font-bold mt-4">
          {events.length} {events.length === 1 ? "event" : "events"} ·{" "}
          {nightList.length} {nightList.length === 1 ? "night" : "nights"}
        </p>
      </section>

      {/* Night navigator */}
      {nightList.length > 1 && (
        <section className="px-4 md:px-6 lg:px-12 pt-8">
          <h2 className="text-[20px] md:text-[24px] mb-3.5">Night navigator</h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {nightList.map((n) => (
              <Link
                key={n.key}
                href={`/${citySlug}/events?festival=${slug}&date=${n.key}`}
                className="shrink-0 w-[92px] bg-surface border-[1.5px] border-border rounded-[14px] px-3 py-2.5 text-center text-ink hover:border-primary hover:text-ink"
              >
                <span className="block text-[10px] font-extrabold text-ink-muted tracking-wide">
                  NIGHT {n.num}
                </span>
                <span className="block text-[14px] font-extrabold mt-0.5">
                  {formatIstShortDate(n.date)}
                </span>
                <span className="block text-[11px] font-bold text-primary mt-0.5 tabular">
                  {n.count} {n.count === 1 ? "event" : "events"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Vibe grid */}
      <section className="px-4 md:px-6 lg:px-12 pt-8">
        <h2 className="text-[20px] md:text-[24px] mb-3.5">Browse by vibe</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {vibes.map((v) => (
            <Link
              key={v.name}
              href={`/${citySlug}/events?festival=${slug}`}
              className="se-lift rounded-[16px] p-4 text-white min-h-[104px] flex flex-col justify-end hover:text-white"
              style={{ background: `var(--gradient-${v.gradient})` }}
            >
              <span className="text-[15px] font-extrabold">{v.name}</span>
              <span className="text-[12px] opacity-90">{v.blurb}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Top events */}
      <section className="px-4 md:px-6 lg:px-12 pt-8">
        <div className="flex justify-between items-baseline mb-3.5 gap-3">
          <h2 className="text-[20px] md:text-[24px]">
            Top {festival.name} events
          </h2>
          <Link
            href={`/${citySlug}/events?festival=${slug}`}
            className="text-[14px] font-bold"
          >
            See all →
          </Link>
        </div>
        {events.length > 0 ? (
          <div className="grid gap-3.5 md:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {events.slice(0, 6).map((e) => (
              <EventCard
                key={e.id}
                event={e}
                citySlug={citySlug}
                signedIn={viewer.signedIn}
                wishlisted={viewer.wishlisted.has(e.id)}
              />
            ))}
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-[18px] px-6 py-12 text-center flex flex-col items-center gap-3">
            <EmptyStateArt />
            <p className="text-[14px] font-semibold text-ink-muted max-w-md">
              No {festival.name} events listed in {city.name} yet. Organizers
              usually publish 6–8 weeks ahead.
            </p>
            <Link href={`/${citySlug}/events`}>
              <Button variant="outline" size="sm">
                Browse everything else
              </Button>
            </Link>
          </div>
        )}
      </section>

      {/* First-timer guide */}
      <section className="px-4 md:px-6 lg:px-12 pt-10">
        <h2 className="text-[20px] md:text-[24px] mb-3.5">
          First time at {festival.name}?
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              t: "What to wear",
              d: "Chaniya choli or kediyu-dhoti. Many grounds enforce a traditional dress code — check the event page before you book.",
            },
            {
              t: "When to arrive",
              d: "Aarti is around 7:30 PM and the floor fills right after. Gates open 45 minutes earlier; parking goes first.",
            },
            {
              t: "What it costs",
              d: "A single night runs ₹350–₹700 at most grounds. Season passes pay for themselves from about four nights.",
            },
          ].map((g) => (
            <div
              key={g.t}
              className="bg-surface border border-border rounded-[16px] p-5"
            >
              <p className="font-extrabold text-[15.5px]">{g.t}</p>
              <p className="text-[13px] text-body-soft leading-relaxed mt-1.5">
                {g.d}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
