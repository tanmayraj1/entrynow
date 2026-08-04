import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BadgeCheck, Star } from "lucide-react";
import { EventCard } from "@/components/marketplace/event-card";
import { getViewerContext } from "@/lib/queries/viewer";
import { FollowButton } from "@/components/marketplace/follow-button";
import { StatusPill } from "@/components/ui";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getCityBySlug } from "@/lib/queries/marketplace";
import { searchEvents } from "@/lib/queries/listing";
import { formatIstDate } from "@/lib/ist";

export const revalidate = 300;

async function load(citySlug: string, slug: string) {
  const [city, organizer] = await Promise.all([
    getCityBySlug(citySlug),
    db.organizerProfile.findFirst({
      // SIGNUP / KYC-stage organizers have no public presence.
      where: { slug, status: { in: ["VERIFIED", "SUSPENDED"] } },
    }),
  ]);
  if (!city || !organizer) return null;
  return { city, organizer };
}

export async function generateMetadata({
  params,
}: PageProps<"/[city]/organizers/[slug]">): Promise<Metadata> {
  const { city, slug } = await params;
  const data = await load(city, slug);
  if (!data) return {};
  return {
    title: data.organizer.name,
    description: data.organizer.bio ?? undefined,
  };
}

export default async function OrganizerProfilePage({
  params,
}: PageProps<"/[city]/organizers/[slug]">) {
  const { city: citySlug, slug } = await params;
  const data = await load(citySlug, slug);
  if (!data) notFound();
  const { city, organizer } = data;

  const now = new Date();
  const user = await getSessionUser();
  const isFollowing = user
    ? Boolean(
        await db.follow.findUnique({
          where: {
            userId_organizerId: { userId: user.id, organizerId: organizer.id },
          },
          select: { userId: true },
        }),
      )
    : false;

  const [{ events }, pastCount, reviews, breakdown] = await Promise.all([
    searchEvents(city.id, { sort: "trending" }).then((r) => ({
      events: r.events.filter((e) => e.organizerSlug === slug),
    })),
    db.event.count({
      where: { organizerId: organizer.id, status: "COMPLETED" },
    }),
    db.review.findMany({
      where: { event: { organizerId: organizer.id }, hiddenAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        user: { select: { name: true } },
        event: { select: { title: true, slug: true } },
        reply: { select: { body: true } },
      },
    }),
    db.review
      .groupBy({
        by: ["rating"],
        where: { event: { organizerId: organizer.id }, hiddenAt: null },
        _count: { _all: true },
      })
      .then((rows) => {
        const total = rows.reduce((s, r) => s + r._count._all, 0);
        return [5, 4, 3, 2, 1].map((star) => {
          const count = rows.find((r) => r.rating === star)?._count._all ?? 0;
          return { star, count, pct: total === 0 ? 0 : (count / total) * 100 };
        });
      }),
  ]);

  const upcoming = events.filter(
    (e) => !e.lastSessionAt || e.lastSessionAt >= now,
  );

  const viewer = await getViewerContext();

  return (
    <div className="pb-10">
      {/* Banner */}
      <div className="h-[160px] md:h-[220px] bg-[linear-gradient(135deg,#0A6B59,#16302B)]" />

      <div className="px-4 md:px-6 lg:px-12 -mt-14 relative">
        <div className="bg-surface border border-border rounded-[20px] p-5 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <span className="size-20 rounded-[20px] bg-primary-tint text-primary-dark grid place-items-center text-[26px] font-extrabold border-4 border-surface shrink-0">
              {organizer.name.slice(0, 2).toUpperCase()}
            </span>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[22px] md:text-[26px] tracking-[-0.4px]">
                  {organizer.name}
                </h1>
                {organizer.verified && (
                  <span
                    title="Verified organizer"
                    className="flex items-center gap-1 text-[11.5px] font-extrabold text-primary bg-primary-tint px-2.5 py-1 rounded-full"
                  >
                    <BadgeCheck size={13} />
                    Verified
                  </span>
                )}
                {organizer.status === "SUSPENDED" && (
                  <StatusPill status="SUSPENDED" label="Not currently listing" />
                )}
              </div>
              {organizer.bio && (
                <p className="text-[13.5px] text-body-soft mt-1.5 max-w-2xl leading-relaxed">
                  {organizer.bio}
                </p>
              )}
            </div>

            <FollowButton
              organizerId={organizer.id}
              organizerName={organizer.name}
              initialFollowing={isFollowing}
              signedIn={Boolean(user)}
              returnTo={`/${citySlug}/organizers/${slug}`}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            {[
              {
                v: Number(organizer.ratingAvg).toFixed(1),
                l: `${organizer.ratingCount.toLocaleString("en-IN")} ratings`,
              },
              { v: upcoming.length.toString(), l: "Upcoming events" },
              { v: pastCount.toString(), l: "Events hosted" },
              {
                v: organizer.followerCount.toLocaleString("en-IN"),
                l: "Followers",
              },
            ].map((s) => (
              <div
                key={s.l}
                className="bg-bg border border-border rounded-[12px] px-3.5 py-3"
              >
                <p className="text-[20px] font-extrabold tabular">{s.v}</p>
                <p className="text-[11.5px] text-ink-muted font-semibold">
                  {s.l}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming */}
        <section className="pt-8">
          <h2 className="text-[20px] md:text-[24px] mb-3.5">Upcoming events</h2>
          {upcoming.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((e) => (
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
            <div className="bg-surface border border-border rounded-[18px] px-6 py-12 text-center">
              <p className="text-[14px] font-semibold text-ink-muted">
                {organizer.name} has nothing on sale right now. Follow them to
                hear first when they announce.
              </p>
            </div>
          )}
        </section>

        {/* Reviews */}
        <section className="pt-8">
          <h2 className="text-[20px] md:text-[24px] mb-3.5">
            Reviews ({organizer.ratingCount.toLocaleString("en-IN")})
          </h2>
          <div className="bg-surface border border-border rounded-[20px] p-5 md:p-6 grid gap-6 sm:grid-cols-[200px_1fr] items-start">
            <div>
              <p className="text-[40px] font-extrabold leading-none tabular">
                {Number(organizer.ratingAvg).toFixed(1)}
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
                    <span className="text-[10.5px] text-ink-muted tabular w-6 text-right">
                      {b.count}
                    </span>
                  </span>
                ))}
              </div>
            </div>

            <ul className="flex flex-col gap-3">
              {reviews.length === 0 && (
                <li className="text-[13px] text-ink-muted font-semibold">
                  No written reviews yet. Reviews open to attendees whose ticket
                  was scanned, for 14 days after the event.
                </li>
              )}
              {reviews.map((r) => (
                <li
                  key={r.id}
                  className="border-b border-divider last:border-0 pb-3 last:pb-0"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="size-8 rounded-full bg-primary-tint text-primary-dark grid place-items-center text-[12px] font-extrabold">
                      {(r.user.name ?? "?").slice(0, 2).toUpperCase()}
                    </span>
                    <span className="text-[13px] font-extrabold">
                      {r.user.name ?? "Attendee"}
                    </span>
                    <Link
                      href={`/${citySlug}/events/${r.event.slug}`}
                      className="text-[11.5px] font-semibold text-ink-muted hover:text-primary"
                    >
                      {r.event.title}
                    </Link>
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
                      <b className="text-ink">{organizer.name} replied: </b>
                      {r.reply.body}
                    </p>
                  )}
                  <p className="text-[10.5px] text-ink-muted font-semibold mt-1.5">
                    {formatIstDate(r.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
