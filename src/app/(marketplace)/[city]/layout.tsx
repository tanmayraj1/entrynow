import { notFound } from "next/navigation";
import { MarketplaceShell } from "@/components/marketplace/marketplace-shell";
import { getCityBySlug } from "@/lib/queries/marketplace";

/**
 * City-scoped marketplace shell.
 *
 * Every marketplace query filters by this city (spec C2.2). An unknown or
 * deactivated city 404s rather than silently falling back, so a stale link
 * cannot quietly show the wrong city's events.
 */
export default async function CityLayout({
  children,
  params,
}: LayoutProps<"/[city]">) {
  const { city: citySlug } = await params;
  const city = await getCityBySlug(citySlug);
  if (!city) notFound();

  return <MarketplaceShell citySlug={city.slug}>{children}</MarketplaceShell>;
}
