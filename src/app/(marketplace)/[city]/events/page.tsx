import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { EmptyStateArt } from "@/components/brand/illustrations";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BadgeCheck, MapPin, Star } from "lucide-react";
import { EventCard } from "@/components/marketplace/event-card";
import {
  CategoryGlyph,
  categoryAccent,
} from "@/components/brand/category-glyph";
import { getViewerContext } from "@/lib/queries/viewer";
import { FilterSidebar } from "@/components/marketplace/filter-sidebar";
import { MapView } from "@/components/marketplace/map-view";
import { ViewSwitcher } from "@/components/marketplace/view-switcher";
import { MobileFilterDrawer } from "@/components/marketplace/mobile-filter-drawer";
import { Button, Money } from "@/components/ui";
import { getCityBySlug } from "@/lib/queries/marketplace";
import { parseFilters, searchEvents } from "@/lib/queries/listing";
import { TicketTearScreen } from "@/components/brand/ticket-tear";

export const metadata: Metadata = { title: "Explore events" };

/**
 * The city lookup decides 404 and so must stay *outside* the boundary; the
 * search is what takes the time, so it goes inside it and the ticket tear
 * shows while it runs. See the note on the event page and D-037.
 */
export default async function ListingPage({
  params,
  searchParams,
}: PageProps<"/[city]/events">) {
  const { city: citySlug } = await params;
  const sp = await searchParams;

  const city = await getCityBySlug(citySlug);
  if (!city) notFound();

  const filters = parseFilters(sp);

  return (
    <Suspense
      // Re-keyed on the filters, so changing a facet re-shows the tear rather
      // than leaving the previous results on screen looking live.
      key={JSON.stringify(filters)}
      fallback={<TicketTearScreen label="Searching events" />}
    >
      <Listing citySlug={citySlug} city={city} filters={filters} />
    </Suspense>
  );
}

async function Listing({
  citySlug,
  city,
  filters,
}: {
  citySlug: string;
  city: NonNullable<Awaited<ReturnType<typeof getCityBySlug>>>;
  filters: ReturnType<typeof parseFilters>;
}) {
  // Parallel, not serial: the viewer's wishlist does not depend on the search
  // results, and awaiting it afterwards cost an extra round trip to Singapore.
  const [{ events, total, facets }, viewer] = await Promise.all([
    searchEvents(city.id, filters),
    getViewerContext(),
  ]);

  const heading = filters.q
    ? `“${filters.q}” in ${city.name}`
    : filters.category
      ? `${facets.categories.find((c) => c.slug === filters.category)?.name ?? "Events"} in ${city.name}`
      : `Events in ${city.name}`;

  return (
    <div className="px-4 md:px-6 lg:px-12 py-6">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-[22px] md:text-[24px] tracking-[-0.4px]">
            {heading}
          </h1>
          <p className="text-[13px] text-ink-muted font-semibold mt-1 tabular">
            {total} {total === 1 ? "event" : "events"}
            {filters.near && ` within ${filters.near.radiusKm} km`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <MobileFilterDrawer facets={facets} total={total} />
          <ViewSwitcher view={filters.view ?? "grid"} sort={filters.sort ?? "trending"} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr] items-start">
        <div className="hidden lg:block sticky top-24">
          <FilterSidebar facets={facets} total={total} />
        </div>

        <div className="min-w-0">
          {total === 0 ? (
            <EmptyResults citySlug={citySlug} cityName={city.name} />
          ) : filters.view === "map" ? (
            <MapView
              events={events}
              citySlug={citySlug}
              origin={filters.near ?? null}
              radiusKm={filters.near?.radiusKm}
            />
          ) : filters.view === "list" ? (
            <ul className="flex flex-col gap-3">
              {events.map((e) => (
                <li key={e.id}>
                  <ListRow event={e} citySlug={citySlug} />
                </li>
              ))}
            </ul>
          ) : (
            // Portrait posters are narrower than the old landscape cards, so
            // the grid takes more columns at every width.
            <div className="grid gap-3.5 md:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {events.map((e) => (
                <EventCard
                key={e.id}
                event={e}
                citySlug={citySlug}
                signedIn={viewer.signedIn}
                wishlisted={viewer.wishlisted.has(e.id)}
              />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Compact horizontal row for the list view. */
function ListRow({
  event,
  citySlug,
}: {
  event: Awaited<ReturnType<typeof searchEvents>>["events"][number];
  citySlug: string;
}) {
  return (
    <Link
      href={`/${citySlug}/events/${event.slug}`}
      className="se-lift flex bg-surface border border-border rounded-[16px] overflow-hidden text-ink hover:text-ink"
    >
      {/* Same poster treatment as the grid card: real cover art when the
          organizer has uploaded it, otherwise the navy plate with the category
          glyph. A gradient block here made the list view look like a different
          product from the grid. */}
      <div className="w-28 sm:w-44 shrink-0 relative overflow-hidden bg-[#16264c]">
        {event.coverImageUrl ? (
          <Image
            src={event.coverImageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 112px, 176px"
            className="object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="absolute -right-3 -bottom-4 text-white/[.15]"
            style={{ color: categoryAccent(event.categorySlug) }}
          >
            <CategoryGlyph
              slug={event.categorySlug}
              size={96}
              strokeWidth={1.5}
            />
          </span>
        )}
        <span className="absolute top-2.5 left-2.5 bg-gold text-ink text-[11px] font-extrabold px-2 py-0.5 rounded-[7px] z-10">
          {event.dateLabel}
        </span>
      </div>

      <div className="p-4 flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-extrabold text-primary bg-primary-tint px-2.5 py-0.5 rounded-full">
              {event.categoryName}
            </span>
            {event.chip && (
              <span className="text-[11px] font-extrabold text-danger-dark bg-danger-tint px-2.5 py-0.5 rounded-full">
                {event.chip.label}
              </span>
            )}
          </div>
          <h3 className="text-[16px] mt-1.5 truncate">{event.title}</h3>
          <p className="text-[12.5px] text-ink-muted font-semibold mt-1 flex items-center gap-1.5 flex-wrap">
            {event.organizerName}
            {event.organizerVerified && (
              <BadgeCheck size={13} className="text-primary" />
            )}
            <span className="flex items-center gap-1">
              <MapPin size={12} strokeWidth={2.2} />
              {event.localityName ?? event.venueName}
              {event.distanceKm !== null && ` · ${event.distanceKm.toFixed(1)} km`}
            </span>
            {event.ratingCount > 0 && (
              <span className="flex items-center gap-1">
                <Star size={12} className="fill-gold text-gold" />
                {event.ratingAvg.toFixed(1)} ({event.ratingCount.toLocaleString("en-IN")})
              </span>
            )}
          </p>
        </div>

        <div className="text-left sm:text-right shrink-0">
          <p className="text-[15.5px] font-extrabold text-primary">
            {event.fromPricePaise === null ? (
              "Free"
            ) : (
              <>
                From <Money paise={event.fromPricePaise} />
              </>
            )}
          </p>
          <p className="text-[11.5px] text-ink-muted font-semibold">
            {Math.round(event.soldRatio * 100)}% sold
          </p>
        </div>
      </div>
    </Link>
  );
}

/** Spec I15 — a locality with zero events shows a festive empty state and
 *  nearby suggestions, never a dead page. */
function EmptyResults({
  citySlug,
  cityName,
}: {
  citySlug: string;
  cityName: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-[18px] px-6 py-16 text-center flex flex-col items-center gap-3">
      <EmptyStateArt />
      <h2 className="text-[18px]">Nothing here — yet</h2>
      <p className="text-[13.5px] text-ink-muted font-semibold max-w-md">
        No events match these filters in {cityName}. The calendar fills up fast
        around festival season — try widening the price or dropping a facet.
      </p>
      <div className="flex gap-2.5 flex-wrap justify-center mt-2">
        <Link href={`/${citySlug}/events`}>
          <Button variant="primary" size="sm">
            Clear all filters
          </Button>
        </Link>
        <Link href={`/${citySlug}/events?when=weekend`}>
          <Button variant="outline" size="sm">
            This weekend
          </Button>
        </Link>
        <Link href={`/${citySlug}`}>
          <Button variant="ghost" size="sm">
            Back to home
          </Button>
        </Link>
      </div>
    </div>
  );
}
