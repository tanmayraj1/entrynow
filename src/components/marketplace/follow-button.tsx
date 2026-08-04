"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * Follow / Following toggle for an organizer.
 *
 * Optimistic, and reverts on failure. A signed-out visitor is sent to sign in
 * with a return path, rather than the button silently doing nothing.
 */
export function FollowButton({
  organizerId,
  organizerName,
  initialFollowing,
  signedIn,
  returnTo,
}: {
  organizerId: string;
  organizerName: string;
  initialFollowing: boolean;
  signedIn: boolean;
  returnTo: string;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function toggle() {
    if (!signedIn) {
      router.push(`/auth?next=${encodeURIComponent(returnTo)}`);
      return;
    }

    const next = !following;
    setFollowing(next); // optimistic
    setBusy(true);
    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizerId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { following: boolean };
      setFollowing(data.following);
      startTransition(() => router.refresh());
    } catch {
      setFollowing(!next); // revert
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant={following ? "outline" : "secondary"}
      size="md"
      onClick={toggle}
      loading={busy || pending}
      aria-pressed={following}
      aria-label={
        following ? `Unfollow ${organizerName}` : `Follow ${organizerName}`
      }
      className="shrink-0"
    >
      {following ? (
        <>
          <Check size={14} strokeWidth={2.6} />
          Following
        </>
      ) : (
        <>
          <Plus size={14} strokeWidth={2.6} />
          Follow
        </>
      )}
    </Button>
  );
}
