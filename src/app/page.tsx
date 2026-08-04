import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCities } from "@/lib/queries/marketplace";

/**
 * The root has no content of its own — the marketplace is city-scoped
 * (spec C2.2). Send visitors to their remembered city, else the default.
 *
 * IP-geo guessing happens client-side on the city page, which then shows the
 * "Ahmedabad? ✓ / Change" banner rather than silently relocating anyone.
 */
export default async function RootPage() {
  const jar = await cookies();
  const remembered = jar.get("city")?.value;

  if (remembered) {
    const cities = await getCities();
    if (cities.some((c) => c.slug === remembered)) redirect(`/${remembered}`);
  }

  redirect(`/${process.env.NEXT_PUBLIC_DEFAULT_CITY ?? "ahmedabad"}`);
}
