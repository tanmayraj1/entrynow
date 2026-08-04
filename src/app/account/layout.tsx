import Link from "next/link";
import { UserRound } from "lucide-react";
import { MarketplaceShell } from "@/components/marketplace/marketplace-shell";
import { SignInPrompt } from "@/components/marketplace/sign-in-prompt";
import { getPreferredCitySlug } from "@/lib/city-context";
import { getSessionUser } from "@/lib/auth/session";
import { AccountMenu } from "./account-menu";
import { signOut } from "@/app/auth/actions";

export default async function AccountLayout({
  children,
}: LayoutProps<"/account">) {
  const [citySlug, user] = await Promise.all([
    getPreferredCitySlug(),
    getSessionUser(),
  ]);

  if (!user) {
    return (
      <MarketplaceShell citySlug={citySlug}>
        <SignInPrompt
          title="Your account"
          body="Wallet balance, refunds, coupons, wishlist and notifications — all tied to your phone number."
          next="/account"
          icon={UserRound}
        />
      </MarketplaceShell>
    );
  }

  return (
    <MarketplaceShell citySlug={citySlug}>
      <div className="px-4 md:px-6 lg:px-12 py-8 grid gap-6 lg:grid-cols-[260px_1fr] items-start">
        <aside className="bg-surface border border-border rounded-[18px] p-4 lg:sticky lg:top-24">
          <div className="flex items-center gap-3 pb-4 mb-2 border-b border-divider">
            <span className="size-11 rounded-full bg-primary-tint text-primary-dark grid place-items-center font-extrabold">
              {(user.name ?? "").slice(0, 2).toUpperCase() || (
                <UserRound size={20} strokeWidth={2.2} />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-extrabold truncate">
                {user.name ?? "Add your name"}
              </span>
              <span className="block text-[12px] text-ink-muted font-semibold">
                +{user.phone}
              </span>
            </span>
          </div>

          <AccountMenu walletPaise={user.walletBalancePaise} />

          <form action={signOut} className="mt-3 pt-3 border-t border-divider">
            <button
              type="submit"
              className="text-[12.5px] font-bold text-danger hover:text-danger-dark cursor-pointer"
            >
              Sign out
            </button>
          </form>
        </aside>

        <div className="min-w-0">{children}</div>
      </div>

      <p className="sr-only">
        <Link href="/legal/privacy">Privacy policy</Link>
      </p>
    </MarketplaceShell>
  );
}
