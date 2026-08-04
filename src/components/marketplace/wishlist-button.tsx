"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The heart on an event card.
 *
 * Previously a <span> nested inside the card's <Link>, so a click just opened
 * the event and keyboard users could not reach it at all. It is now a real
 * button, positioned above the link, that stops the click from bubbling into
 * the card navigation.
 */
export function WishlistButton({
  eventId,
  eventTitle,
  initialWishlisted = false,
  signedIn,
  returnTo,
  className,
}: {
  eventId: string;
  eventTitle: string;
  initialWishlisted?: boolean;
  signedIn: boolean;
  returnTo: string;
  className?: string;
}) {
  const [on, setOn] = useState(initialWishlisted);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function toggle(e: React.MouseEvent) {
    // The card is a Link; without this the click navigates instead.
    e.preventDefault();
    e.stopPropagation();

    if (!signedIn) {
      router.push(`/auth?next=${encodeURIComponent(returnTo)}`);
      return;
    }

    const next = !on;
    setOn(next);
    setBusy(true);
    try {
      const res = await fetch("/api/wishlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { wishlisted: boolean };
      setOn(data.wishlisted);
    } catch {
      setOn(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      aria-label={on ? `Remove ${eventTitle} from wishlist` : `Save ${eventTitle} to wishlist`}
      className={cn(
        "size-8 rounded-full bg-white/92 grid place-items-center cursor-pointer",
        "hover:bg-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        className,
      )}
    >
      <Heart
        size={15}
        strokeWidth={2.4}
        className={cn("text-danger", on && "fill-danger")}
      />
    </button>
  );
}
