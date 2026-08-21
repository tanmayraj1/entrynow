import Link from "next/link";
import type { Metadata } from "next";
import {
  BarChart3,
  LayoutDashboard,
  QrCode,
  ScanLine,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui";
import { getSessionUser } from "@/lib/auth/session";
import { getBusinessConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { inr } from "@/lib/money";

export const metadata: Metadata = {
  title: "For organizers",
  description:
    "List your Garba night, mela or concert on Entry Now — QR entry, live sales, weekly settlement.",
};

export default async function OrganizerLandingPage() {
  const [user, cfg] = await Promise.all([getSessionUser(), getBusinessConfig()]);

  // An organizer who is already onboarded should not be sold to.
  const profile = user
    ? await db.organizerProfile.findUnique({
        where: { userId: user.id },
        select: { status: true, name: true },
      })
    : null;

  const features = [
    {
      Icon: QrCode,
      title: "Entry that actually works at the gate",
      body: "A QR per attendee, one scan each. The scanner keeps working when the venue's network doesn't, and syncs when it comes back.",
    },
    {
      Icon: BarChart3,
      title: "Live numbers on the night",
      body: "Entered versus expected, per gate and per tier, updating every few seconds while the doors are open.",
    },
    {
      Icon: Wallet,
      title: "Settlement you can plan around",
      body: `Payouts run daily, ${cfg.payoutDelayDays} days after your event finishes, with a GST invoice generated for you.`,
    },
    {
      Icon: ShieldCheck,
      title: "Verified listings",
      body: "KYC on every organizer, so attendees trust the listing — and so do we when it comes to releasing money.",
    },
  ];

  return (
    <div>
      <section className="bg-[linear-gradient(135deg,#0A6B59,#16302B)] text-white px-4 md:px-6 lg:px-12 py-16">
        <div className="max-w-2xl">
          <p className="text-[12px] font-extrabold tracking-[0.1em] opacity-80">
            FOR ORGANIZERS
          </p>
          <h1 className="text-[30px] md:text-[42px] tracking-[-1px] mt-2 leading-tight">
            Sell out your nights, not your evenings
          </h1>
          <p className="text-[15px] md:text-[17px] opacity-90 mt-3 leading-relaxed">
            List your Garba ground, mela, concert or comedy night. We handle
            ticketing, payments, entry and settlement — you run the event.
          </p>

          <div className="flex gap-2.5 flex-wrap mt-6">
            {profile ? (
              <>
                {/* "Go to your portal" used to point at /organizer/onboarding
                    regardless of status — so the one button a verified
                    organizer was offered took them back through setup they had
                    already finished. The label and the destination now agree. */}
                <Link
                  href={
                    profile.status === "VERIFIED"
                      ? "/organizer/dashboard"
                      : "/organizer/onboarding"
                  }
                  className="inline-flex items-center gap-2 rounded-full bg-white px-6 h-12 text-[15px] font-extrabold text-[#16302B] hover:text-[#16302B] hover:bg-white/90 transition-colors"
                >
                  <LayoutDashboard size={17} strokeWidth={2.4} />
                  {profile.status === "VERIFIED"
                    ? "Go to your dashboard"
                    : "Finish setting up"}
                </Link>
                {profile.status === "VERIFIED" && (
                  /* The second door to the gate scanner. Someone standing at a
                     venue does not navigate via a dashboard, and /organizer is
                     the address they remember. */
                  <Link
                    href="/scan"
                    className="inline-flex items-center gap-2 rounded-full border border-white/45 px-6 h-12 text-[15px] font-extrabold text-white hover:text-white hover:bg-white/12 transition-colors"
                  >
                    <ScanLine size={17} strokeWidth={2.4} />
                    Scan tickets
                  </Link>
                )}
                <span className="text-[13px] font-semibold opacity-80 self-center">
                  Signed in as {profile.name}
                </span>
              </>
            ) : (
              <>
                <Link href="/organizer/onboarding">
                  <Button size="lg">Start listing</Button>
                </Link>
                <Link href="/organizer/pricing">
                  <Button size="lg" variant="outline">
                    See plans &amp; commission
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="px-4 md:px-6 lg:px-12 py-10">
        <div className="grid gap-4 sm:grid-cols-2">
          {features.map(({ Icon, title, body }) => (
            <div
              key={title}
              className="bg-surface border border-border rounded-[16px] p-5"
            >
              <span className="size-10 rounded-full bg-primary-tint grid place-items-center">
                <Icon size={18} strokeWidth={2.2} className="text-primary" />
              </span>
              <h2 className="text-[16px] mt-3">{title}</h2>
              <p className="text-[13px] text-body-soft leading-relaxed mt-1.5">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 md:px-6 lg:px-12 pb-12">
        <div className="bg-surface border border-border rounded-[18px] p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-[18px]">What it costs</h2>
            <p className="text-[13.5px] text-body-soft mt-1">
              An annual plan from {inr(cfg.planBasicPricePaise)}, plus
              commission on what you sell. No charge for events that don&apos;t
              sell.
            </p>
          </div>
          <Link href="/organizer/pricing">
            <Button variant="outline">See the numbers</Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
