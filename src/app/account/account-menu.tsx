"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Gift,
  HelpCircle,
  Heart,
  Ticket,
  User,
  Wallet,
} from "lucide-react";
import { inr } from "@/lib/money";
import { cn } from "@/lib/cn";

/** Account hub left menu — the design's master-detail navigation. */
const ITEMS = [
  { href: "/account", label: "Profile", Icon: User, exact: true },
  { href: "/account/wallet", label: "Wallet & refunds", Icon: Wallet },
  { href: "/account/coupons", label: "Coupons", Icon: Gift },
  { href: "/account/notifications", label: "Notifications", Icon: Bell },
  { href: "/account/wishlist", label: "Wishlist", Icon: Heart },
  { href: "/account/invite", label: "Invite friends", Icon: Ticket },
  { href: "/account/help", label: "Help centre", Icon: HelpCircle },
];

export function AccountMenu({ walletPaise }: { walletPaise: number }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5" aria-label="Account sections">
      {ITEMS.map(({ href, label, Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2.5 rounded-[11px] text-[13px] font-bold transition-colors",
              active
                ? "bg-primary-tint text-primary-dark"
                : "text-body-soft hover:bg-divider hover:text-ink",
            )}
          >
            <Icon size={15} strokeWidth={2.2} className="shrink-0" />
            <span className="flex-1">{label}</span>
            {href === "/account/wallet" && walletPaise > 0 && (
              <span className="text-[11px] font-extrabold text-primary tabular">
                {inr(walletPaise)}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
