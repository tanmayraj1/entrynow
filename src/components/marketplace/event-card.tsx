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
 * The marketplace event card — a 2:3 portrait poster.
 *
 * Owner-directed redesign from the original landscape card (180px media +
 * white body): full-bleed portrait image with the metadata on a scrim, the
 * shape every Indian ticketing user already knows from movie posters. The
 * source photographs are landscape, so `object-cover` centre-crops them —
 * accepted deliberately when this was chosen: festival and concert shots
 * keep their subject in the middle.
 *
 * Two consequences of putting text ON the image instead of under it:
 *
 *   - **The title must clamp** (`line-clamp-2`). A body below an image can
 *     grow; an overlay cannot — a long title would climb the poster.
 *   - **The scrim is load-bearing, not decorative.** White text sits on an
 *     unknown photograph; without the gradient it is illegible one card in
 *     three. The same rule as the event page hero.
 *
 * What survives from the old card unchanged: the wishlist heart is a
 * **sibling** of the link (a nested control would be unreachable and a click
 * would navigate — the bug D-018 documents), the gold date badge, the urgency
 * chip vocabulary, and the sold-through bar — now a strip flush with the
 * card's bottom edge.
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
    // The wishlist control must be a sibling of the card link, not a child:
    // nested interactive elements are invalid, unreachable by keyboard, and a
    // click on the heart would navigate instead of saving.
    <div
      className={cn(
        "group se-lift relative rounded-[18px] overflow-hidden bg-[#16264c]",
        className,
      )}
    >
      <WishlistButton
        eventId={event.id}
        eventTitle={event.title}
        initialWishlisted={wishlisted}
        signedIn={signedIn}
        returnTo={href}
        className="absolute top-2.5 right-2.5 z-10"
      />

      <Link
        href={href}
        className="relative block aspect-[2/3] text-white hover:text-white"
      >
        {event.coverImageUrl ? (
          <Image
            src={event.coverImageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 45vw, 220px"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none"
          />
        ) : (
          // No cover art: the navy plate with the oversized category glyph —
          // deliberately NOT a gradient block (D-019).
          <span
            aria-hidden
            className="absolute -right-8 top-1/4 text-white/[.13]"
            style={{ color: accent }}
          >
            <CategoryGlyph slug={event.categorySlug} size={220} strokeWidth={1.3} />
          </span>
        )}

        {/* Load-bearing scrim — the metadata below sits on an unknown photo. */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/90 via-black/45 to-transparent"
        />

        <span className="absolute top-2.5 left-2.5 bg-gold text-ink text-[11.5px] font-extrabold px-2 py-[3px] rounded-[8px]">
          {event.dateLabel}
        </span>

        {/* Bottom-anchored metadata stack. */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 px-3.5 pb-4">
          {event.chip && (
            <span
              className={cn(
                "self-start text-white text-[10.5px] font-extrabold px-2 py-[3px] rounded-full mb-0.5",
                CHIP_STYLES[event.chip.kind],
              )}
            >
              {event.chip.label}
            </span>
          )}

          <h3 className="text-[14.5px] font-extrabold leading-[1.25] line-clamp-2 [text-shadow:0_1px_10px_rgba(0,0,0,.5)]">
            {event.title}
          </h3>

          <span className="flex items-center gap-1 text-[11.5px] text-white/75 font-semibold">
            <MapPin size={11} strokeWidth={2.2} className="shrink-0" />
            <span className="truncate">
              {event.localityName ?? event.venueName}
            </span>
          </span>

          <div className="flex justify-between items-center gap-2 mt-0.5">
            <span className="text-[13.5px] font-extrabold">
              {event.fromPricePaise === null ? (
                "Free"
              ) : (
                <>
                  <span className="text-white/70 font-semibold text-[11px]">
                    From{" "}
                  </span>
                  <Money paise={event.fromPricePaise} />
                </>
              )}
            </span>
            {event.ratingCount > 0 && (
              <span className="flex items-center gap-1 text-[11.5px] font-bold shrink-0">
                <Star size={11} className="fill-gold text-gold" />
                {event.ratingAvg.toFixed(1)}
              </span>
            )}
          </div>
        </div>

        {/* Sold-through strip, flush with the card's bottom edge. */}
        <span className="absolute inset-x-0 bottom-0 h-[4px] bg-white/20 block">
          <span
            className="block h-full"
            style={{ width: `${soldPct}%`, background: barColor }}
          />
        </span>
      </Link>
    </div>
  );
}
