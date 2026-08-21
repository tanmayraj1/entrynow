import Link from "next/link";
import Image from "next/image";
import { MapPin, Star } from "lucide-react";
import { Money } from "@/components/ui";
import { WishlistButton } from "./wishlist-button";
import { cn } from "@/lib/cn";
import {
  CategoryGlyph,
  categoryAccent,
} from "@/components/brand/category-glyph";
import type { EventCardData } from "@/lib/queries/marketplace";

/**
 * The marketplace event card — a 2:3 poster with its text underneath.
 *
 * The first portrait version put every field on a scrim over the photograph.
 * It read well on a dark concert shot and badly on a bright daytime one, which
 * is the problem with overlaying text on artwork you do not control: the
 * legibility depends on the picture. So only the things that are *chrome* stay
 * on the image — the date, the rating, the urgency chip, the wishlist heart,
 * each with its own opaque backing — and everything that is *content* moved
 * below it onto the page background, where contrast is guaranteed.
 *
 * There is deliberately no card border or panel around the text. The poster is
 * the object; a box drawn around the caption would compete with it.
 *
 * The wishlist heart stays a **sibling** of the link rather than a child:
 * nested interactive elements are invalid, unreachable by keyboard, and a tap
 * on the heart would navigate instead of saving.
 */

const CHIP_STYLES: Record<string, string> = {
  SOLD_OUT: "bg-ink-muted",
  FEW_LEFT: "bg-danger",
  FILLING_FAST: "bg-accent",
  TODAY: "bg-primary",
};

export function EventCard({
  event,
  citySlug,
  className,
  signedIn = false,
  wishlisted = false,
}: {
  event: EventCardData;
  citySlug: string;
  className?: string;
  signedIn?: boolean;
  wishlisted?: boolean;
}) {
  const soldPct = Math.round(event.soldRatio * 100);
  // Urgency, not decoration: the bar only leaves the calm colour once the
  // number it encodes is actually urgent.
  const barColor =
    event.soldRatio >= 0.9
      ? "var(--color-danger)"
      : event.soldRatio >= 0.7
        ? "var(--color-accent)"
        : "var(--color-primary)";

  const accent = categoryAccent(event.categorySlug);
  const href = `/${citySlug}/events/${event.slug}`;

  return (
    <div className={cn("group relative flex flex-col", className)}>
      <WishlistButton
        eventId={event.id}
        eventTitle={event.title}
        initialWishlisted={wishlisted}
        signedIn={signedIn}
        returnTo={href}
        className="absolute top-2.5 right-2.5 z-10"
      />

      <Link href={href} className="flex flex-col text-ink hover:text-ink">
        {/* The poster. `se-lift` is on this block alone — the caption below
            should not float with it. */}
        <div className="se-lift relative aspect-[2/3] rounded-[14px] overflow-hidden bg-[#16264c]">
          {event.coverImageUrl ? (
            <Image
              src={event.coverImageUrl}
              alt=""
              fill
              sizes="(max-width: 640px) 45vw, 220px"
              className="object-cover"
            />
          ) : (
            // No cover art: the navy plate with an oversized category glyph —
            // deliberately not a gradient block (D-019).
            <span
              aria-hidden
              className="absolute -right-8 top-1/4"
              style={{ color: accent }}
            >
              <CategoryGlyph slug={event.categorySlug} size={220} strokeWidth={1.3} />
            </span>
          )}

          <span className="absolute top-2.5 left-2.5 bg-gold text-ink text-[11.5px] font-extrabold px-2 py-[3px] rounded-[8px]">
            {event.dateLabel}
          </span>

          {event.chip && (
            <span
              className={cn(
                "absolute left-2.5 text-white text-[10.5px] font-extrabold px-2 py-[3px] rounded-full",
                // Sits above the rating strip when there is one.
                event.ratingCount > 0 ? "bottom-[38px]" : "bottom-2.5",
                CHIP_STYLES[event.chip.kind],
              )}
            >
              {event.chip.label}
            </span>
          )}

          {/* Rating rides the poster on its own opaque bar, so it never has to
              compete with whatever the photograph is doing. */}
          {event.ratingCount > 0 && (
            <div className="absolute inset-x-0 bottom-0 bg-black/72 backdrop-blur-[2px] px-2.5 py-1.5 flex items-center gap-1.5">
              <Star size={12} className="fill-gold text-gold shrink-0" />
              <span className="text-white text-[12px] font-extrabold">
                {event.ratingAvg.toFixed(1)}
              </span>
              <span className="text-white/70 text-[11px] font-semibold">
                ({event.ratingCount.toLocaleString("en-IN")})
              </span>
            </div>
          )}

          {/* Sold-through, hairline on the poster's bottom edge. */}
          <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25 block">
            <span
              className="block h-full"
              style={{ width: `${soldPct}%`, background: barColor }}
            />
          </span>
        </div>

        {/* Caption — on the page, not on the picture. */}
        <div className="pt-2.5 flex flex-col gap-[3px]">
          <h3 className="text-[14px] font-extrabold leading-[1.3] line-clamp-2">
            {event.title}
          </h3>
          <span className="flex items-center gap-1 text-[12px] text-ink-muted font-semibold">
            <MapPin size={11} strokeWidth={2.2} className="shrink-0" />
            <span className="truncate">
              {event.localityName ?? event.venueName}
            </span>
          </span>
          <span className="text-[13px] font-extrabold text-ink">
            {event.fromPricePaise === null ? (
              "Free"
            ) : (
              <>
                <span className="text-ink-muted font-semibold text-[11.5px]">
                  From{" "}
                </span>
                <Money paise={event.fromPricePaise} />
              </>
            )}
          </span>
        </div>
      </Link>
    </div>
  );
}
