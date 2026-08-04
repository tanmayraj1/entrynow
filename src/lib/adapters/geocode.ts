import "server-only";

import type { LatLng } from "@/lib/geo";

/**
 * Geocode adapter — free text to a point on the map.
 *
 * Resolved by `GEOCODE_DRIVER`. The map's "Where" box searches the catalogue
 * first (localities, venues and events are what a shopper actually wants), and
 * only falls through to this adapter for landmarks the catalogue does not
 * know: "Riverfront", "Kankaria Lake", a pincode.
 *
 * The sandbox driver is a small in-process gazetteer of Ahmedabad landmarks —
 * enough that the whole search path works with no vendor account and no
 * network, per decision D-008. `nominatim` is a real geocoder needing no key;
 * google/mapbox stay unconfigured until credentials exist.
 */

export interface GeocodeResult {
  /** Display name — "Sabarmati Riverfront". */
  name: string;
  /** Disambiguating line — "Landmark · Ahmedabad". */
  subtitle: string;
  center: LatLng;
  /** How wide the match is, so the map can frame it rather than guess a zoom. */
  radiusKm: number;
}

export interface GeocodeAdapter {
  readonly name: string;
  search(query: string, near?: LatLng): Promise<GeocodeResult[]>;
}

/** Landmarks a local would name that are not venues in the catalogue. */
const AHMEDABAD_GAZETTEER: (GeocodeResult & { keywords: string[] })[] = [
  {
    name: "Sabarmati Riverfront",
    subtitle: "Landmark · Ahmedabad",
    center: { lat: 23.0225, lng: 72.5714 },
    radiusKm: 4,
    keywords: ["riverfront", "sabarmati", "river"],
  },
  {
    name: "Kankaria Lake",
    subtitle: "Landmark · Ahmedabad",
    center: { lat: 22.9964, lng: 72.6013 },
    radiusKm: 2,
    keywords: ["kankaria", "lake"],
  },
  {
    name: "SG Highway",
    subtitle: "Corridor · Ahmedabad",
    center: { lat: 23.0301, lng: 72.5078 },
    radiusKm: 7,
    keywords: ["sg highway", "sg", "highway", "sarkhej gandhinagar"],
  },
  {
    name: "Ahmedabad Airport (SVPIA)",
    subtitle: "Airport · Hansol",
    center: { lat: 23.0722, lng: 72.6266 },
    radiusKm: 3,
    keywords: ["airport", "svpia", "hansol", "terminal"],
  },
  {
    name: "Kalupur Railway Station",
    subtitle: "Station · Ahmedabad",
    center: { lat: 23.0272, lng: 72.6009 },
    radiusKm: 2,
    keywords: ["kalupur", "railway", "station", "junction"],
  },
  {
    name: "GIFT City",
    subtitle: "Business district · Gandhinagar",
    center: { lat: 23.1602, lng: 72.6836 },
    radiusKm: 3,
    keywords: ["gift", "gift city", "gandhinagar"],
  },
  {
    name: "Old City (Bhadra)",
    subtitle: "Heritage quarter · Ahmedabad",
    center: { lat: 23.0225, lng: 72.5873 },
    radiusKm: 3,
    keywords: ["old city", "bhadra", "heritage", "pol", "walled city"],
  },
];

const sandbox: GeocodeAdapter = {
  name: "sandbox",
  async search(query) {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return AHMEDABAD_GAZETTEER.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.keywords.some((k) => k.includes(q) || q.includes(k)),
    )
      .slice(0, 5)
      .map(({ name, subtitle, center, radiusKm }) => ({
        name,
        subtitle,
        center,
        radiusKm,
      }));
  },
};

/**
 * OpenStreetMap's geocoder. Free and keyless, but rate-limited to ~1 req/s and
 * it requires an identifying User-Agent, so it is opt-in rather than default.
 */
const nominatim: GeocodeAdapter = {
  name: "nominatim",
  async search(query, near) {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "5");
    url.searchParams.set("countrycodes", "in");
    if (near) {
      // Bias, not a filter — a viewbox alone would hide an exact match that
      // happens to sit just outside the current frame.
      url.searchParams.set(
        "viewbox",
        `${near.lng - 0.6},${near.lat + 0.6},${near.lng + 0.6},${near.lat - 0.6}`,
      );
    }

    const res = await fetch(url, {
      headers: {
        "User-Agent": `EntryNow/1.0 (${process.env.NEXT_PUBLIC_APP_URL ?? "localhost"})`,
        "Accept-Language": "en-IN,en",
      },
      // Place names change slowly; a day of caching keeps us inside the
      // provider's usage policy.
      next: { revalidate: 86_400 },
    });
    if (!res.ok) return [];

    const rows = (await res.json()) as {
      display_name: string;
      name?: string;
      lat: string;
      lon: string;
      type?: string;
      boundingbox?: [string, string, string, string];
    }[];

    return rows.map((r) => {
      const parts = r.display_name.split(",").map((s) => s.trim());
      const bb = r.boundingbox;
      const radiusKm = bb
        ? Math.max(0.5, (Number(bb[1]) - Number(bb[0])) * 110.574) / 2
        : 2;
      return {
        name: r.name || parts[0],
        subtitle: parts.slice(1, 3).join(", ") || (r.type ?? "Place"),
        center: { lat: Number(r.lat), lng: Number(r.lon) },
        radiusKm,
      };
    });
  },
};

const notConfigured = (name: string): GeocodeAdapter => ({
  name,
  async search() {
    // Geocoding is an assist, not a gate: the catalogue search still answers.
    // Throwing here would take the whole "Where" box down over a missing key.
    console.warn(
      `[geocode] driver "${name}" has no credentials configured — ` +
        `falling back to catalogue-only search. Set GEOCODE_DRIVER=sandbox locally.`,
    );
    return [];
  },
});

export function getGeocodeAdapter(): GeocodeAdapter {
  const driver = process.env.GEOCODE_DRIVER ?? "sandbox";
  switch (driver) {
    case "sandbox":
      return sandbox;
    case "nominatim":
      return nominatim;
    default:
      return notConfigured(driver);
  }
}
