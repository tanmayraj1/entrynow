import "server-only";

import { cookies } from "next/headers";
import { getCities } from "./queries/marketplace";

/**
 * The city to use on routes that are not themselves city-scoped — /tickets,
 * /account, /legal and friends still need working header and footer links.
 *
 * Order: the city the visitor last chose (cookie, set by the city picker),
 * then the configured default, then whatever is first in the table. Never
 * throws, because a missing cookie must not 500 a legal page.
 */
export async function getPreferredCitySlug(): Promise<string> {
  const fallback = process.env.NEXT_PUBLIC_DEFAULT_CITY ?? "ahmedabad";

  const jar = await cookies();
  const remembered = jar.get("city")?.value;

  const cities = await getCities();
  if (remembered && cities.some((c) => c.slug === remembered)) return remembered;
  if (cities.some((c) => c.slug === fallback)) return fallback;
  return cities[0]?.slug ?? fallback;
}
