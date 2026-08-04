import { MarketplaceShell } from "@/components/marketplace/marketplace-shell";
import { getPreferredCitySlug } from "@/lib/city-context";

export default async function BookingLayout({
  children,
}: LayoutProps<"/booking">) {
  const citySlug = await getPreferredCitySlug();
  return <MarketplaceShell citySlug={citySlug}>{children}</MarketplaceShell>;
}
