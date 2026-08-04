import { MarketplaceShell } from "@/components/marketplace/marketplace-shell";
import { getPreferredCitySlug } from "@/lib/city-context";

/**
 * Public-facing organizer surface — the marketing and onboarding pages.
 *
 * These sit in a `(public)` route group so they can keep the marketplace
 * chrome a visitor already knows, while `(portal)` next door renders the
 * signed-in dashboard under `DashShell` and `data-theme="dash-organizer"`.
 * The group parentheses keep both at `/organizer/…` — the split is a layout
 * boundary, not a URL change.
 */
export default async function OrganizerPublicLayout({
  children,
}: LayoutProps<"/organizer">) {
  const citySlug = await getPreferredCitySlug();
  return <MarketplaceShell citySlug={citySlug}>{children}</MarketplaceShell>;
}
