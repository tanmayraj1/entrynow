import Link from "next/link";
import type { Metadata } from "next";
import { Check, Tent } from "lucide-react";
import { Button, StatusPill } from "@/components/ui";
import { SignInPrompt } from "@/components/marketplace/sign-in-prompt";
import { getSessionUser } from "@/lib/auth/session";
import { getBusinessConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { inr } from "@/lib/money";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Become an organizer" };

/** The five gates of spec E1, in order — none can be skipped. */
const GATES = [
  {
    key: "DETAILS_SUBMITTED",
    title: "Business details",
    body: "Legal name, business type, registered address and a contact we can reach on an event day.",
  },
  {
    key: "FEE_PAID",
    title: "Plan & fee",
    body: "Choose Basic or Pro and pay the annual fee. This unlocks the KYC step.",
  },
  {
    key: "KYC_IN_REVIEW",
    title: "KYC documents",
    body: "PAN is required. GST is optional unless you expect to cross ₹20L of sales. Plus proof of a bank account in the business's name.",
  },
  {
    key: "BANK",
    title: "Bank verification",
    body: "We send a rupee to the account and check the name matches. This is where payouts will land.",
  },
  {
    key: "VERIFIED",
    title: "Review",
    body: "Our team checks the documents. The service level is 48 hours; you'll be told either way.",
  },
] as const;

export default async function OnboardingPage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <SignInPrompt
        title="List your event"
        body="Sign in with your phone to start. Onboarding takes about ten minutes, plus review time."
        next="/organizer/onboarding"
        icon={Tent}
      />
    );
  }

  const [profile, cfg] = await Promise.all([
    db.organizerProfile.findUnique({ where: { userId: user.id } }),
    getBusinessConfig(),
  ]);

  // How far along the five gates this organizer is.
  const reached = (() => {
    if (!profile) return 0;
    switch (profile.status) {
      case "SIGNUP":
        return 0;
      case "DETAILS_SUBMITTED":
        return 1;
      case "FEE_PAID":
        return 2;
      case "KYC_IN_REVIEW":
        return 3;
      case "KYC_REJECTED":
        return 3;
      case "VERIFIED":
        return 5;
      case "SUSPENDED":
        return 5;
      default:
        return 0;
    }
  })();

  return (
    <div className="px-4 md:px-6 lg:px-12 py-10 max-w-3xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[26px] md:text-[30px] tracking-[-0.6px]">
            Become an organizer
          </h1>
          <p className="text-[14px] text-body-soft mt-2 max-w-xl leading-relaxed">
            Five steps, in order. You can stop and come back — nothing is lost.
          </p>
        </div>
        {profile && <StatusPill status={profile.status} />}
      </div>

      {profile?.status === "KYC_REJECTED" && profile.kycRejectionReason && (
        <div className="bg-danger-tint border border-danger rounded-[14px] px-4 py-3 mt-5">
          <p className="text-[13px] font-extrabold text-danger-dark">
            Your documents came back with a problem
          </p>
          <p className="text-[13px] text-danger-dark mt-1">
            {profile.kycRejectionReason}
          </p>
        </div>
      )}

      <ol className="flex flex-col gap-3 mt-7">
        {GATES.map((gate, i) => {
          const done = i < reached;
          const current = i === reached;
          return (
            <li
              key={gate.key}
              className={cn(
                "flex gap-4 rounded-[16px] border p-4",
                current
                  ? "border-primary bg-selected-bg"
                  : done
                    ? "border-border bg-surface"
                    : "border-border bg-surface opacity-60",
              )}
            >
              <span
                className={cn(
                  "size-8 rounded-full grid place-items-center font-extrabold text-[13px] shrink-0",
                  done
                    ? "bg-primary text-white"
                    : current
                      ? "bg-primary text-white"
                      : "bg-divider text-ink-muted",
                )}
              >
                {done ? <Check size={15} strokeWidth={3} /> : i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-extrabold">{gate.title}</p>
                <p className="text-[13px] text-body-soft mt-1 leading-relaxed">
                  {gate.body}
                </p>
                {gate.key === "FEE_PAID" && (
                  <p className="text-[12.5px] text-ink-muted font-semibold mt-1.5">
                    Basic {inr(cfg.planBasicPricePaise)} · Pro{" "}
                    {inr(cfg.planProPricePaise)} per year, plus {cfg.gstPct}% GST
                    — <Link href="/organizer/pricing">compare plans</Link>
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 bg-surface border border-border rounded-[16px] p-5">
        {profile?.status === "VERIFIED" ? (
          <>
            <h2 className="text-[17px]">You&apos;re verified</h2>
            <p className="text-[13.5px] text-body-soft mt-1.5">
              Your organizer portal — creating events, sales, live ops and
              settlements — is the next thing we&apos;re building. You&apos;ll
              be able to publish from there.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-[17px]">
              {profile ? "Continue where you left off" : "Start the first step"}
            </h2>
            <p className="text-[13.5px] text-body-soft mt-1.5">
              Have your PAN, GST certificate if you have one, and a cancelled
              cheque or bank statement ready. The wizard that captures these is
              the next thing we&apos;re building.
            </p>
          </>
        )}
        <div className="flex gap-2.5 mt-4 flex-wrap">
          <Link href="/organizer/pricing">
            <Button variant="outline">Compare plans</Button>
          </Link>
          <Link href="/account/help">
            <Button variant="ghost">Talk to us first</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
