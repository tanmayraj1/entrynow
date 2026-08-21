import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { StaffDoor } from "@/components/auth/staff-door";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Organizer sign in",
  // A staff door has nothing to offer a search engine, and indexing it only
  // widens the surface people probe.
  robots: { index: false, follow: false },
};

/**
 * The organizer portal's own front door.
 *
 * It lives in its own `(auth)` route group so it sits *outside*
 * `(portal)/layout.tsx` — that layout calls `requireOrganizer()`, which would
 * 404 the very person coming here to sign in.
 */
export default async function OrganizerLoginPage() {
  const user = await getSessionUser();
  // Already an organizer? There is nothing to do here.
  if (user?.organizer) redirect("/organizer/dashboard");

  return (
    <StaffDoor
      theme="dash-organizer"
      eyebrow="Organizer portal"
      heading="Sign in to your portal"
      blurb="Use the mobile number registered to your organisation. We'll text you a six-digit code."
      next="/organizer/dashboard"
      signedInAs={user && !user.organizer ? { name: user.name } : null}
      footnote={
        user ? (
          <>
            <Link href="/organizer">List your event</Link> to start an
            organiser account, or{" "}
            <Link href="/tickets">go to your tickets</Link>.
          </>
        ) : (
          <>
            Don&apos;t have a portal yet?{" "}
            <Link href="/organizer">List your event</Link>. Looking for tickets
            you bought? <Link href="/auth">Sign in here</Link>.
          </>
        )
      }
    />
  );
}
