import Link from "next/link";
import { EmptyStateArt } from "@/components/brand/illustrations";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCityBySlug, getFestivalsWithCounts } from "@/lib/queries/marketplace";
import { formatIstShortDate, istDateKey } from "@/lib/ist";
import { Chip } from "@/components/ui";

export const revalidate = 900;

export async function generateMetadata({
  params,
}: PageProps<"/[city]/festivals">): Promise<Metadata> {
  const { city } = await params;
  const found = await getCityBySlug(city);
  return found
    ? {
        title: `Festivals in ${found.name}`,
        description: `Navratri, Diwali, Uttarayan, Holi — the festival calendar for ${found.name}.`,
      }
    : {};
}

export default async function FestivalsIndexPage({
  params,
}: PageProps<"/[city]/festivals">) {
  const { city: citySlug } = await params;
  const city = await getCityBySlug(citySlug);
  if (!city) notFound();

  const festivals = await getFestivalsWithCounts(city.id);
  const today = istDateKey();

  const upcoming = festivals.filter((f) => istDateKey(f.endsAt) >= today);
  const past = festivals.filter((f) => istDateKey(f.endsAt) < today);

  return (
    <div className="px-4 md:px-6 lg:px-12 py-8">
      <h1 className="text-[24px] md:text-[28px] tracking-[-0.5px]">
        Festivals in {city.name}
      </h1>
      <p className="text-[13.5px] text-ink-muted font-semibold mt-1.5 max-w-2xl">
        The year&apos;s calendar — nine nights of Navratri, Diwali melas,
        Uttarayan on the terraces, and Holi. Pick one to see every event.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-6">
        {upcoming.map((f) => (
          <Link
            key={f.id}
            href={`/${citySlug}/festivals/${f.slug}`}
            className="se-lift rounded-[18px] overflow-hidden border border-border bg-surface text-ink hover:text-ink flex flex-col"
          >
            <div
              className="h-28 relative"
              style={{ background: `var(--gradient-${f.gradient})` }}
            >
              <span className="absolute bottom-2.5 left-3 bg-white/92 text-ink text-[11px] font-extrabold px-2.5 py-1 rounded-[8px]">
                {formatIstShortDate(f.startsAt)} – {formatIstShortDate(f.endsAt)}
              </span>
            </div>
            <div className="p-4 flex flex-col gap-1 grow">
              <h2 className="text-[16.5px]">{f.name}</h2>
              {f.tagline && (
                <p className="text-[12.5px] text-ink-muted font-semibold">
                  {f.tagline}
                </p>
              )}
              <p className="text-[12.5px] font-bold text-primary mt-auto pt-2">
                {f.eventCount} {f.eventCount === 1 ? "event" : "events"} in{" "}
                {city.name}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {upcoming.length === 0 && (
        <div className="bg-surface border border-border rounded-[18px] px-6 py-12 text-center flex flex-col items-center gap-3 mt-6">
          <EmptyStateArt />
          <p className="text-[14px] font-semibold text-ink-muted max-w-md">
            No festivals on the calendar for {city.name} right now.
          </p>
          <Link href={`/${citySlug}/events`}>
            <Chip as="span">Browse all events</Chip>
          </Link>
        </div>
      )}

      {past.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[17px] mb-3">Past festivals</h2>
          <div className="flex gap-2 flex-wrap">
            {past.map((f) => (
              <Link key={f.id} href={`/${citySlug}/festivals/${f.slug}`}>
                <Chip as="span">
                  {f.name} · {formatIstShortDate(f.startsAt)}
                </Chip>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
