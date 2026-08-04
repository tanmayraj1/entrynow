/**
 * Web Mercator projection and distance maths.
 *
 * Shared by the map surfaces (client) and the bbox queries (server), so a pin
 * drawn at a point and an event returned for that viewport agree by
 * construction. No dependency on a mapping library: the projection is eleven
 * lines and the tiles are plain `<img>` elements.
 *
 * Tile pixel convention is the standard slippy-map one — 256px tiles, world
 * size 256 * 2^zoom, origin at the top-left (north-west) corner.
 */

export const TILE_SIZE = 256;

/** Mercator is undefined at the poles; every tile scheme clamps here. */
export const MAX_LATITUDE = 85.05112878;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export function clampLat(lat: number): number {
  return Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));
}

/** lat/lng -> absolute world pixel at this zoom. */
export function project({ lat, lng }: LatLng, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  const sinLat = Math.sin((clampLat(lat) * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y:
      (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

/** Absolute world pixel -> lat/lng at this zoom. Inverse of `project`. */
export function unproject(
  x: number,
  y: number,
  zoom: number,
): LatLng {
  const scale = TILE_SIZE * 2 ** zoom;
  const n = Math.PI - 2 * Math.PI * (y / scale);
  return {
    lng: (x / scale) * 360 - 180,
    lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
  };
}

/** Great-circle distance in km. Good enough for a "within N km" facet. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Km per degree of longitude at a latitude — narrows towards the poles. */
export function kmPerDegreeLng(lat: number): number {
  return 111.32 * Math.cos((lat * Math.PI) / 180);
}

/** The lat/lng box a viewport of `width`x`height` px covers around `center`. */
export function boundsForViewport(
  center: LatLng,
  zoom: number,
  width: number,
  height: number,
): Bounds {
  const c = project(center, zoom);
  const nw = unproject(c.x - width / 2, c.y - height / 2, zoom);
  const se = unproject(c.x + width / 2, c.y + height / 2, zoom);
  return { north: nw.lat, west: nw.lng, south: se.lat, east: se.lng };
}

/** A square box `radiusKm` around a point. Used to seed the map from a search. */
export function boundsForRadius(center: LatLng, radiusKm: number): Bounds {
  const dLat = radiusKm / 110.574;
  const dLng = radiusKm / Math.max(kmPerDegreeLng(center.lat), 1e-6);
  return {
    north: clampLat(center.lat + dLat),
    south: clampLat(center.lat - dLat),
    east: center.lng + dLng,
    west: center.lng - dLng,
  };
}

/**
 * The largest integer zoom at which `bounds` still fits inside a viewport.
 * Used when a search result should frame a locality rather than jump to a
 * fixed zoom — a 2 km locality and a 40 km city then both fill the frame.
 */
export function zoomForBounds(
  bounds: Bounds,
  width: number,
  height: number,
  { minZoom = 3, maxZoom = 17 }: { minZoom?: number; maxZoom?: number } = {},
): number {
  const latFraction =
    (mercatorY(bounds.north) - mercatorY(bounds.south)) / Math.PI / 2;
  const lngDiff = bounds.east - bounds.west;
  const lngFraction = (lngDiff < 0 ? lngDiff + 360 : lngDiff) / 360;

  const latZoom = Math.log2(height / TILE_SIZE / Math.max(latFraction, 1e-9));
  const lngZoom = Math.log2(width / TILE_SIZE / Math.max(lngFraction, 1e-9));

  return Math.max(
    minZoom,
    Math.min(maxZoom, Math.floor(Math.min(latZoom, lngZoom))),
  );
}

function mercatorY(lat: number): number {
  const s = Math.sin((clampLat(lat) * Math.PI) / 180);
  return Math.log((1 + s) / (1 - s)) / 2;
}

export function centerOf(bounds: Bounds): LatLng {
  return {
    lat: (bounds.north + bounds.south) / 2,
    lng: (bounds.east + bounds.west) / 2,
  };
}

export function withinBounds(p: LatLng, b: Bounds): boolean {
  return (
    p.lat <= b.north && p.lat >= b.south && p.lng >= b.west && p.lng <= b.east
  );
}
