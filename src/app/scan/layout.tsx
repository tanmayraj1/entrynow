import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { ScannerRegistration } from "./sw-register";

export const metadata: Metadata = {
  title: { default: "Gate scanner", template: "%s · Entry Now scanner" },
  manifest: "/scan/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Entry Now" },
};

/**
 * `themeColor` matches the scanner surface, not the brand. On a phone in
 * standalone mode the OS paints the status bar this colour — the marketplace
 * rose there would make the dark gate UI look like a rendering bug.
 *
 * `viewportFit: cover` plus the safe-area padding below keeps the result
 * banner clear of the home indicator on a notched phone.
 */
export const viewport: Viewport = {
  themeColor: "#0a1226",
  viewportFit: "cover",
  // The one place zoom is genuinely disabled: a double-tap while aiming the
  // camera would zoom the page instead of the lens, and the viewfinder has no
  // small text to pinch into.
  maximumScale: 1,
  userScalable: false,
};

/**
 * The gate scanner.
 *
 * `redirect`, not `notFound`, is the right call here and the opposite of the
 * portals: staff arrive by opening a bookmark on a borrowed phone at 8 PM, and
 * a 404 gives them nothing to do. There is nothing to enumerate either — the
 * per-event authorisation happens inside the scan engine.
 */
export default async function ScanLayout({
  children,
}: LayoutProps<"/scan">) {
  const user = await getSessionUser();
  if (!user) redirect("/auth?next=/scan");

  return (
    <div
      data-theme="scanner"
      className="min-h-[100dvh] bg-bg text-ink flex flex-col"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <ScannerRegistration />
      {children}
    </div>
  );
}
