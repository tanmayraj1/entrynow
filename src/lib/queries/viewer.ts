import "server-only";

import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Per-request viewer context for event cards.
 *
 * Any page that renders an `EventCard` must pass this down, otherwise the
 * wishlist heart renders in its signed-out state for a signed-in user and
 * bounces them through /auth on click. Fetched once per page rather than once
 * per card.
 */
export interface ViewerContext {
  signedIn: boolean;
  wishlisted: Set<string>;
}

export async function getViewerContext(): Promise<ViewerContext> {
  const user = await getSessionUser();
  if (!user) return { signedIn: false, wishlisted: new Set() };

  const items = await db.wishlistItem.findMany({
    where: { userId: user.id },
    select: { eventId: true },
  });

  return {
    signedIn: true,
    wishlisted: new Set(items.map((i) => i.eventId)),
  };
}
