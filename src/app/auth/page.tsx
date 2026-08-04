import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { MarketplaceShell } from "@/components/marketplace/marketplace-shell";
import { getPreferredCitySlug } from "@/lib/city-context";
import { getSessionUser } from "@/lib/auth/session";
import { AuthTabs } from "./auth-tabs";
import { isDemoMode } from "@/lib/demo";

export const metadata: Metadata = { title: "Sign in" };

export default async function AuthPage({ searchParams }: PageProps<"/auth">) {
  const sp = await searchParams;
  const rawNext = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  // Only ever redirect within this app — an open redirect here would be a
  // phishing primitive.
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
    ? rawNext
    : "/tickets";

  const [user, citySlug] = await Promise.all([
    getSessionUser(),
    getPreferredCitySlug(),
  ]);
  if (user) redirect(next);

  return (
    <MarketplaceShell citySlug={citySlug}>
      <div className="flex flex-col items-center gap-4 px-4 py-10 md:py-16">
        <AuthTabs next={next} demoMode={isDemoMode()} />
        {/* Staff have their own doors. Same credentials — this is a signpost,
            not a second credential store. */}
        <p className="text-[12px] font-semibold text-ink-muted text-center">
          Running events?{" "}
          <Link href="/organizer/login">Organizer sign in</Link>
        </p>
      </div>
    </MarketplaceShell>
  );
}
