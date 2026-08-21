import Link from "next/link";
import { ScanLine } from "lucide-react";
import { DashShell } from "@/components/dash/dash-shell";
import { StatusPill } from "@/components/ui";
import { requireOrganizer } from "@/lib/auth/rbac";
import { db } from "@/lib/db";

/**
 * The signed-in organizer portal.
 *
 * `requireOrganizer` runs here, so every child route is behind it — but that
 * is the *render* guard only. Each server action re-derives identity through
 * `authorizeOrganizer` as well, because a layout cannot protect an action
 * endpoint a crafted POST reaches directly.
 *
 * `allowUnverified` is on: an organizer mid-KYC needs the portal to finish
 * onboarding, and `readOnly` (SUSPENDED) still gets in — spec B5 keeps their
 * login alive so they can see their events and money while an investigation
 * runs. Every mutation checks writability separately.
 */
export default async function OrganizerPortalLayout({
  children,
}: LayoutProps<"/organizer">) {
  const ctx = await requireOrganizer({ allowUnverified: true });

  const profile = await db.organizerProfile.findUnique({
    where: { id: ctx.organizerId },
    select: {
      name: true,
      slug: true,
      plan: true,
      status: true,
      city: { select: { slug: true } },
    },
  });

  const [draftCount, liveCount] = await Promise.all([
    db.event.count({
      where: { organizerId: ctx.organizerId, status: "DRAFT" },
    }),
    db.event.count({
      where: { organizerId: ctx.organizerId, status: "LIVE" },
    }),
  ]);

  return (
    <DashShell
      theme="dash-organizer"
      title={profile?.name ?? "Your organisation"}
      subtitle={
        ctx.readOnly
          ? "Read-only — this account is suspended. Existing tickets are unaffected."
          : `${liveCount} live · ${draftCount} draft`
      }
      badge={
        ctx.readOnly ? (
          <StatusPill status="SUSPENDED" />
        ) : ctx.plan ? (
          <StatusPill
            tone={ctx.plan === "PRO" ? "confirmed" : "pending"}
            label={ctx.plan === "PRO" ? "Pro" : "Basic"}
          />
        ) : (
          <StatusPill status={ctx.status} />
        )
      }
      /**
       * The scanner again, in the topbar, and the duplication is deliberate.
       *
       * On a phone the rail is behind a hamburger, and the phone is exactly
       * where someone reaches for the scanner — so the rail entry is the one
       * that is hardest to get at precisely when it is wanted. This sits on
       * every portal page at both widths; the label collapses on the smallest
       * screens, the icon does not.
       */
      headerRight={
        <Link
          href="/scan"
          className="shrink-0 inline-flex items-center gap-1.5 rounded-[11px] bg-primary px-3 py-2 text-[12.5px] font-extrabold text-white hover:bg-primary-dark hover:text-white transition-colors"
        >
          <ScanLine size={15} strokeWidth={2.6} />
          <span className="hidden sm:inline">Scan tickets</span>
          <span className="sr-only sm:hidden">Scan tickets</span>
        </Link>
      }
      groups={[
        {
          items: [
            {
              href: "/organizer/dashboard",
              label: "Dashboard",
              icon: "dashboard",
              exact: true,
            },
            { href: "/organizer/events", label: "Events", icon: "events" },
            { href: "/organizer/venues", label: "Venues", icon: "venue" },
          ],
        },
        {
          label: "At the gate",
          items: [
            {
              // The scanner is a separate surface — its own dark theme, its
              // own PWA manifest, its own service worker — and until now
              // nothing in the entire app linked to it. Staff were expected to
              // type the URL, which is not a thing anyone does at 8 PM in a
              // queue.
              //
              // It lives in the rail rather than only in a per-event action
              // because that is how it is actually used: someone opens the
              // portal on a phone at the gate and wants the camera, not a
              // path through two event pages to reach it. `/scan` then asks
              // which gate — the organizer's own LIVE and PAUSED events are
              // always in that list, so this never dead-ends.
              href: "/scan",
              label: "Gate scanner",
              icon: "scanner",
            },
          ],
        },
        {
          label: "Sell",
          items: [
            { href: "/organizer/promos", label: "Promo codes", icon: "promos" },
            {
              href: "/organizer/announcements",
              label: "Announcements",
              icon: "announcements",
            },
          ],
        },
        {
          label: "Money",
          items: [
            {
              href: "/organizer/financials",
              label: "Financials",
              icon: "wallet",
            },
          ],
        },
        {
          label: "Account",
          items: [
            { href: "/organizer/settings", label: "Settings", icon: "settings" },
            {
              // The public profile is city-scoped — /ahmedabad/organizers/…
              // A link straight to /organizer/{slug} would land inside this
              // portal's own route group and 404.
              href:
                profile?.slug && profile.city?.slug
                  ? `/${profile.city.slug}/organizers/${profile.slug}`
                  : "/organizer",
              label: "Public page",
              icon: "ticket",
            },
          ],
        },
      ]}
    >
      {children}
    </DashShell>
  );
}
