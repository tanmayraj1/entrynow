"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Star, X } from "lucide-react";
import { Money } from "@/components/ui";
import { cn } from "@/lib/cn";
import { TileMap, type MapViewport } from "./tile-map";
import { centerOf, zoomForBounds, type Bounds, type LatLng } from "@/lib/geo";
import type { EventCardData } from "@/lib/queries/marketplace";

/**
 * Listing "map" view — the same filtered result set as the grid, on real tiles.
 *
 * Unlike the home page's explorer this does NOT refetch on pan: the events
 * shown are exactly the ones the active facets selected, so moving the map
 * must not silently widen the result set past a filter the user set. It frames
 * the results instead, and re-frames whenever the filters change them.
 */

/** Assumed map box, only used to choose an integer zoom that frames the
 *  results; `zoomForBounds` floors, so a wrong guess errs towards zoomed-out. */
const FRAME_W = 900;
const FRAME_H = 560;

export function MapView({
  events,
  citySlug,
  origin,
  radiusKm,
}: {
  events: (EventCardData & { distanceKm: number | null })[];
  citySlug: string;
  origin?: LatLng | null;
  radiusKm?: number;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Frame the whole result set, plus the "near me" origin when there is one.
  const framed = useMemo<MapViewport | null>(() => {
    const points: LatLng[] = events.map((e) => ({ lat: e.lat, lng: e.lng }));
    if (origin) points.push(origin);
    if (points.length === 0) return null;

    const pad = 0.01;
    const bounds: Bounds = {
      north: Math.max(...points.map((p) => p.lat)) + pad,
      south: Math.min(...points.map((p) => p.lat)) - pad,
      east: Math.max(...points.map((p) => p.lng)) + pad,
      west: Math.min(...points.map((p) => p.lng)) - pad,
    };
    return {
      center: centerOf(bounds),
      zoom: zoomForBounds(bounds, FRAME_W, FRAME_H, { minZoom: 9, maxZoom: 16 }),
    };
  }, [events, origin]);

  // Re-frame when a filter change produces a different result set, but leave
  // the user's own panning alone in between. Adjusting state during render
  // (React's documented pattern for "derived from props") rather than in an
  // effect — an effect would paint the old frame first and flash.
  const framedKey = framed
    ? `${framed.center.lat.toFixed(4)},${framed.center.lng.toFixed(4)},${framed.zoom}`
    : "";
  const [panned, setPanned] = useState<MapViewport | null>(null);
  const [seenKey, setSeenKey] = useState(framedKey);
  if (seenKey !== framedKey) {
    setSeenKey(framedKey);
    setPanned(null);
  }
  const viewport = panned ?? framed;

  if (events.length === 0 || !viewport) {
    return (
      <div className="h-[560px] rounded-[18px] border border-border bg-surface grid place-items-center text-center px-6">
        <p className="text-[14px] font-semibold text-ink-muted max-w-sm">
          No events fall inside this area. Widen the radius, or clear the
          location filter.
        </p>
      </div>
    );
  }

  const active = events.find((e) => e.id === activeId) ?? null;

  return (
    <TileMap
      viewport={viewport}
      onViewportChange={setPanned}
      ariaLabel="Map of the events matching your filters. Use arrow keys to pan, plus and minus to zoom."
      className="h-[560px] rounded-[18px] border border-border"
    >
      {({ toPoint, pixelsPerKm }) => (
        <>
          {origin && radiusKm && (
            <>
              <span
                aria-hidden
                className="absolute rounded-full border-2 border-primary/45 bg-primary/10 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
                style={{
                  ...px(toPoint(origin)),
                  width: radiusKm * pixelsPerKm * 2,
                  height: radiusKm * pixelsPerKm * 2,
                }}
              />
              <span
                aria-hidden
                className="absolute size-3.5 rounded-full bg-primary border-[3px] border-white shadow-md -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none"
                style={px(toPoint(origin))}
              />
            </>
          )}

          {events.map((e) => {
            const isActive = e.id === activeId;
            return (
              <button
                key={e.id}
                type="button"
                data-map-static
                onClick={() => setActiveId(isActive ? null : e.id)}
                aria-pressed={isActive}
                aria-label={`${e.title} — ${e.localityName ?? e.venueName}`}
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-full cursor-pointer",
                  "rounded-full px-2.5 py-1 text-[12px] font-extrabold whitespace-nowrap",
                  "shadow-[0_4px_12px_rgba(22,48,43,.3)] transition-transform",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                  isActive
                    ? "bg-ink text-white z-40 scale-110"
                    : "bg-primary text-white hover:scale-105 z-20",
                )}
                style={px(toPoint({ lat: e.lat, lng: e.lng }))}
              >
                {e.fromPricePaise === null ? (
                  "Free"
                ) : (
                  <Money paise={e.fromPricePaise} />
                )}
              </button>
            );
          })}

          {active && (
            <div
              data-map-static
              className="absolute left-1/2 -translate-x-1/2 bottom-4 z-50 w-[min(94%,340px)]"
            >
              <div className="bg-surface border border-border rounded-[16px] shadow-[var(--shadow-modal)] overflow-hidden flex">
                <span
                  aria-hidden
                  className="w-24 shrink-0"
                  style={{ background: `var(--gradient-${active.gradient})` }}
                />
                <div className="p-3.5 flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-extrabold text-primary bg-primary-tint px-2 py-0.5 rounded-full">
                      {active.categoryName}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveId(null)}
                      aria-label="Close event preview"
                      className="text-ink-muted hover:text-ink cursor-pointer shrink-0"
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <Link
                    href={`/${citySlug}/events/${active.slug}`}
                    className="block text-[14.5px] font-extrabold text-ink hover:text-primary mt-1.5 leading-tight"
                  >
                    {active.title}
                  </Link>
                  <p className="text-[11.5px] text-ink-muted font-semibold mt-1 flex items-center gap-1">
                    {active.organizerName}
                    {active.organizerVerified && (
                      <BadgeCheck size={12} className="text-primary" />
                    )}
                  </p>
                  <p className="text-[11.5px] text-ink-muted mt-0.5">
                    {active.localityName ?? active.venueName}
                    {active.distanceKm !== null &&
                      ` · ${active.distanceKm.toFixed(1)} km`}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[14px] font-extrabold text-primary">
                      {active.fromPricePaise === null ? (
                        "Free"
                      ) : (
                        <>
                          From <Money paise={active.fromPricePaise} />
                        </>
                      )}
                    </span>
                    {active.ratingCount > 0 && (
                      <span className="flex items-center gap-1 text-[11.5px] font-bold">
                        <Star size={11} className="fill-gold text-gold" />
                        {active.ratingAvg.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </TileMap>
  );
}

function px(p: { left: number; top: number }) {
  return { left: `${p.left}px`, top: `${p.top}px` };
}
