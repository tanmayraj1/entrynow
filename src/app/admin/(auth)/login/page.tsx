import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { StaffDoor } from "@/components/auth/staff-door";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

/**
 * The platform admin's own front door.
 *
 * In its own `(auth)` group for the same reason as the organizer one: the
 * `(portal)` layout calls `requireAdmin("SUPPORT")` and would 404 an admin
 * arriving to sign in.
 *
 * On the review deployment this page also sits behind the HTTP Basic gate in
 * `src/middleware.ts`, which matches `/admin/:path*`. That is deliberate and
 * the two are not redundant: the password keeps the admin surface from being
 * publicly reachable at all, and the sign-in below decides who is actually an
 * admin. Neither substitutes for the other.
 */
export default async function AdminLoginPage() {
  const user = await getSessionUser();
  if (user?.isAdmin) redirect("/admin");

  return (
    <StaffDoor
      theme="dash-admin"
      eyebrow="Platform admin"
      heading="Admin sign in"
      blurb="Restricted to Entry Now staff. Use your registered mobile number — we'll text you a six-digit code."
      next="/admin"
      footnote={
        user ? (
          <>
            You&apos;re signed in, but this account has no admin role.{" "}
            <Link href="/">Return to Entry Now</Link>.
          </>
        ) : undefined
      }
    />
  );
}
