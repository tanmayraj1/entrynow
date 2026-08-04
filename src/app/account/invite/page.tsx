import type { Metadata } from "next";
import { AccountPanel } from "@/components/marketplace/account-panel";
import { Money } from "@/components/ui";
import { CopyField } from "@/components/marketplace/copy-field";
import { getSessionUser } from "@/lib/auth/session";
import { getBusinessConfig } from "@/lib/config";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Invite friends" };

export default async function InvitePage() {
  const user = await getSessionUser();
  if (!user) return null;

  const cfg = await getBusinessConfig();
  // Stable, non-guessable-from-phone code derived from the user id.
  const code = `EN${user.id.slice(-6).toUpperCase()}`;
  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/?ref=${code}`;

  const referrals = await db.referral.findMany({
    where: { referrerId: user.id },
    select: { qualifiedAt: true, referrerCreditPaise: true },
  });
  const earned = referrals.reduce((s, r) => s + r.referrerCreditPaise, 0);
  const qualified = referrals.filter((r) => r.qualifiedAt).length;

  return (
    <AccountPanel
      title="Invite friends"
      description={`They get ${cfgAmount(cfg.refereeCreditPaise)} off their first booking. You get ${cfgAmount(cfg.referrerCreditPaise)} in wallet credit once they complete a booking of ${cfgAmount(cfg.referralMinBookingPaise)} or more.`}
    >
      <div className="grid gap-3 sm:grid-cols-3 mb-5">
        {[
          { label: "Invites accepted", value: String(referrals.length) },
          { label: "Qualified", value: String(qualified) },
          { label: "Credit earned", value: null, paise: earned },
        ].map((s) => (
          <div key={s.label} className="bg-bg border border-border rounded-[12px] px-4 py-3">
            <p className="text-[22px] font-extrabold tabular">
              {s.paise !== undefined ? <Money paise={s.paise} /> : s.value}
            </p>
            <p className="text-[11.5px] text-ink-muted font-semibold">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 max-w-lg">
        <CopyField label="Your code" value={code} />
        <CopyField label="Your invite link" value={link} />
      </div>
    </AccountPanel>
  );
}

function cfgAmount(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}
