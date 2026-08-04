"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCountdown } from "@/lib/ist";

/**
 * The hold countdown.
 *
 * Takes an absolute `expiresAt` from the server and counts down to it — it
 * never receives "seconds remaining", because a duration computed on the
 * server and rendered on the client is wrong by however long the response took
 * and by however far the device clock has drifted (spec C4.2c).
 *
 * Reaching zero is display only. The seats are released by the server, and
 * this component's job at that moment is to stop lying about the time and
 * refresh so the page shows the real status.
 */
export function HoldCountdown({
  expiresAt,
  pollWhilePending = false,
}: {
  expiresAt: string;
  /** Poll for the webhook landing — the sandbox delivers in under a second. */
  pollWhilePending?: boolean;
}) {
  const router = useRouter();
  const target = new Date(expiresAt).getTime();
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.round((target - Date.now()) / 1000)),
  );

  useEffect(() => {
    const id = setInterval(() => {
      const next = Math.max(0, Math.round((target - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0) {
        clearInterval(id);
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [target, router]);

  // The payment outcome arrives by webhook, on its own connection, so the page
  // has to ask whether anything changed.
  useEffect(() => {
    if (!pollWhilePending) return;
    const id = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(id);
  }, [pollWhilePending, router]);

  const urgent = remaining > 0 && remaining <= 60;

  return (
    <span
      role="timer"
      aria-live={urgent ? "polite" : "off"}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-extrabold tabular",
        remaining === 0
          ? "bg-danger-tint text-danger-dark"
          : urgent
            ? "bg-danger-tint text-danger-dark"
            : "bg-primary-tint text-primary-dark",
      )}
    >
      <Clock size={14} strokeWidth={2.5} />
      {remaining === 0
        ? "Hold expired"
        : `${formatCountdown(remaining)} to complete payment`}
    </span>
  );
}
