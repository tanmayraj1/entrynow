/**
 * Turning what someone actually pastes into a point on the map.
 *
 * An organizer adding a venue has the location in one of three forms, and the
 * one they reach for is almost never a pair of decimals: it is the Google Maps
 * link they already have open. So this accepts all of them and normalises.
 *
 * Pure and dependency-free so it can be unit-tested without a database.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Roughly the span of a large metro plus its outskirts. */
export const MAX_VENUE_DISTANCE_KM = 150;

/**
 * Parse coordinates out of a decimal pair **or** a Google/Apple Maps URL.
 *
 * The three URL shapes that matter, in the order they are tried:
 *
 *   - `@23.0225,72.5714,17z` — what the address bar shows while panning. This
 *     is the *camera*, which is why it is tried last: it is the least precise.
 *   - `!3d23.0225!4d72.5714` — the place's own coordinates, embedded in a
 *     shared place URL. The most accurate of the three.
 *   - `?q=23.0225,72.5714` / `?ll=` / `?daddr=` — an explicit point.
 *
 * Returns `null` rather than throwing: a bad paste is a validation message,
 * not an exception.
 */
export function parseLatLng(raw: string): LatLng | null {
  const input = raw.trim();
  if (!input) return null;

  const patterns = [
    // Place coordinates in a Maps share URL — most accurate, so tried first.
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    // An explicit point parameter.
    /[?&](?:q|ll|daddr|destination)=(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/,
    // The camera position.
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    // A bare "lat, lng" pair. Anchored, so it cannot match two numbers that
    // happen to sit inside a longer string.
    /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/,
  ];

  for (const re of patterns) {
    const m = re.exec(input);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (isFinite(lat) && isFinite(lng) && isValidLatLng({ lat, lng })) {
      return { lat, lng };
    }
  }
  return null;
}

export function isValidLatLng(p: LatLng): boolean {
  return p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180;
}

/**
 * Equirectangular approximation — the same one the city picker uses. Over the
 * few hundred kilometres this guards, the error against haversine is metres,
 * and the answer is a yes/no rather than a distance anyone reads.
 */
export function distanceKm(a: LatLng, b: LatLng): number {
  const x =
    (b.lng - a.lng) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const y = b.lat - a.lat;
  return Math.sqrt(x * x + y * y) * 111.32;
}

/**
 * Is this point plausibly in the city the organizer said it was in?
 *
 * A transposed pair (`72.57, 23.02` instead of `23.02, 72.57`) is a valid
 * coordinate and lands in the Arabian Sea, so range-checking alone catches
 * nothing. Comparing against the city is what turns a silent wrong pin into a
 * validation error.
 */
export function isNearCity(point: LatLng, city: LatLng): boolean {
  return distanceKm(point, city) <= MAX_VENUE_DISTANCE_KM;
}
