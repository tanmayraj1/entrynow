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
