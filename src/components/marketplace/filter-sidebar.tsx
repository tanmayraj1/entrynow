"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { BadgeCheck, LocateFixed, X } from "lucide-react";
import { Button } from "@/components/ui";
import { inr, toPaise } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { ListingResult } from "@/lib/queries/listing";

/**
 * Facet sidebar. Every change writes to the URL and lets the server component
 * re-query, so the result count is always authoritative and the view is
 * shareable. Facets combine with AND.
 */
export function FilterSidebar({
  facets,
  total,
  onClose,
}: {
  facets: ListingResult["facets"];
  total: number;
  onClose?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [geoError, setGeoError] = useState<string | null>(null);

  const push = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      startTransition(() =>
        router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, {
          scroll: false,
        }),
      );
    },
    [params, pathname, router],
  );

  const toggleCsv = (key: string, value: string) =>
    push((p) => {
      const cur = (p.get(key) ?? "").split(",").filter(Boolean);
      const next = cur.includes(value)
        ? cur.filter((v) => v !== value)
        : [...cur, value];
      if (next.length) p.set(key, next.join(",")); else p.delete(key);
    });

  const setOne = (key: string, value: string | null) =>
    push((p) => (value ? p.set(key, value) : p.delete(key)));

  const has = (key: string, value: string) =>
    (params.get(key) ?? "").split(",").includes(value);

  const maxPriceRupees = Number(
    params.get("maxPrice") ?? facets.priceMaxPaise / 100,
  );

  // A radius means nothing without a position to measure from.
  const hasCoords = Boolean(params.get("lat") && params.get("lng"));

  /** "Near me": ask the browser, keep coordinates in the URL for this
   *  navigation only — never stored server-side (spec C2.3). */
  function useMyLocation() {
    setGeoError(null);
    if (!("geolocation" in navigator)) {
      setGeoError("This browser can't share your location. Pick a locality instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        push((p) => {
          p.set("near", "1");
          p.set("lat", pos.coords.latitude.toFixed(5));
          p.set("lng", pos.coords.longitude.toFixed(5));
          if (!p.get("radius")) p.set("radius", "10");
        }),
      () =>
        setGeoError(
          "Location permission denied. Pick a locality below to filter by area.",
        ),
    );
  }

  const activeCount = [
    "category",
    "locality",
    "size",
    "language",
    "maxPrice",
    "verified",
    "when",
    "near",
    "q",
  ].filter((k) => params.get(k)).length;

  return (
    <aside
      className={cn(
        "bg-surface border border-border rounded-[18px] p-5 flex flex-col gap-6",
        pending && "opacity-70",
      )}
      aria-busy={pending}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[16.5px]">Filters</h2>
          <p className="text-[12px] text-ink-muted font-semibold mt-0.5 tabular">
            {total} {total === 1 ? "event" : "events"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => startTransition(() => router.replace(pathname))}
              className="text-[12px] font-bold text-primary cursor-pointer"
            >
              Reset
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close filters"
              className="lg:hidden text-ink-muted cursor-pointer"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Near me */}
      <Group title="Near me">
        <Button variant="outline" size="sm" fullWidth onClick={useMyLocation}>
          <LocateFixed size={14} strokeWidth={2.4} />
          Use my location
        </Button>
        {geoError && (
          <p className="text-[11.5px] font-semibold text-danger mt-2">
            {geoError}
          </p>
        )}
        {/* `?near=1` alone means the chip was clicked but the browser has not
            granted a position yet — say so, rather than showing the radius
            control as though a location were applied. */}
        {params.get("near") === "1" && !hasCoords && !geoError && (
          <p className="text-[11.5px] font-semibold text-ink-muted mt-2">
            Share your location to sort these by distance.
          </p>
        )}

        {hasCoords && (
          <div className="mt-3">
            <RangeRow
              label="Radius"
              value={`${params.get("radius") ?? 10} km`}
            />
            <input
              type="range"
              min={1}
              max={40}
              step={1}
              value={Number(params.get("radius") ?? 10)}
              onChange={(e) => setOne("radius", e.target.value)}
              className="w-full accent-[var(--color-primary)]"
            />
            <button
              type="button"
              onClick={() =>
                push((p) => {
                  ["near", "lat", "lng", "radius"].forEach((k) => p.delete(k));
                })
              }
              className="text-[11.5px] font-bold text-primary mt-1 cursor-pointer"
            >
              Clear location
            </button>
          </div>
        )}
      </Group>

      {/* When */}
      <Group title="When">
        <div className="flex flex-wrap gap-2">
          {[
            { k: "any", l: "Any date" },
            { k: "today", l: "Today" },
            { k: "weekend", l: "This weekend" },
            { k: "month", l: "Next 30 days" },
          ].map((o) => {
            const active = (params.get("when") ?? "any") === o.k;
            return (
              <FacetChip
                key={o.k}
                active={active}
                onClick={() => setOne("when", o.k === "any" ? null : o.k)}
              >
                {o.l}
              </FacetChip>
            );
          })}
        </div>
      </Group>

      {/* Category */}
      <Group title="Category">
        <ul className="flex flex-col gap-1.5">
          {facets.categories.map((c) => (
            <CheckRow
              key={c.slug}
              label={c.name}
              count={c.count}
              checked={params.get("category") === c.slug}
              onChange={() =>
                setOne("category", params.get("category") === c.slug ? null : c.slug)
              }
            />
          ))}
        </ul>
      </Group>

      {/* Price */}
      <Group title="Price">
        <RangeRow
          label="Up to"
          value={inr(toPaise(maxPriceRupees))}
        />
        <input
          type="range"
          min={100}
          max={facets.priceMaxPaise / 100}
          step={50}
          value={maxPriceRupees}
          onChange={(e) => setOne("maxPrice", e.target.value)}
          className="w-full accent-[var(--color-primary)]"
        />
        <div className="flex justify-between text-[11px] text-ink-muted font-semibold">
          <span>{inr(toPaise(100))}</span>
          <span>{inr(facets.priceMaxPaise)}</span>
        </div>
      </Group>

      {/* Locality */}
      <Group title="Locality">
        <ul className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-1">
          {facets.localities.map((l) => (
            <CheckRow
              key={l.slug}
              label={l.name}
              count={l.count}
              checked={params.get("locality") === l.slug}
              onChange={() =>
                setOne("locality", params.get("locality") === l.slug ? null : l.slug)
              }
            />
          ))}
        </ul>
      </Group>

      {/* Size */}
      <Group title="Event size">
        <div className="flex flex-wrap gap-2">
          {facets.sizes.map((s) => (
            <FacetChip
              key={s.key}
              active={has("size", s.key)}
              onClick={() => toggleCsv("size", s.key)}
            >
              {s.key[0] + s.key.slice(1).toLowerCase()} ({s.count})
            </FacetChip>
          ))}
        </div>
      </Group>

      {/* Language */}
      <Group title="Language">
        <div className="flex flex-wrap gap-2">
          {facets.languages.map((l) => (
            <FacetChip
              key={l.name}
              active={has("language", l.name)}
              onClick={() => toggleCsv("language", l.name)}
            >
              {l.name} ({l.count})
            </FacetChip>
          ))}
        </div>
      </Group>

      {/* Verified */}
      <Group title="Organizer">
        <CheckRow
          label={
            <span className="flex items-center gap-1.5">
              Verified only
              <BadgeCheck size={13} className="text-primary" />
            </span>
          }
          checked={params.get("verified") === "1"}
          onChange={() =>
            setOne("verified", params.get("verified") === "1" ? null : "1")
          }
        />
      </Group>
    </aside>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-divider pt-4 first-of-type:border-0 first-of-type:pt-0">
      <h3 className="text-[12px] font-extrabold tracking-[0.06em] text-ink-muted mb-2.5">
        {title.toUpperCase()}
      </h3>
      {children}
    </section>
  );
}

function RangeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline mb-1.5">
      <span className="text-[12.5px] font-semibold text-body-soft">{label}</span>
      <span className="text-[13px] font-extrabold tabular">{value}</span>
    </div>
  );
}

function FacetChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "text-[11.5px] font-bold px-3 py-1.5 rounded-full cursor-pointer border transition-colors",
        active
          ? "bg-primary border-primary text-white"
          : "bg-surface border-border text-body-soft hover:border-primary hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}

function CheckRow({
  label,
  count,
  checked,
  onChange,
}: {
  label: React.ReactNode;
  count?: number;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <li>
      <label className="flex items-center gap-2.5 cursor-pointer py-0.5 group">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="size-4 accent-[var(--color-primary)] cursor-pointer"
        />
        <span className="text-[13px] font-semibold flex-1 group-hover:text-primary">
          {label}
        </span>
        {count !== undefined && (
          <span className="text-[11.5px] text-ink-muted font-semibold tabular">
            {count}
          </span>
        )}
      </label>
    </li>
  );
}
