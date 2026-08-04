import type { Metadata } from "next";
import { Gift } from "lucide-react";
import { AccountPanel, PanelEmpty } from "@/components/marketplace/account-panel";
import { Money } from "@/components/ui";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatIstDate } from "@/lib/ist";

export const metadata: Metadata = { title: "Coupons" };

export default async function CouponsPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const now = new Date();
  const promos = await db.promo.findMany({
    where: {
      isActive: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
    orderBy: { endsAt: "asc" },
    include: {
      event: { select: { title: true } },
      _count: { select: { redemptions: { where: { userId: user.id } } } },
    },
  });

  // A code the user has already used to their per-user limit is not an offer.
  const available = promos.filter((p) => p._count.redemptions < p.perUserLimit);

  return (
    <AccountPanel
      title="Coupons"
      description="Codes you can apply at checkout. Only one code per booking."
    >
      {available.length === 0 ? (
        <PanelEmpty
          icon={Gift}
          title="No coupons available"
          body="Offers appear here during festival season, and in the app when an organizer runs one."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {available.map((p) => (
            <li
              key={p.id}
              className="border-[1.5px] border-dashed border-primary rounded-[14px] p-4 bg-selected-bg"
            >
              <p className="text-[10.5px] font-extrabold text-primary tracking-[0.1em]">
                {p.event ? p.event.title.toUpperCase() : "ALL EVENTS"}
              </p>
              <p className="text-[18px] font-extrabold mt-1">
                {p.discountFlatPaise ? (
                  <>
                    <Money paise={p.discountFlatPaise} /> off
                  </>
                ) : (
                  `${Number(p.discountPct)}% off`
                )}
              </p>
              {p.description && (
                <p className="text-[12.5px] text-body-soft mt-1">
                  {p.description}
                </p>
              )}
              <p className="text-[13px] font-extrabold tracking-[0.08em] bg-surface border border-border rounded-[8px] px-3 py-1.5 mt-2.5 inline-block">
                {p.code}
              </p>
              <p className="text-[11px] text-ink-muted font-semibold mt-2">
                {p.minAmountPaise > 0 && (
                  <>
                    Min <Money paise={p.minAmountPaise} />
                  </>
                )}
                {p.endsAt && ` · Ends ${formatIstDate(p.endsAt)}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </AccountPanel>
  );
}
