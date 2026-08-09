"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button, Money, StickyActionBar } from "@/components/ui";

/**
 * The control that takes the hold.
 *
 * Sends tier ids and quantities only — never a price. The server recomputes
 * every rupee from the database (invariant I4), so there is nothing here worth
 * tampering with.
 *
 * A 409 is not an error state to apologise for: it means the world changed
 * while the user was deciding, and the response carries per-tier availability
 * so we can say exactly what is left rather than "something went wrong".
 */

interface Availability {
  tierId: string;
  tierName: string;
  remaining: number;
}

export function CheckoutButton({
  eventSlug,
  sessionId,
  lines,
  totalPaise,
  disabled,
}: {
  eventSlug: string;
  sessionId?: string | null;
  lines: { tierId: string; quantity: number }[];
  totalPaise: number;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const ctaRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability[] | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setAvailability(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventSlug, sessionId, lines }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "That booking could not be started.");
        setAvailability(data.availability ?? null);
        setBusy(false);
        return;
      }

      // The hold is live and the clock is running. Anything owed goes to the
      // payment screen; a wallet-only order has nothing to pay and lands
      // straight on the booking (spec C4.5).
      router.push(
        data.gatewayPayablePaise > 0
          ? `/booking/${data.bookingNumber}/pay`
          : `/booking/${data.bookingNumber}`,
      );
    } catch {
      setError("Could not reach the server. Check your connection and retry.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div
          role="alert"
          className="bg-danger-tint border border-danger rounded-[14px] px-4 py-3 flex gap-3"
        >
          <AlertCircle size={18} className="text-danger-dark shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[13px] font-extrabold text-danger-dark">{error}</p>
            {availability && availability.length > 0 && (
              <ul className="text-[12.5px] text-danger-dark mt-1.5">
                {availability.map((a) => (
                  <li key={a.tierId}>
                    {a.tierName}:{" "}
                    {a.remaining === 0 ? "sold out" : `${a.remaining} left`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div ref={ctaRef}>
        <Button
          size="lg"
          onClick={submit}
          disabled={disabled || busy}
          className="w-full sm:w-auto"
        >
          {busy ? (
            <span className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              Holding your seats…
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              Hold seats &amp; pay <Money paise={totalPaise} />
            </span>
          )}
        </Button>
      </div>

      {/* The review page is long — event summary, line items, fee breakdown,
          the hold explanation — so on a phone the button that actually starts
          checkout sits well below the fold. */}
      <StickyActionBar
        watch={ctaRef}
        active={!disabled}
        left={
          <>
            <p className="text-[10.5px] text-ink-muted font-bold">Total</p>
            <Money paise={totalPaise} className="text-[17px] font-extrabold" />
          </>
        }
      >
        <Button size="md" onClick={submit} disabled={disabled || busy}>
          {busy ? "Holding…" : "Hold seats & pay"}
        </Button>
      </StickyActionBar>
    </div>
  );
}
