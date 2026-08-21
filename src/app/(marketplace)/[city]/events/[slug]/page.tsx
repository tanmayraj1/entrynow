import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BadgeCheck, Clock, Star } from "lucide-react";
import { Money, StatusPill } from "@/components/ui";
import {
  CategoryGlyph,
  categoryAccent,
} from "@/components/brand/category-glyph";
import { TicketPicker } from "@/components/marketplace/ticket-picker";
import { ZonePlan } from "@/components/marketplace/zone-plan";
import { VenueDirections } from "@/components/marketplace/venue-directions";
import {
  eventIsPublic,
  getEventDetail,
  getEventShareMeta,
  getRatingBreakdown,
  getSimilarEvents,
} from "@/lib/queries/event";
import { JsonLd } from "@/components/seo/json-ld";
import { eventJsonLd } from "@/lib/seo";
import { shareMetadata, SITE_NAME } from "@/lib/site";
import { TicketTearScreen } from "@/components/brand/ticket-tear";
import { formatIstDate, formatIstTime, isTodayIst } from "@/lib/ist";
import { tierRemaining } from "@/lib/availability";

export const revalidate = 120;

export async function generateMetadata({
  params,
}: PageProps<"/[city]/events/[slug]">): Promise<Metadata> {
  const { city, slug } = await params;
  // The lean projection, not `getEventDetail`. `generateMetadata` runs on
  // every request to the page — including the one that then renders it — and
  // pulling reviews, FAQs and gates twice to print a title is pure waste.
  const e = await getEventShareMeta(city, slug);
  if (!e) return {};

  return shareMetadata({
    title: e.title,
    description:
      e.summary ??
      `${e.title} at ${e.venue?.name ?? e.city.name}. Book digital tickets on ${SITE_NAME}.`,
    path: `/${city}/events/${slug}`,
    // `article`, not `website`: this is a single dated thing, and the scrapers
    // that distinguish them render a richer card for it.
    type: "article",
  });
}

const PROHIBITED = [
  "Outside food & drink",
  "Alcohol / narcotics",
  "Sharp objects",
  "Fireworks",
  "Professional cameras",
  "Pets",
  "Drones",
  "Weapons of any kind",
];

/**
 * Two halves, and the split is what makes the preloader legal.
 *
 * The cheap "does this exist" question is answered **outside** the Suspense
 * boundary, because once a boundary flushes Next has already committed a 200
 * and `notFound()` can only change the body, not the status. That is exactly
 * what a route-level `loading.tsx` did wrong here — it made every dead event
 * URL answer 200 (D-037).
 *
 * Everything expensive then happens *inside* the boundary, so the ticket tear
 * shows while it loads — and it shows inside the site header and footer rather
 * than replacing them, which a `loading.tsx` at this depth could not do.
 */
export default async function EventPage({
  params,
}: PageProps<"/[city]/events/[slug]">) {
  const { city: citySlug, slug } = await params;
  if (!(await eventIsPublic(citySlug, slug))) notFound();

  return (
    <Suspense fallback={<TicketTearScreen label="Opening the event" />}>
      <EventDetail citySlug={citySlug} slug={slug} />
    </Suspense>
  );
}

async function EventDetail({
  citySlug,
  slug,
}: {
  citySlug: string;
  slug: string;
}) {
  const event = await getEventDetail(citySlug, slug);
  // Re-checked rather than assumed: between the existence check above and this
  // query an admin could have pulled the event. Cheap, and the alternative is
  // a crash.
  if (!event) notFound();

  const [breakdown, similar] = await Promise.all([
    getRatingBreakdown(event.id),
    getSimilarEvents(event.cityId, event.categoryId, event.id),
  ]);

  const first = event.sessions[0];
  const last = event.sessions.at(-1);
  const isGarba = event.category.slug === "garba-navratri";

  return (
    <div className="pb-32 lg:pb-10">
      {/* Inside the Suspense boundary, which is fine — a crawler waits for the
          stream to finish, and putting it in `generateMetadata` instead would
          mean re-querying the whole event to build it. */}
      <JsonLd data={eventJsonLd(event, citySlug)} />

      {/* ------------------------------------------------------------ Gallery */}
      {/* The same plate the card uses, deliberately: cover art when the
          organizer has uploaded it, otherwise the navy plate with an oversized
          category glyph. It used to be a category gradient here, which broke
          two things at once — it contradicted D-019 (the gradient is reserved
          for action), and it meant the photo someone tapped on the listing
          vanished the moment the page opened, which reads as the wrong event
          having loaded. */}
      <div className="h-[240px] md:h-[360px] relative overflow-hidden bg-[#16264c]">
        {event.coverImageUrl ? (
          <>
            <Image
              src={event.coverImageUrl}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
            {/* The date chip and the PAUSED pill sit on top of an unknown
                photograph, so they need their own contrast, not luck. */}
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/20"
            />
          </>
        ) : (
          <span
            aria-hidden
            className="absolute -right-8 -bottom-10"
            style={{ color: categoryAccent(event.category.slug) }}
          >
            <CategoryGlyph slug={event.category.slug} size={280} strokeWidth={1.2} />
          </span>
        )}
        {first && (
          <span className="absolute bottom-4 left-4 md:left-12 bg-gold text-ink text-[12px] font-extrabold px-3 py-1.5 rounded-[9px]">
            {formatIstDate(first.startsAt)}
            {last && event.sessions.length > 1 && ` · ${event.sessions.length} nights`}
          </span>
        )}
        {event.status === "PAUSED" && (
          <span className="absolute top-4 left-4 md:left-12">
            <StatusPill status="PAUSED" label="Sales paused" />
          </span>
        )}
      </div>

      <div className="px-4 md:px-6 lg:px-12 -mt-6 relative">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px] items-start">
          {/* ------------------------------------------------------- Main col */}
          <div className="flex flex-col gap-5 min-w-0">
            <section className="bg-surface border border-border rounded-[20px] p-5 md:p-6">
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href={`/${citySlug}/events?category=${event.category.slug}`}
                  className="text-[11.5px] font-extrabold text-primary bg-primary-tint px-3 py-1 rounded-full"
                >
                  {event.category.name}
                </Link>
                {event.festival && (
                  <Link
                    href={`/${citySlug}/festivals/${event.festival.slug}`}
                    className="text-[11.5px] font-extrabold text-gold bg-[#FBF4E6] px-3 py-1 rounded-full"
                  >
                    {event.festival.name}
                  </Link>
                )}
                {first && isTodayIst(first.startsAt) && (
                  <StatusPill tone="success" label="Today" />
                )}
              </div>

              <h1 className="text-[22px] md:text-[28px] tracking-[-0.5px] mt-3 leading-tight">
                {event.title}
              </h1>

              <div className="flex items-center gap-3 mt-2 flex-wrap text-[13px] font-semibold text-ink-muted">
                <Link
                  href={`/${citySlug}/organizers/${event.organizer.slug}`}
                  className="flex items-center gap-1.5 text-ink-muted hover:text-primary"
                >
                  {event.organizer.name}
                  {event.organizer.verified && (
                    <BadgeCheck size={14} className="text-primary" />
                  )}
                </Link>
                {event.ratingCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Star size={13} className="fill-gold text-gold" />
                    <b className="text-ink">{event.ratingAvg.toFixed(1)}</b> (
                    {event.ratingCount.toLocaleString("en-IN")})
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 mt-4">
                <Fact label="DATE">
                  {first ? formatIstDate(first.startsAt) : "TBA"}
                </Fact>
                <Fact label="TIME">
                  {first ? formatIstTime(first.startsAt) : "TBA"}
                </Fact>
                <Fact label="VENUE">
                  {event.venue.name}
                  <span className="block text-ink-muted font-semibold">
                    {event.venue.locality?.name}
                  </span>
                </Fact>
              </div>

              {event.summary && (
                <p className="text-[13.5px] text-body-soft leading-relaxed mt-4">
                  {event.summary}
                </p>
              )}

              <div className="flex gap-2 flex-wrap mt-3">
                {event.languages.map((l) => (
                  <span
                    key={l}
                    className="text-[11px] font-bold bg-divider text-body-soft px-2.5 py-1 rounded-full"
                  >
                    {l}
                  </span>
                ))}
              </div>
            </section>

            {/* Tickets — mobile places the picker inline, below the summary */}
            <div className="lg:hidden">
              <TicketPickerBlock event={event} />
            </div>

            {isGarba && (
              <ZonePlan
                venueName={event.venue.name}
                tiers={event.tiers.map((t) => ({
                  name: t.name,
                  pricePaise: t.pricePaise,
                }))}
              />
            )}

            {/* Schedule */}
            {event.schedule.length > 0 && (
              <Panel title="Schedule">
                <ul className="flex flex-col">
                  {event.schedule.map((s, i) => (
                    <li
                      key={s.id}
                      className={`flex gap-4 py-2.5 ${i > 0 ? "border-t border-divider" : ""}`}
                    >
                      <span className="text-[12.5px] font-extrabold text-primary w-[130px] shrink-0 flex items-center gap-1.5">
                        <Clock size={12} strokeWidth={2.4} />
                        {s.timeLabel}
                      </span>
                      <span className="text-[13px] font-semibold text-body-soft">
                        {s.what}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            {/* Venue & directions */}
            <VenueDirections
              venueName={event.venue.name}
              addressLine={event.venue.addressLine}
              locality={event.venue.locality?.name ?? null}
              lat={Number(event.venue.lat)}
              lng={Number(event.venue.lng)}
              directions={event.venue.directions as Record<string, string> | null}
            />

            {/* Prohibited */}
            <Panel title="Not allowed inside">
              <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PROHIBITED.map((p) => (
                  <li
                    key={p}
                    className="bg-danger-tint text-danger-dark text-[11.5px] font-bold rounded-[10px] px-3 py-2.5 text-center"
                  >
                    {p}
                  </li>
                ))}
              </ul>
            </Panel>

            {/* FAQs */}
            {event.faqs.length > 0 && (
              <Panel title="Good to know">
                <div className="flex flex-col gap-2">
                  {event.faqs.map((f) => (
                    <details
                      key={f.id}
                      className="border border-border rounded-[12px] px-3.5 py-3 group"
                    >
                      <summary className="font-extrabold text-[13.5px] cursor-pointer list-none flex justify-between gap-3">
                        {f.question}
                        <span className="text-ink-muted group-open:rotate-45 transition-transform text-[17px] leading-none">
                          +
                        </span>
                      </summary>
                      <p className="text-[13px] text-body-soft mt-2 leading-relaxed">
                        {f.answer}
                      </p>
                    </details>
                  ))}
                </div>
              </Panel>
            )}

            {/* Terms — refund policy is stated before payment (spec C6.1) */}
            <Panel title="Terms & refunds">
              <div className="text-[13px] text-body-soft leading-relaxed flex flex-col gap-2">
                <p>
                  <b className="text-ink">Refunds: </b>
                  {event.refundPolicy === "NO_REFUND"
                    ? "This organizer does not offer refunds once a booking is confirmed."
                    : event.refundPolicy === "FLEXIBLE_72H"
                      ? "Full refund of the ticket value until 72 hours before the session starts. No refund after that. The booking fee is non-refundable unless the organizer cancels."
                      : "Tiered refund — the exact percentage is shown before you confirm a cancellation."}
                </p>
                <p>
                  <b className="text-ink">Transfers: </b>
                  {event.transfersAllowed
                    ? "One transfer per ticket, up to 2 hours before the session. The original QR stops working immediately."
                    : "Tickets for this event cannot be transferred."}
                </p>
                <p>
                  <b className="text-ink">Entry: </b>Each QR admits one person,
                  once. Re-entry needs a wristband from the help desk.
                </p>
              </div>
            </Panel>

            {/* Reviews */}
            {event.ratingCount > 0 && (
              <Panel title={`Reviews (${event.ratingCount.toLocaleString("en-IN")})`}>
                <div className="grid gap-5 sm:grid-cols-[180px_1fr] items-start">
                  <div>
                    <p className="text-[36px] font-extrabold leading-none tabular">
                      {event.ratingAvg.toFixed(1)}
                    </p>
                    <p className="text-[12px] text-ink-muted font-semibold mt-1">
                      {event.ratingCount.toLocaleString("en-IN")} ratings
                    </p>
                    <div className="flex flex-col gap-1 mt-3">
                      {breakdown.map((b) => (
                        <span key={b.star} className="flex items-center gap-2">
                          <span className="text-[11px] font-bold w-3 tabular">
                            {b.star}
                          </span>
                          <Star size={10} className="fill-gold text-gold" />
                          <span className="h-1.5 flex-1 rounded-full bg-divider overflow-hidden">
                            <span
                              className="block h-full bg-gold rounded-full"
                              style={{ width: `${b.pct}%` }}
                            />
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>

                  <ul className="flex flex-col gap-3">
                    {event.reviews.length === 0 && (
                      <li className="text-[13px] text-ink-muted font-semibold">
                        Ratings are in, but nobody has written a review yet.
                      </li>
                    )}
                    {event.reviews.map((r) => (
                      <li
                        key={r.id}
                        className="border-b border-divider last:border-0 pb-3 last:pb-0"
                      >
                        <div className="flex items-center gap-2">
                          <span className="size-8 rounded-full bg-primary-tint text-primary-dark grid place-items-center text-[12px] font-extrabold">
                            {(r.user.name ?? "?").slice(0, 2).toUpperCase()}
                          </span>
                          <span className="text-[13px] font-extrabold">
                            {r.user.name ?? "Attendee"}
                          </span>
                          <span className="flex items-center gap-0.5 text-[12px] font-bold ml-auto">
                            <Star size={11} className="fill-gold text-gold" />
                            {r.rating}.0
                          </span>
                        </div>
                        {r.body && (
                          <p className="text-[13px] text-body-soft mt-1.5 leading-relaxed">
                            {r.body}
                          </p>
                        )}
                        {r.reply && (
                          <p className="text-[12.5px] text-body-soft bg-divider rounded-[10px] px-3 py-2 mt-2">
                            <b className="text-ink">
                              {event.organizer.name} replied:{" "}
                            </b>
                            {r.reply.body}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </Panel>
            )}

            {/* Similar */}
            {similar.length > 0 && (
              <Panel title="Similar events">
                <div className="grid gap-3 sm:grid-cols-2">
                  {similar.map((s) => (
                    <Link
                      key={s.id}
                      href={`/${citySlug}/events/${s.slug}`}
                      className="se-lift flex gap-3 border border-border rounded-[14px] overflow-hidden text-ink hover:text-ink"
                    >
                      <span
                        className="w-20 shrink-0"
                        style={{ background: `var(--gradient-${s.gradient})` }}
                      />
                      <span className="py-2.5 pr-3 min-w-0">
                        <span className="block text-[13.5px] font-extrabold truncate">
                          {s.title}
                        </span>
                        <span className="block text-[11.5px] text-ink-muted font-semibold">
                          {s.locality}
                        </span>
                        {s.fromPricePaise !== null && (
                          <span className="block text-[12.5px] font-extrabold text-primary mt-0.5">
                            From <Money paise={s.fromPricePaise} />
                          </span>
                        )}
                      </span>
                    </Link>
                  ))}
                </div>
              </Panel>
            )}
          </div>

          {/* ------------------------------------------------------ Ticket rail */}
          <div className="hidden lg:block sticky top-24">
            <TicketPickerBlock event={event} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TicketPickerBlock({
  event,
}: {
  event: Awaited<ReturnType<typeof getEventDetail>> & object;
}) {
  const now = new Date();
  return (
    <TicketPicker
      eventSlug={event.slug}
      sessions={event.sessions
        .filter((s) => s.endsAt >= now)
        .map((s) => ({
          id: s.id,
          sequence: s.sequence,
          name: s.name,
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
          soldOut: false,
        }))}
      tiers={event.tiers.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        tag: t.tag,
        pricePaise: t.pricePaise,
        remaining: tierRemaining(t),
        onSale: t.onSale,
        perUserLimit: t.perUserLimit,
        isSeasonPass: t.isSeasonPass,
      }))}
    />
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg border border-border rounded-[12px] px-3 py-2.5">
      <span className="block text-[10.5px] font-extrabold text-ink-muted tracking-[0.06em]">
        {label}
      </span>
      <span className="block text-[12.5px] font-bold mt-0.5 leading-snug">
        {children}
      </span>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface border border-border rounded-[20px] p-5 md:p-6">
      <h2 className="text-[17px] mb-3.5">{title}</h2>
      {children}
    </section>
  );
}
