import { Suspense } from "react";
import { SiteHeader } from "./site-header";
import { DemoBanner } from "./demo-banner";
import { isDemoMode } from "@/lib/demo";
import { SiteFooter } from "./site-footer";
import { MobileDock, DOCK_HEIGHT_PX } from "./mobile-dock";
import {
  getCategories,
  getCities,
  getCityBySlug,
} from "@/lib/queries/marketplace";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

/**
 * Marketplace chrome — header, footer and mobile tab bar around a page.
 *
 * Used by the city-scoped layout AND by the routes that sit outside a city
 * (/tickets, /account, /auth, /legal), so those pages get working navigation
 * instead of a bare document.
 */
export async function MarketplaceShell({
  citySlug,
  children,
}: {
  citySlug: string;
  children: React.ReactNode;
}) {
  const [city, cities, categories, user] = await Promise.all([
    getCityBySlug(citySlug),
    getCities(),
    getCategories(),
    getSessionUser(),
  ]);

  const unreadCount = user
    ? await db.notification.count({ where: { userId: user.id, readAt: null } })
    : 0;

  return (
    <div data-theme="market" className="min-h-screen flex flex-col bg-bg">
      {isDemoMode() && <DemoBanner />}
      <SiteHeader
        citySlug={citySlug}
        cityName={city?.name ?? "Ahmedabad"}
        cities={cities.map((c) => ({ slug: c.slug, name: c.name }))}
        user={user}
        unreadCount={unreadCount}
      />
      {/* The dock is sticky, so it overlays the last screenful. This padding
          is what stops the footer's final rows — and any page's last CTA —
          from sitting permanently underneath it on a phone. */}
      <main
        className="grow"
        style={{ paddingBottom: `var(--dock-pad, ${DOCK_HEIGHT_PX}px)` }}
      >
        {children}
      </main>
      <SiteFooter citySlug={citySlug} />
      {/* Suspense is required, not optional: the dock reads `useSearchParams`
          to highlight the active category, and without a boundary that opts
          every statically-rendered marketplace page out of prerendering. */}
      <Suspense fallback={<div className="lg:hidden h-[56px]" />}>
        <MobileDock
          citySlug={citySlug}
          categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        />
      </Suspense>
    </div>
  );
}
