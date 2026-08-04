import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { DashChrome, DashMenuButton } from "./dash-sidebar";
import type { DashNavGroup } from "./dash-nav";
import { DemoBanner } from "@/components/marketplace/demo-banner";
import { isDemoMode } from "@/lib/demo";
import { cn } from "@/lib/cn";

/**
 * Chrome for both dashboards.
 *
 * It deliberately does NOT wrap `MarketplaceShell`: that component hardcodes
 * `data-theme="market"`, so reusing it would paint the portal in the
 * marketplace's rose and give an operator no signal about which surface they
 * are looking at. The whole point of two dashboard themes is that someone with
 * the organizer portal and the admin portal open in adjacent tabs can tell at a
 * glance which one they are about to click in.
 *
 * A server component — it renders counts and identity the caller already
 * awaited, and only the rail is interactive.
 */
export function DashShell({
  theme,
  groups,
  title,
  subtitle,
  badge,
  headerRight,
  sidebarFooter,
  children,
}: {
  theme: "dash-organizer" | "dash-admin";
  groups: DashNavGroup[];
  /** Shown in the topbar — the organizer's business name, or "Platform admin". */
  title: string;
  subtitle?: string;
  /** e.g. a plan chip, or the SUSPENDED warning. */
  badge?: React.ReactNode;
  headerRight?: React.ReactNode;
  sidebarFooter?: React.ReactNode;
  children: React.ReactNode;
}) {
  const onDark = theme === "dash-admin";

  return (
    <div
      data-theme={theme}
      data-chrome="portal"
      className="min-h-screen bg-bg text-ink flex flex-col"
    >
      {isDemoMode() && <DemoBanner />}
      <DashChrome
        groups={groups}
        onDark={onDark}
        footer={
          sidebarFooter ?? (
            <Link
              href="/"
              className={cn(
                "inline-flex items-center gap-1.5 text-[12px] font-bold",
                onDark
                  ? "text-white/60 hover:text-white"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              <ExternalLink size={13} strokeWidth={2.4} />
              Back to Entry Now
            </Link>
          )
        }
      >
        <div className="grow min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 bg-surface border-b border-border">
            <div className="flex items-center gap-3 px-4 lg:px-7 py-3">
              <DashMenuButton />
              <div className="min-w-0 grow">
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-[14.5px] font-extrabold truncate">
                    {title}
                  </h2>
                  {badge}
                </div>
                {subtitle && (
                  <p className="text-[11.5px] font-semibold text-ink-muted truncate">
                    {subtitle}
                  </p>
                )}
              </div>
              {headerRight}
            </div>
          </header>

          <main className="grow px-4 lg:px-7 py-5 lg:py-7">{children}</main>
        </div>
      </DashChrome>
    </div>
  );
}
