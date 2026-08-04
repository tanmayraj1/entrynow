import Link from "next/link";
import { Heart } from "lucide-react";
import type { Metadata } from "next";
import { AccountPanel, PanelEmpty } from "@/components/marketplace/account-panel";
import { Button, Money } from "@/components/ui";
import { getSessionUser } from "@/lib/auth/session";
import { getPreferredCitySlug } from "@/lib/city-context";
import { db } from "@/lib/db";
import { fromPricePaise } from "@/lib/availability";
import { formatIstDate } from "@/lib/ist";

export const metadata: Metadata = { title: "Wishlist" };

export default async function WishlistPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const [items, citySlug] = await Promise.all([
    db.wishlistItem.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        event: {
          include: {
            city: { select: { slug: true } },
            category: { select: { gradient: true, name: true } },
            venue: { select: { name: true, locality: { select: { name: true } } } },
            sessions: {
              where: { isActive: true },
              orderBy: { startsAt: "asc" },
              take: 1,
            },
            tiers: true,
          },
        },
      },
    }),
    getPreferredCitySlug(),
  ]);

  return (
    <AccountPanel
      title="Wishlist"
      description="Events you've saved. We'll tell you if one is close to selling out."
    >
      {items.length === 0 ? (
        <>
          <PanelEmpty
            icon={Heart}
            title="Nothing saved yet"
            body="Tap the heart on any event card to keep it here."
          />
          <div className="text-center">
            <Link href={`/${citySlug}/events`}>
              <Button variant="outline" size="sm">
                Browse events
              </Button>
            </Link>
          </div>
        </>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map(({ event }) => (
            <li key={event.id}>
              <Link
                href={`/${event.city.slug}/events/${event.slug}`}
                className="se-lift flex bg-surface border border-border rounded-[14px] overflow-hidden text-ink hover:text-ink"
              >
                <span
                  className="w-20 shrink-0"
                  style={{ background: `var(--gradient-${event.category.gradient})` }}
                />
                <span className="p-3 min-w-0">
                  <span className="block text-[14px] font-extrabold truncate">
                    {event.title}
                  </span>
                  <span className="block text-[11.5px] text-ink-muted font-semibold mt-0.5">
                    {event.venue.locality?.name ?? event.venue.name}
                    {event.sessions[0] &&
                      ` · ${formatIstDate(event.sessions[0].startsAt)}`}
                  </span>
                  {fromPricePaise(event.tiers) !== null && (
                    <span className="block text-[13px] font-extrabold text-primary mt-1">
                      From <Money paise={fromPricePaise(event.tiers)!} />
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AccountPanel>
  );
}
