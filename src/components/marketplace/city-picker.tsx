"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Crosshair, Loader2, Map, MapPin } from "lucide-react";
import { Input, Modal } from "@/components/ui";
import { CityGlyph } from "@/components/brand/city-glyph";
import { cn } from "@/lib/cn";

export interface PickerCity {
  slug: string;
  name: string;
  /** Used to resolve a browser location to the nearest city we actually serve. */
  lat: number;
  lng: number;
}

/**
 * City switcher, and the first thing a new visitor sees.
 *
 * Changing city rewrites the URL prefix (/ahmedabad/… → /surat/…) and drops
 * locality filters, since a locality from the old city is meaningless in the
 * new one (spec C2.2).
 *
 * Three things this does that the first version did not:
 *
 *   1. **It remembers.** `getPreferredCitySlug` and the root redirect both read
 *      a `city` cookie and its comment said the picker sets it — the picker
 *      never did. Two read sites, no writer, so every visit started from the
 *      configured default no matter what the visitor chose.
 *   2. **It can find you.** "Detect my location" reads the browser position and
 *      snaps to the nearest city *we serve* — never to raw coordinates, because
 *      a marketplace with five cities cannot honour "you are in Nagpur".
 *   3. **It opens itself once.** With no cookie there is no basis for showing
 *      someone Ahmedabad, so a first-time visitor is asked. Once. Dismissing
 *      counts as answering, so it never nags.
 */
export function CityPicker({
  citySlug,
  cityName,
  cities,
  compact,
  /** Opens automatically when the visitor has never chosen a city. */
  autoPrompt = false,
  triggerClassName,
}: {
  citySlug: string;
  cityName: string;
  cities: PickerCity[];
  compact?: boolean;
  autoPrompt?: boolean;
  /**
   * Applied to the trigger button only — never to the modal.
   *
   * The header shows this picker in two places, and the responsive class used
   * to sit on a wrapper around both. `Modal` renders in place rather than
   * through a portal, so hiding the wrapper hid the dialog too: the
   * first-visit prompt would have been `display: none` at whichever width its
   * trigger was not shown.
   */
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // First visit: no stored city, so ask rather than assume. Behind a frame so
  // the server markup and the first client paint agree.
  //
  // The cookie is re-read *inside* the frame, not before scheduling it. A
  // requestAnimationFrame queued while the tab is hidden does not run until
  // the tab is shown again — so checking up front let a stale frame reopen the
  // dialog seconds after the visitor had already dismissed it.
  useEffect(() => {
    if (!autoPrompt) return;
    const raf = requestAnimationFrame(() => {
      if (document.cookie.split("; ").some((c) => c.startsWith("city="))) return;
      setOpen(true);
    });
    return () => cancelAnimationFrame(raf);
  }, [autoPrompt]);

  const filtered = cities.filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function remember(slug: string) {
    // A year, path-wide, Lax. No personal data — a slug we already put in the
    // URL — so there is nothing here a consent banner would need to cover.
    document.cookie = `city=${slug}; path=/; max-age=31536000; samesite=lax`;
  }

  function pick(slug: string) {
    remember(slug);
    setOpen(false);
    if (slug === citySlug) return;
    // Swap only the first path segment; keep the rest of the route so a user
    // browsing /ahmedabad/events lands on /surat/events, not the homepage.
    const rest = pathname.split("/").slice(2).join("/");
    router.push(`/${slug}${rest ? `/${rest}` : ""}`);
  }

  function detect() {
    if (!("geolocation" in navigator)) {
      setLocationError("This browser cannot share a location. Pick a city below.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const nearest = nearestCity(
          pos.coords.latitude,
          pos.coords.longitude,
          cities,
        );
        if (!nearest) {
          setLocationError("We are not live near you yet. Pick a city below.");
          return;
        }
        // Honest about the approximation: snapping Nagpur to Mumbai without
        // saying so would look like the app got the location wrong.
        if (nearest.km > 120) {
          setLocationError(
            `Nothing live right where you are — showing ${nearest.city.name}, the closest city we cover.`,
          );
        }
        pick(nearest.city.slug);
      },
      (err) => {
        setLocating(false);
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. Pick a city below."
            : "Could not get your location. Pick a city below.",
        );
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          compact
            ? "flex items-center gap-1 text-[12px] font-bold text-ink-muted cursor-pointer"
            : "flex items-center gap-1.5 font-bold text-white cursor-pointer",
          triggerClassName,
        )}
      >
        <MapPin
          size={compact ? 12 : 14}
          strokeWidth={2.4}
          className="text-gold"
        />
        {cityName} ▾
      </button>

      <Modal
        open={open}
        onClose={() => {
          // Dismissing is an answer: keep the city they are already on, so the
          // prompt does not reappear on every navigation.
          remember(citySlug);
          setOpen(false);
        }}
        title="Where are you?"
        size="md"
      >
        <Input
          placeholder="Search for your city…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        <button
          type="button"
          onClick={detect}
          disabled={locating}
          className="mt-3 flex items-center gap-2 text-[13.5px] font-bold text-primary hover:text-primary-dark disabled:opacity-60 cursor-pointer"
        >
          {locating ? (
            <Loader2 size={15} strokeWidth={2.6} className="animate-spin" />
          ) : (
            <Crosshair size={15} strokeWidth={2.6} />
          )}
          {locating ? "Finding you…" : "Detect my location"}
        </button>

        {/* The other way to answer "where are you?" — for someone who wants a
            locality or a landmark rather than a whole city. */}
        <Link
          href={`/${citySlug}/events?view=map`}
          onClick={() => setOpen(false)}
          className="mt-2.5 flex items-center gap-2 text-[13.5px] font-bold text-ink-muted hover:text-primary"
        >
          <Map size={15} strokeWidth={2.6} />
          Search on the map instead
        </Link>

        {locationError && (
          <p role="status" className="mt-2 text-[12.5px] font-semibold text-ink-muted">
            {locationError}
          </p>
        )}

        <p className="text-[11.5px] font-extrabold text-ink-muted tracking-[0.1em] mt-5 mb-3">
          POPULAR CITIES
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {filtered.map((c) => {
            const active = c.slug === citySlug;
            return (
              <button
                key={c.slug}
                type="button"
                onClick={() => pick(c.slug)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-[14px] px-1 py-3 cursor-pointer transition-colors",
                  active
                    ? "bg-primary-tint text-primary-dark"
                    : "text-ink-muted hover:bg-selected-bg hover:text-ink",
                )}
              >
                <CityGlyph slug={c.slug} size={40} />
                <span className="text-[12px] font-bold text-center leading-tight">
                  {c.name}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="col-span-full text-[13px] text-ink-muted font-semibold py-4 text-center">
              No city matches “{query}”. We are live in Ahmedabad first.
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}

/**
 * Nearest served city to a raw browser position.
 *
 * Equirectangular approximation, not haversine: over the few hundred km that
 * could separate a visitor from one of our cities the difference is metres,
 * and the answer here is a *ranking*, not a distance anyone sees.
 */
function nearestCity(lat: number, lng: number, cities: PickerCity[]) {
  let best: { city: PickerCity; km: number } | null = null;
  for (const city of cities) {
    const x = (city.lng - lng) * Math.cos(((lat + city.lat) / 2) * (Math.PI / 180));
    const y = city.lat - lat;
    const km = Math.sqrt(x * x + y * y) * 111.32;
    if (!best || km < best.km) best = { city, km };
  }
  return best;
}
