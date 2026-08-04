import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { Logo } from "@/components/ui";
import { CityPicker } from "./city-picker";
import { SearchOverlayTrigger } from "./search-overlay";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Utility bar + navbar, per the Home prototype.
 *
 * Under 768px this collapses to logo + search + bell, and primary navigation
 * moves to the bottom tab bar (mobile responsive rules).
 */
export function SiteHeader({
  citySlug,
  cityName,
  cities,
  user,
  unreadCount = 0,
}: {
  citySlug: string;
  cityName: string;
  cities: { slug: string; name: string }[];
  user: SessionUser | null;
  unreadCount?: number;
}) {
  const nav = [
    { href: `/${citySlug}/events`, label: "Explore events" },
    { href: `/${citySlug}/festivals`, label: "Festivals" },
    { href: "/tickets", label: "My tickets" },
    { href: "/organizer", label: "For organizers" },
  ];

  const initials = (user?.name ?? user?.phone ?? "")
    .replace(/^91/, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <>
      {/* Utility bar — desktop only */}
      <div className="hidden md:flex items-center justify-between bg-ink text-white text-[13px] px-6 lg:px-12 py-2">
        <div className="flex items-center gap-5">
          <CityPicker citySlug={citySlug} cityName={cityName} cities={cities} />
          <a href="mailto:support@entrynow.in" className="text-white/65 hover:text-white">
            support@entrynow.in
          </a>
          <a href="tel:18001213687" className="text-white/65 hover:text-white">
            1800-121-ENTRY
          </a>
        </div>
        <div className="flex items-center gap-4">
          {/* The language switcher lands with i18n; shipping the chrome for it
              now would be a control that silently does nothing. */}
          {user ? (
            <Link href="/account" className="text-white font-semibold hover:text-white">
              {user.name ?? `+${user.phone}`}
            </Link>
          ) : (
            <Link href="/auth" className="text-white font-semibold hover:text-white">
              Login / Signup
            </Link>
          )}
          <Link
            href="/organizer/onboarding"
            className="bg-primary text-white font-bold px-4 py-[7px] rounded-full hover:bg-primary-dark hover:text-white"
          >
            List your event
          </Link>
        </div>
      </div>

      {/* Navbar */}
      <header className="sticky top-0 z-50 bg-surface border-b border-border">
        <div className="flex items-center justify-between px-4 md:px-6 lg:px-12 py-3">
          <div className="flex items-center gap-10">
            <Link href={`/${citySlug}`} aria-label="Entry Now home">
              <Logo size="md" />
            </Link>
            <nav className="hidden lg:flex gap-6 text-[14.5px] font-semibold">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className="text-ink hover:text-primary">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2.5 md:gap-3.5">
            {/* City picker lives in the utility bar on desktop; surface it here
                on mobile where that bar is hidden. */}
            <span className="md:hidden">
              <CityPicker
                citySlug={citySlug}
                cityName={cityName}
                cities={cities}
                compact
              />
            </span>

            <SearchOverlayTrigger citySlug={citySlug}>
              <span className="size-[38px] rounded-full bg-primary-tint grid place-items-center">
                <Search size={17} strokeWidth={2.4} className="text-primary" />
              </span>
            </SearchOverlayTrigger>

            <Link
              href={user ? "/account/notifications" : "/auth?next=/account/notifications"}
              aria-label={
                unreadCount > 0
                  ? `Notifications, ${unreadCount} unread`
                  : "Notifications"
              }
              className="size-[38px] rounded-full bg-primary-tint grid place-items-center relative"
            >
              <Bell size={17} strokeWidth={2.4} className="text-primary" />
              {/* Driven by real unread notifications, not decoration. */}
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2.5 size-[7px] rounded-full bg-danger border-[1.5px] border-surface" />
              )}
            </Link>

            {user ? (
              <Link
                href="/account"
                aria-label="Your account"
                className="hidden md:grid size-[38px] rounded-full bg-primary text-white font-bold text-[14px] place-items-center hover:text-white"
              >
                {initials || " "}
              </Link>
            ) : (
              <Link
                href="/auth"
                className="hidden md:block bg-primary text-white text-[13px] font-extrabold px-4 py-2 rounded-full hover:bg-primary-dark hover:text-white"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
