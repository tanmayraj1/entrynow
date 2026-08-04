import Link from "next/link";
import Image from "next/image";
import { MapPin, Star, BadgeCheck } from "lucide-react";
import { Money } from "@/components/ui";
import { WishlistButton } from "./wishlist-button";
import { cn } from "@/lib/cn";
import {
  CategoryGlyph,
  categoryAccent,
} from "@/components/brand/category-glyph";
import type { EventCardData } from "@/lib/queries/marketplace";

/**
 * The marketplace event card. Transcribed from the Home prototype: 180px
 * media, gold date badge top-left, urgency ribbon bottom-left, wishlist heart
 * top-right, then category chip + rating, title, organizer, locality, price
 * and a sold-through bar.
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
  // Urgency, not decoration: the bar only leaves the calm ink colour once the
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
        "group se-lift relative bg-surface border border-border rounded-[20px] overflow-hidden",
        "flex flex-col",
        className,
      )}
    >
      <WishlistButton
        eventId={event.id}
        eventTitle={event.title}
        initialWishlisted={wishlisted}
        signedIn={signedIn}
        returnTo={href}
        className="absolute top-3 right-3 z-10"
      />

      <Link href={href} className="flex flex-col grow text-ink hover:text-ink">
        {/* The poster plate. When an organizer has uploaded cover art it wins;
            the fallback is a deliberate navy plate with the category glyph
            oversized behind the type, NOT a gradient block — a wall of
            gradients was the loudest thing on the page and said nothing about
            the event (D-019). */}
        <div className="relative h-[180px] shrink-0 overflow-hidden bg-[#16264c]">
          {event.coverImageUrl ? (
            <Image
              src={event.coverImageUrl}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover"
            />
          ) : (
            <>
              <span
                aria-hidden
                className="absolute -right-5 -bottom-6 text-white/[.13] transition-transform duration-500 ease-out group-hover:scale-105 motion-reduce:transition-none"
                style={{ color: accent }}
              >
                <CategoryGlyph slug={event.categorySlug} size={168} strokeWidth={1.4} />
              </span>
              <span
                aria-hidden
                className="absolute left-4 bottom-4 h-1 w-10 rounded-full"
                style={{ background: accent }}
              />
              <span className="absolute left-4 bottom-8 right-16 text-white/95 text-[13px] font-extrabold leading-tight line-clamp-2">
                {event.categoryName}
              </span>
            </>
          )}

          <span className="absolute top-3 left-3 bg-gold text-ink text-[12.5px] font-extrabold px-2.5 py-1 rounded-[9px]">
            {event.dateLabel}
          </span>

          {event.chip && (
            <span
              className={cn(
                "absolute bottom-3 left-3 text-white text-[11.5px] font-extrabold px-2.5 py-1 rounded-full",
                CHIP_STYLES[event.chip.kind],
              )}
            >
              {event.chip.label}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-[7px] px-[18px] pt-4 pb-[18px] grow">
          <div className="flex justify-between items-center gap-2">
            <span className="text-[11.5px] font-extrabold text-primary bg-primary-tint px-2.5 py-[3px] rounded-full truncate">
              {event.categoryName}
            </span>
            {event.ratingCount > 0 && (
              <span className="flex items-center gap-1 text-[12.5px] font-bold shrink-0">
                <Star size={13} className="fill-gold text-gold" />
                {event.ratingAvg.toFixed(1)}
                <span className="text-ink-muted font-semibold">
                  ({event.ratingCount.toLocaleString("en-IN")})
                </span>
              </span>
            )}
          </div>

          <h3 className="text-[16.5px] leading-[1.3]">{event.title}</h3>

          <span className="flex items-center gap-1.5 text-[12.5px] text-ink-muted font-semibold">
            {event.organizerName}
            {event.organizerVerified && (
              <BadgeCheck size={13} className="text-primary shrink-0" />
            )}
          </span>

          <span className="flex items-center gap-1.5 text-[12.5px] text-ink-muted">
            <MapPin size={12} strokeWidth={2.2} className="shrink-0" />
            {event.localityName ?? event.venueName}
          </span>

          <div className="flex justify-between items-center mt-1 gap-2">
            <span className="text-[15.5px] font-extrabold text-primary">
              {event.fromPricePaise === null ? (
                "Free"
              ) : (
                <>
                  From <Money paise={event.fromPricePaise} />
                </>
              )}
            </span>
            <span className="text-[11.5px] text-ink-muted font-semibold">
              {soldPct}% sold
            </span>
          </div>

          <span className="h-[5px] rounded-[3px] bg-primary-tint overflow-hidden block">
            <span
              className="block h-full rounded-[3px]"
              style={{ width: `${soldPct}%`, background: barColor }}
            />
          </span>
        </div>
      </Link>
    </div>
  );
}
