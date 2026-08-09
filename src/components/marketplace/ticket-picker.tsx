"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Money, Stepper, StickyActionBar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatIstShortDate, formatIstTime } from "@/lib/ist";

/**
 * Night picker + tier steppers + sticky book bar.
 *
 * The totals shown here are an *estimate only*. Fees, promo and the final
 * amount are recomputed server-side when the booking is created (invariant
 * I4), and inventory is only truly reserved by the atomic hold (I1). This
 * component's job is to stop the user composing a request the server would
 * certainly reject — not to authorise anything.
 */

export interface PickerSession {
  id: string;
  sequence: number;
  name: string | null;
  startsAt: string;
  endsAt: string;
  soldOut: boolean;
}

export interface PickerTier {
  id: string;
  name: string;
  description: string | null;
  tag: string | null;
  pricePaise: number;
  remaining: number;
  onSale: boolean;
  perUserLimit: number;
  isSeasonPass: boolean;
}

export function TicketPicker({
  eventSlug,
  sessions,
  tiers,
}: {
  eventSlug: string;
  sessions: PickerSession[];
  tiers: PickerTier[];
}) {
  const router = useRouter();
  // Default to the nearest upcoming session (spec C3.4).
  const firstAvailable = sessions.find((s) => !s.soldOut) ?? sessions[0];
  const [sessionId, setSessionId] = useState<string | null>(
    firstAvailable?.id ?? null,
  );
  const [qty, setQty] = useState<Record<string, number>>({});
  const ctaRef = useRef<HTMLDivElement>(null);

  const totalQty = Object.values(qty).reduce((a, b) => a + b, 0);
  const subtotal = useMemo(
    () =>
      tiers.reduce((sum, t) => sum + (qty[t.id] ?? 0) * t.pricePaise, 0),
    [qty, tiers],
  );

  // A season pass is valid for every night, so it bypasses the night picker
  // entirely (spec C3.4 / C7).
  const onlySeasonSelected =
    totalQty > 0 &&
    tiers.every((t) => (qty[t.id] ?? 0) === 0 || t.isSeasonPass);

  const needsSession = sessions.length > 0 && !onlySeasonSelected;
  const canBook = totalQty > 0 && (!needsSession || Boolean(sessionId));

  function proceed() {
    const lines = Object.entries(qty)
      .filter(([, q]) => q > 0)
      .map(([id, q]) => `${id}:${q}`)
      .join(",");
    const params = new URLSearchParams({ tiers: lines });
    if (sessionId && needsSession) params.set("session", sessionId);
    router.push(`/booking/new?event=${eventSlug}&${params}`);
  }

  return (
    <>
      <div className="bg-surface border border-border rounded-[20px] p-5 flex flex-col gap-4">
        {/* Night picker */}
        {sessions.length > 1 && (
          <div>
            <h3 className="text-[13px] font-extrabold mb-2">
              Pick your night
              {onlySeasonSelected && (
                <span className="ml-2 text-[11px] font-bold text-primary">
                  Season pass covers all nights
                </span>
              )}
            </h3>
            <div
              className={cn(
                "flex gap-2 overflow-x-auto pb-1",
                onlySeasonSelected && "opacity-45 pointer-events-none",
              )}
            >
              {sessions.map((s) => {
                const d = new Date(s.startsAt);
                const active = s.id === sessionId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={s.soldOut}
                    onClick={() => setSessionId(s.id)}
                    aria-pressed={active}
                    className={cn(
                      "shrink-0 w-[54px] py-2 rounded-[11px] text-center leading-tight border-[1.5px] cursor-pointer transition-colors",
                      s.soldOut
                        ? "border-border bg-divider text-ink-muted opacity-60 cursor-not-allowed line-through"
                        : active
                          ? "bg-primary border-primary text-white"
                          : "bg-surface border-border hover:border-primary",
                    )}
                  >
                    <span className="block text-[9.5px] font-bold opacity-75">
                      {new Intl.DateTimeFormat("en-IN", {
                        weekday: "short",
                        timeZone: "Asia/Kolkata",
                      }).format(d)}
                    </span>
                    <span className="block text-[13px] font-extrabold">
                      {new Intl.DateTimeFormat("en-IN", {
                        day: "numeric",
                        timeZone: "Asia/Kolkata",
                      }).format(d)}
                    </span>
                  </button>
                );
              })}
            </div>
            {sessionId && (
              <p className="text-[11.5px] text-ink-muted font-semibold mt-2">
                {(() => {
                  const s = sessions.find((x) => x.id === sessionId)!;
                  return `${s.name ?? `Night ${s.sequence}`} · ${formatIstShortDate(s.startsAt)} · ${formatIstTime(s.startsAt)} – ${formatIstTime(s.endsAt)}`;
                })()}
              </p>
            )}
          </div>
        )}

        {/* Tiers */}
        <div className="flex flex-col gap-2.5">
          {tiers.map((t) => {
            const selected = (qty[t.id] ?? 0) > 0;
            const soldOut = !t.onSale || t.remaining === 0;
            const max = Math.min(t.perUserLimit, t.remaining);

            return (
              <div
                key={t.id}
                className={cn(
                  "border-[1.5px] rounded-[14px] px-4 py-3 flex items-center justify-between gap-3 transition-colors",
                  soldOut
                    ? "border-border bg-divider opacity-70"
                    : selected
                      ? "border-primary bg-selected-bg"
                      : "border-border bg-surface",
                )}
              >
                <div className="min-w-0">
                  <p className="text-[13.5px] font-extrabold flex items-center gap-2 flex-wrap">
                    {t.name}
                    {t.tag && !soldOut && (
                      <span className="text-[10px] font-extrabold text-gold bg-[#FBF4E6] px-2 py-0.5 rounded-full">
                        {t.tag}
                      </span>
                    )}
                  </p>
                  {t.description && (
                    <p className="text-[11.5px] text-ink-muted font-semibold mt-0.5">
                      {t.description}
                    </p>
                  )}
                  <p
                    className={cn(
                      "text-[10.5px] font-bold mt-0.5",
                      soldOut
                        ? "text-ink-muted"
                        : t.remaining <= 50
                          ? "text-danger"
                          : "text-ink-muted",
                    )}
                  >
                    {soldOut
                      ? !t.onSale
                        ? "Sale closed"
                        : "Sold out"
                      : `${t.remaining.toLocaleString("en-IN")} left`}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <Money
                    paise={t.pricePaise}
                    className="text-[14px] font-extrabold text-primary"
                  />
                  {!soldOut && (
                    <Stepper
                      label={t.name}
                      value={qty[t.id] ?? 0}
                      max={max}
                      onChange={(n) => setQty((q) => ({ ...q, [t.id]: n }))}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* The real CTA. Present at every width — the desktop rail is already
            `sticky top-24`, so on a wide screen this simply follows you down
            and the bar below never appears. */}
        <div ref={ctaRef}>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[12.5px] font-semibold text-ink-muted">
              {totalQty} {totalQty === 1 ? "ticket" : "tickets"}
            </span>
            <Money paise={subtotal} className="text-[18px] font-extrabold" />
          </div>
          <Button fullWidth size="lg" disabled={!canBook} onClick={proceed}>
            Book now →
          </Button>
          <p className="text-[10.5px] text-ink-muted text-center mt-2">
            Seats are held for 8 minutes once you start checkout.
          </p>
        </div>
      </div>

      {/* Appears on the first selection, and only while the CTA above is
          off-screen. The old version of this bar was always mounted, so a
          reader who had chosen nothing yet got "0 tickets · ₹0" behind a
          disabled button and lost 76px of a phone screen to it. */}
      <StickyActionBar
        watch={ctaRef}
        active={totalQty > 0}
        left={
          <>
            <p className="text-[10.5px] text-ink-muted font-bold">
              {totalQty} {totalQty === 1 ? "ticket" : "tickets"}
            </p>
            <Money paise={subtotal} className="text-[17px] font-extrabold" />
          </>
        }
      >
        <Button disabled={!canBook} onClick={proceed} size="md">
          Book now →
        </Button>
      </StickyActionBar>
    </>
  );
}
