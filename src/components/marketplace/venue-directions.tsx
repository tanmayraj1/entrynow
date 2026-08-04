"use client";

import { useState } from "react";
import { Bus, Car, MapPin, Navigation, TrainFront } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Venue block with the car / metro / bus / auto directions modal from the
 * Event prototype.
 */

const MODES = [
  { key: "car", label: "Car", Icon: Car },
  { key: "metro", label: "Metro", Icon: TrainFront },
  { key: "bus", label: "Bus", Icon: Bus },
  { key: "auto", label: "Auto", Icon: Navigation },
] as const;

export function VenueDirections({
  venueName,
  addressLine,
  locality,
  lat,
  lng,
  directions,
}: {
  venueName: string;
  addressLine: string;
  locality: string | null;
  lat: number;
  lng: number;
  directions: Record<string, string> | null;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<(typeof MODES)[number]["key"]>("car");

  // Opens the user's own map app rather than embedding a keyed tile provider.
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  return (
    <section className="bg-surface border border-border rounded-[20px] p-5 md:p-6">
      <h2 className="text-[17px] mb-3.5">Getting there</h2>

      <div className="flex items-start gap-3">
        <span className="size-10 rounded-full bg-primary-tint grid place-items-center shrink-0">
          <MapPin size={18} strokeWidth={2.4} className="text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-extrabold">{venueName}</p>
          <p className="text-[12.5px] text-ink-muted font-semibold mt-0.5">
            {addressLine}
            {locality && ` · ${locality}`}
          </p>
          <div className="flex gap-2 mt-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              How to reach
            </Button>
            <a href={mapsHref} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm">
                Open in Maps ↗
              </Button>
            </a>
          </div>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Reaching ${venueName}`}
        size="md"
      >
        <div className="flex gap-2 mb-4 flex-wrap">
          {MODES.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              aria-pressed={mode === key}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12.5px] font-bold cursor-pointer border transition-colors",
                mode === key
                  ? "bg-primary border-primary text-white"
                  : "bg-surface border-border text-body-soft hover:border-primary",
              )}
            >
              <Icon size={14} strokeWidth={2.4} />
              {label}
            </button>
          ))}
        </div>

        <p className="text-[13.5px] text-body-soft leading-relaxed">
          {directions?.[mode] ??
            "Directions for this mode haven't been added yet — open the venue in Maps for turn-by-turn."}
        </p>

        <div className="bg-bg border border-border rounded-[12px] px-3.5 py-3 mt-4">
          <p className="text-[11px] font-extrabold text-ink-muted tracking-[0.06em]">
            ADDRESS
          </p>
          <p className="text-[13px] font-semibold mt-1">{addressLine}</p>
        </div>
      </Modal>
    </section>
  );
}
