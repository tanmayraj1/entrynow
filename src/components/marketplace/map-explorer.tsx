"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Building2,
  Compass,
  Landmark,
  Loader2,
  MapPin as MapPinIcon,
  Search,
  Star,
  Ticket,
  X,
} from "lucide-react";
import { Money } from "@/components/ui";
import { cn } from "@/lib/cn";
import { TileMap, type MapViewport } from "./tile-map";
import {
  CategoryGlyph,
  categoryAccent,
} from "@/components/brand/category-glyph";
import {
  boundsForRadius,
  zoomForBounds,
  type Bounds,
  type LatLng,
} from "@/lib/geo";
import type { MapPin, Place, PlaceKind } from "@/lib/queries/map";

/**
 * "Find events near me" — the map-first entry point on the home page.
 *
 * Behaves the way a shopper expects a business map to behave: type a place or
 * drop onto your own location, then pan the map and the list beneath it
 * follows. The list is the accessible twin of the pins, not a decoration —
 * everything reachable by clicking a pin is reachable by tabbing the list, and
 * the pins are real buttons, so the whole surface works without a mouse.
 *
 * Refetches on map idle rather than behind a "Search this area" button: the
 * query is city-scoped and bounded, so keeping the list honest costs less than
 * making the user ask for it.
 */

/** The map box is ~this size on desktop; only used to pick an integer zoom
 *  when framing a search result, where being one level off is invisible. */
const FRAME_W = 620;
const FRAME_H = 520;

const PLACE_ICON: Record<PlaceKind, typeof MapPinIcon> = {
  locality: MapPinIcon,
  venue: Building2,
  event: Ticket,
  landmark: Landmark,
};

export function MapExplorer({
  citySlug,
  cityName,
  cityCenter,
  initialPins,
}: {
  citySlug: string;
  cityName: string;
  cityCenter: LatLng;
  initialPins: MapPin[];
}) {
  const [viewport, setViewport] = useState<MapViewport>({
    center: cityCenter,
    zoom: 12,
  });
  const [pins, setPins] = useState<MapPin[]>(initialPins);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [pickedPlace, setPickedPlace] = useState<Place | null>(null);

  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const fetchSeq = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);

  // ------------------------------------------------------------ pin fetching
  const loadPins = useCallback(
    async (bounds: Bounds, from: LatLng | null) => {
      const seq = ++fetchSeq.current;
      setLoading(true);
      const params = new URLSearchParams({
        city: citySlug,
        north: String(bounds.north),
        south: String(bounds.south),
        east: String(bounds.east),
        west: String(bounds.west),
      });
      if (from) {
        params.set("olat", String(from.lat));
        params.set("olng", String(from.lng));
      }
      try {
        const res = await fetch(`/api/map/events?${params}`);
        const data = (await res.json()) as { pins: MapPin[] };
        // A slow response for a viewport the user has already left must not
        // overwrite the current one.
        if (seq !== fetchSeq.current) return;
        setPins(data.pins);
      } catch {
        if (seq === fetchSeq.current) setPins([]);
      } finally {
        if (seq === fetchSeq.current) setLoading(false);
      }
    },
    [citySlug],
  );

  const onIdle = useCallback(
    (_v: MapViewport, bounds: Bounds) => {
      void loadPins(bounds, origin);
    },
    [loadPins, origin],
  );

  // ----------------------------------------------------------- place search
  // Short queries never reach here — `onChange` clears the list, so this effect
  // only ever fetches and never has to synchronously reset state.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/map/places?city=${citySlug}&q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal },
        );
        const data = (await res.json()) as { places: Place[] };
        setPlaces(data.places);
        setPlacesOpen(true);
      } catch {
        /* aborted or offline — the map still works */
      }
    }, 220);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, citySlug]);

  function frame(center: LatLng, radiusKm: number) {
    setViewport({
      center,
      zoom: zoomForBounds(boundsForRadius(center, radiusKm), FRAME_W, FRAME_H, {
        minZoom: 10,
        maxZoom: 16,
      }),
    });
  }

  function pickPlace(p: Place) {
    setPickedPlace(p);
    setQuery(p.name);
    setPlacesOpen(false);
    setActiveId(null);
    frame({ lat: p.lat, lng: p.lng }, p.radiusKm);
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setLocationError("This browser cannot share a location.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setOrigin(here);
        setPickedPlace(null);
        setQuery("");
        setLocating(false);
        frame(here, 6);
      },
      (err) => {
        setLocating(false);
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — search for a locality instead."
            : "Could not get your location. Search for a locality instead.",
        );
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  }

  function selectPin(id: string) {
    setActiveId((cur) => (cur === id ? null : id));
    listRef.current
      ?.querySelector(`[data-pin-id="${id}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  const active = pins.find((p) => p.id === activeId) ?? null;
  const radiusKm = origin ? 6 : null;

  const listHref = origin
    ? `/${citySlug}/events?view=map&near=1&lat=${origin.lat}&lng=${origin.lng}&radius=6`
    : `/${citySlug}/events?view=map`;

  return (
    <div className="rounded-[20px] border border-border bg-surface overflow-hidden">
      {/* ------------------------------------------------------------- controls */}
      <div className="p-3.5 md:p-4 border-b border-border flex flex-col md:flex-row gap-2.5 md:items-center">
        <div className="relative flex-1 min-w-0">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none"
          />
          <input
            value={query}
            onChange={(e) => {
              const next = e.target.value;
              setQuery(next);
              setPickedPlace(null);
              if (next.trim().length < 2) {
                setPlaces([]);
                setPlacesOpen(false);
              }
            }}
            onFocus={() => places.length > 0 && setPlacesOpen(true)}
            onBlur={() => setTimeout(() => setPlacesOpen(false), 140)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && places[0]) {
                e.preventDefault();
                pickPlace(places[0]);
              }
              if (e.key === "Escape") setPlacesOpen(false);
            }}
            placeholder={`Search a locality, venue or landmark in ${cityName}`}
            aria-label="Search a place on the map"
            aria-expanded={placesOpen}
            role="combobox"
            aria-controls="map-place-options"
            className="w-full rounded-[12px] border border-border bg-bg pl-10 pr-3 py-2.5 text-[14px] outline-none focus:border-primary focus:bg-surface"
          />

          {placesOpen && places.length > 0 && (
            <ul
              id="map-place-options"
              role="listbox"
              className="absolute z-40 left-0 right-0 top-[calc(100%+6px)] bg-surface border border-border rounded-[14px] shadow-[var(--shadow-modal)] overflow-hidden max-h-[300px] overflow-y-auto"
            >
              {places.map((p) => {
                const Icon = PLACE_ICON[p.kind];
                return (
                  <li key={p.id} role="option" aria-selected={false}>
                    <button
                      type="button"
                      // onMouseDown, not onClick: blur fires first otherwise
                      // and closes the list before the click can land.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickPlace(p);
                      }}
                      // Name and subtitle are two lines visually but one
                      // announcement — a screen reader hearing "Satellite"
                      // alone cannot tell a locality from a venue.
                      aria-label={`${p.name} — ${p.subtitle}`}
                      className="w-full text-left px-3.5 py-2.5 flex items-center gap-3 hover:bg-selected-bg cursor-pointer"
                    >
                      <Icon size={15} className="text-primary shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-bold text-ink truncate">
                          {p.name}
                        </span>
                        <span className="block text-[11.5px] text-ink-muted truncate">
                          {p.subtitle}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className={cn(
            "shrink-0 rounded-[12px] px-4 py-2.5 text-[13.5px] font-bold flex items-center justify-center gap-2 cursor-pointer",
            "border transition-colors disabled:opacity-60 disabled:cursor-wait",
            origin
              ? "bg-primary text-white border-primary hover:bg-primary-dark"
              : "bg-surface text-ink border-border hover:border-primary hover:text-primary",
          )}
        >
          {locating ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Compass size={15} strokeWidth={2.4} />
          )}
          {origin ? "Near me · on" : "Use my location"}
        </button>
      </div>

      {locationError && (
        <p
          role="status"
          className="px-4 py-2 text-[12.5px] font-semibold text-danger bg-danger-tint border-b border-border"
        >
          {locationError}
        </p>
      )}

      {/* ------------------------------------------------------------- map + list */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="relative">
          <TileMap
            viewport={viewport}
            onViewportChange={setViewport}
            onIdle={onIdle}
            ariaLabel={`Map of events in ${cityName}. Use arrow keys to pan, plus and minus to zoom.`}
            className="h-[380px] lg:h-[520px]"
            overlay={
              <div className="absolute left-3 top-3 z-30 flex items-center gap-2" data-map-static>
                <span className="bg-surface/95 border border-border rounded-full px-3 py-1.5 text-[12px] font-extrabold text-ink shadow-[0_2px_10px_rgba(22,48,43,.12)] flex items-center gap-1.5">
                  {loading ? (
                    <Loader2 size={12} className="animate-spin text-primary" />
                  ) : (
                    <MapPinIcon size={12} className="text-primary" />
                  )}
                  {loading
                    ? "Searching this area…"
                    : `${pins.length} ${pins.length === 1 ? "event" : "events"} in view`}
                </span>
              </div>
            }
          >
            {({ toPoint, pixelsPerKm }) => (
              <>
                {/* "Near me" radius */}
                {origin && radiusKm && (
                  <>
                    <span
                      aria-hidden
                      className="absolute rounded-full border-2 border-primary/45 bg-primary/10 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
                      style={{
                        ...pxStyle(toPoint(origin)),
                        width: radiusKm * pixelsPerKm * 2,
                        height: radiusKm * pixelsPerKm * 2,
                      }}
                    />
                    <span
                      aria-hidden
                      className="absolute size-3.5 rounded-full bg-primary border-[3px] border-white shadow-md -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none"
                      style={pxStyle(toPoint(origin))}
                    />
                  </>
                )}

                {/* Picked place marker */}
                {pickedPlace && (
                  <span
                    aria-hidden
                    className="absolute size-3 rounded-full bg-ink border-[3px] border-white shadow-md -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none"
                    style={pxStyle(toPoint({ lat: pickedPlace.lat, lng: pickedPlace.lng }))}
                  />
                )}

                {/* Price pins */}
                {pins.map((p) => {
                  const isActive = p.id === activeId;
                  const isHover = p.id === hoverId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      data-map-static
                      onClick={() => selectPin(p.id)}
                      onMouseEnter={() => setHoverId(p.id)}
                      onMouseLeave={() => setHoverId(null)}
                      aria-pressed={isActive}
                      aria-label={`${p.title} at ${p.venueName}${
                        p.fromPricePaise === null
                          ? ", free entry"
                          : `, from ₹${(p.fromPricePaise / 100).toLocaleString("en-IN")}`
                      }`}
                      className={cn(
                        "absolute -translate-x-1/2 -translate-y-full cursor-pointer",
                        "rounded-full px-2.5 py-1 text-[12px] font-extrabold whitespace-nowrap",
                        "shadow-[0_4px_12px_rgba(22,48,43,.3)] transition-transform",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                        isActive
                          ? "bg-ink text-white z-40 scale-110"
                          : isHover
                            ? "bg-primary-dark text-white z-30 scale-105"
                            : "bg-primary text-white z-20 hover:scale-105",
                      )}
                      style={pxStyle(toPoint(p))}
                    >
                      {p.fromPricePaise === null ? (
                        "Free"
                      ) : (
                        <Money paise={p.fromPricePaise} />
                      )}
                    </button>
                  );
                })}

                {/* Business card for the selected pin */}
                {active && (
                  <div
                    data-map-static
                    className="absolute left-1/2 -translate-x-1/2 bottom-4 z-50 w-[min(94%,340px)]"
                  >
                    <PinCard
                      pin={active}
                      citySlug={citySlug}
                      onClose={() => setActiveId(null)}
                    />
                  </div>
                )}
              </>
            )}
          </TileMap>
        </div>

        {/* --------------------------------------------------------------- list */}
        <div className="border-t lg:border-t-0 lg:border-l border-border flex flex-col max-h-[420px] lg:max-h-[520px]">
          <p className="px-4 py-2.5 text-[12px] font-extrabold tracking-[0.06em] text-ink-muted border-b border-border shrink-0">
            {origin ? "NEAREST FIRST" : "IN THIS AREA"}
          </p>

          {pins.length === 0 ? (
            <div className="flex-1 grid place-items-center px-6 py-10 text-center">
              <p className="text-[13.5px] font-semibold text-ink-muted">
                No events in this part of {cityName}. Drag the map or zoom out to
                widen the search.
              </p>
            </div>
          ) : (
            <ul ref={listRef} className="flex-1 overflow-y-auto divide-y divide-border">
              {pins.map((p) => (
                <li key={p.id} data-pin-id={p.id}>
                  <button
                    type="button"
                    onClick={() => selectPin(p.id)}
                    onMouseEnter={() => setHoverId(p.id)}
                    onMouseLeave={() => setHoverId(null)}
                    aria-pressed={p.id === activeId}
                    className={cn(
                      "w-full text-left px-4 py-3 flex gap-3 cursor-pointer",
                      p.id === activeId ? "bg-selected-bg" : "hover:bg-bg",
                    )}
                  >
                    <span
                      aria-hidden
                      className="w-1.5 rounded-full shrink-0"
                      style={{ background: categoryAccent(p.categorySlug) }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-extrabold text-ink truncate">
                        {p.title}
                      </span>
                      <span className="block text-[11.5px] text-ink-muted truncate mt-0.5">
                        {p.localityName ?? p.venueName} · {p.dateLabel}
                        {p.distanceKm !== null && ` · ${p.distanceKm.toFixed(1)} km`}
                      </span>
                      <span className="flex items-center gap-2 mt-1">
                        <span className="text-[12.5px] font-extrabold text-primary">
                          {p.fromPricePaise === null ? (
                            "Free"
                          ) : (
                            <>
                              From <Money paise={p.fromPricePaise} />
                            </>
                          )}
                        </span>
                        {p.chip && (
                          <span className="text-[10.5px] font-extrabold text-ink-muted">
                            {p.chip.label}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Link
            href={listHref}
            className="shrink-0 border-t border-border px-4 py-3 text-[13px] font-bold text-primary hover:bg-selected-bg text-center"
          >
            Open full map search →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PinCard({
  pin,
  citySlug,
  onClose,
}: {
  pin: MapPin;
  citySlug: string;
  onClose: () => void;
}) {
  return (
    <div className="bg-surface border border-border rounded-[16px] shadow-[var(--shadow-modal)] overflow-hidden flex">
      <span
        aria-hidden
        className="w-20 shrink-0 grid place-items-center text-white/90"
        style={{ background: categoryAccent(pin.categorySlug) }}
      >
        <CategoryGlyph slug={pin.categorySlug} size={30} strokeWidth={1.8} />
      </span>
      <div className="p-3.5 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[11px] font-extrabold text-primary bg-primary-tint px-2 py-0.5 rounded-full">
            {pin.categoryName}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close event preview"
            className="text-ink-muted hover:text-ink cursor-pointer shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        <Link
          href={`/${citySlug}/events/${pin.slug}`}
          className="block text-[14.5px] font-extrabold text-ink hover:text-primary mt-1.5 leading-tight"
        >
          {pin.title}
        </Link>

        <p className="text-[11.5px] text-ink-muted font-semibold mt-1 flex items-center gap-1">
          {pin.organizerName}
          {pin.organizerVerified && <BadgeCheck size={12} className="text-primary" />}
        </p>
        <p className="text-[11.5px] text-ink-muted mt-0.5 truncate">
          {pin.venueName} · {pin.dateLabel}
          {pin.distanceKm !== null && ` · ${pin.distanceKm.toFixed(1)} km`}
        </p>

        <div className="flex items-center justify-between mt-2">
          <span className="text-[14px] font-extrabold text-primary">
            {pin.fromPricePaise === null ? (
              "Free"
            ) : (
              <>
                From <Money paise={pin.fromPricePaise} />
              </>
            )}
          </span>
          {pin.ratingCount > 0 && (
            <span className="flex items-center gap-1 text-[11.5px] font-bold">
              <Star size={11} className="fill-gold text-gold" />
              {pin.ratingAvg.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function pxStyle(p: { left: number; top: number }) {
  return { left: `${p.left}px`, top: `${p.top}px` };
}
