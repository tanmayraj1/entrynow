"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { MapPin } from "lucide-react";
import { Input, Modal } from "@/components/ui";

/**
 * City switcher. Changing city rewrites the URL prefix (/ahmedabad/… ->
 * /surat/…) and drops locality filters, since a locality from the old city is
 * meaningless in the new one (spec C2.2).
 */
export function CityPicker({
  citySlug,
  cityName,
  cities,
  compact,
}: {
  citySlug: string;
  cityName: string;
  cities: { slug: string; name: string }[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const pathname = usePathname();

  const filtered = cities.filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function pick(slug: string) {
    setOpen(false);
    if (slug === citySlug) return;
    // Swap only the first path segment; keep the rest of the route so a user
    // browsing /ahmedabad/events lands on /surat/events, not the homepage.
    const rest = pathname.split("/").slice(2).join("/");
    router.push(`/${slug}${rest ? `/${rest}` : ""}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "flex items-center gap-1 text-[12px] font-bold text-ink-muted cursor-pointer"
            : "flex items-center gap-1.5 font-bold text-white cursor-pointer"
        }
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
        onClose={() => setOpen(false)}
        title="Select your city"
        size="md"
      >
        <Input
          placeholder="Search city…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <p className="text-[12px] font-bold text-ink-muted tracking-[0.08em] mt-4 mb-2.5">
          POPULAR CITIES
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {filtered.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => pick(c.slug)}
              className={`border-[1.5px] rounded-[12px] p-3 text-center font-semibold text-[14px] cursor-pointer transition-colors ${
                c.slug === citySlug
                  ? "border-primary bg-primary-tint text-primary-dark"
                  : "border-border hover:border-primary hover:bg-primary-tint"
              }`}
            >
              {c.name}
            </button>
          ))}
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
