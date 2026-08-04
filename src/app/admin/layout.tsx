import { DashShell } from "@/components/dash/dash-shell";
import { StatusPill } from "@/components/ui";
import { hasPermission, requireAdmin } from "@/lib/auth/rbac";
import type { DashNavGroup } from "@/components/dash/dash-nav";
import { db } from "@/lib/db";

/**
 * The platform admin portal.
 *
 * `requireAdmin("SUPPORT")` here is the *floor*, not the gate — it only
 * establishes that the visitor is an admin at all. Every route re-checks its
 * own permission, and so does every action. The nav below is filtered by
 * `hasPermission` purely so a SUPPORT admin is not shown a Finance link that
 * would 404 on them; hiding a link is a courtesy, never a control.
 */
export default async function AdminLayout({
  children,
}: LayoutProps<"/admin">) {
  const ctx = await requireAdmin("SUPPORT");

  const [approvals, kyc, disputes, payouts] = await Promise.all([
    db.event.count({ where: { status: "IN_REVIEW" } }),
    db.organizerProfile.count({ where: { status: "KYC_IN_REVIEW" } }),
    db.dispute.count({ where: { status: { in: ["OPEN", "INVESTIGATING"] } } }),
    db.payout.count({ where: { status: { in: ["SCHEDULED", "PROCESSING"] } } }),
  ]);

  const groups: DashNavGroup[] = [
    {
      items: [
        {
          href: "/admin",
          label: "Overview",
          icon: "overview" as const,
          exact: true,
        },
      ],
    },
  ];

  const review = [];
  if (hasPermission(ctx.permissions, "APPROVALS")) {
    review.push(
      {
        href: "/admin/approvals",
        label: "Approvals",
        icon: "approvals" as const,
        badge: approvals,
      },
      {
        href: "/admin/organizers",
        label: "Organizers",
        icon: "users" as const,
        badge: kyc,
      },
    );
  }
  if (hasPermission(ctx.permissions, "SUPPORT")) {
    review.push(
      { href: "/admin/events", label: "Events", icon: "events" as const },
      {
        href: "/admin/disputes",
        label: "Disputes",
        icon: "disputes" as const,
        badge: disputes,
      },
    );
  }
  if (review.length) groups.push({ label: "Oversight", items: review });

  if (hasPermission(ctx.permissions, "FINANCE")) {
    groups.push({
      label: "Money",
      items: [
        {
          href: "/admin/finance",
          label: "Payouts",
          icon: "money" as const,
          badge: payouts,
        },
      ],
    });
  }

  const platform = [];
  if (hasPermission(ctx.permissions, "CONTENT")) {
    platform.push({ href: "/admin/cms", label: "Content", icon: "content" as const });
  }
  if (hasPermission(ctx.permissions, "SUPER")) {
    platform.push(
      { href: "/admin/config", label: "Config", icon: "config" as const },
      { href: "/admin/audit", label: "Audit log", icon: "audit" as const },
    );
  }
  if (platform.length) groups.push({ label: "Platform", items: platform });

  return (
    <DashShell
      theme="dash-admin"
      title="Entry Now — platform admin"
      subtitle={ctx.permissions.join(" · ").toLowerCase()}
      badge={
        ctx.isSuper ? (
          <StatusPill tone="danger" label="Super" />
        ) : (
          <StatusPill tone="pending" label="Sub-admin" />
        )
      }
      groups={groups}
    >
      {children}
    </DashShell>
  );
}
