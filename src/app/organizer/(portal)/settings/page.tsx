import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, Circle, ShieldCheck } from "lucide-react";
import { StatusPill } from "@/components/ui";
import { requireOrganizer } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { getBusinessConfig } from "@/lib/config";
import { formatIstDate } from "@/lib/ist";
import { inr } from "@/lib/money";

export const metadata: Metadata = { title: "Settings" };

/**
 * Profile, plan and KYC state.
 *
 * Read-only in this phase, by design. KYC document upload needs the storage
 * adapter (`STORAGE_DRIVER` is still an unread env key) and a penny-drop bank
 * verification, and a form that accepts a PAN number into a text field without
 * either of those would be a liability wearing the costume of a feature. What
 * this page does is tell an organizer exactly where they stand and what is
 * next — which is the part they actually need today.
 */
export default async function OrganizerSettingsPage() {
  const ctx = await requireOrganizer({ allowUnverified: true });

  const [profile, cfg] = await Promise.all([
    db.organizerProfile.findUnique({
      where: { id: ctx.organizerId },
      select: {
        name: true,
        slug: true,
        status: true,
        verified: true,
        legalName: true,
        businessType: true,
        contactEmail: true,
        contactPhone: true,
        addressLine: true,
        pincode: true,
        plan: true,
        onboardingFeePaidAt: true,
        planExpiresAt: true,
        commissionPctOverride: true,
        kycSubmittedAt: true,
        kycReviewedAt: true,
        kycRejectionReason: true,
        bankVerifiedAt: true,
        suspendedAt: true,
        suspendedReason: true,
        ratingAvg: true,
        ratingCount: true,
        followerCount: true,
        // Presence only — the numbers themselves are never rendered, and the
        // audit log redacts them too. Whether KYC is on file is the useful
        // fact; the document is not.
        panNumber: true,
        bankAccountNumber: true,
      },
    }),
    getBusinessConfig(),
  ]);

  if (!profile) {
    return <p className="text-[13px] font-semibold">Profile not found.</p>;
  }

  const commissionPct =
    ctx.commissionPctOverride ?? cfg.platformCommissionPct;

  const steps = [
    { label: "Account created", done: true },
    { label: "Business details submitted", done: Boolean(profile.legalName) },
    { label: "Plan purchased", done: Boolean(profile.onboardingFeePaidAt) },
    { label: "KYC documents submitted", done: Boolean(profile.kycSubmittedAt) },
    { label: "Bank account verified", done: Boolean(profile.bankVerifiedAt) },
    { label: "Verified — publishing enabled", done: profile.verified },
  ];

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div>
        <h1 className="text-[20px] font-extrabold leading-tight">Settings</h1>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          {profile.name} · /{profile.slug}
        </p>
      </div>

      {profile.suspendedAt && (
        <div className="rounded-[var(--radius-card)] border border-danger/25 bg-danger-tint px-4 py-3">
          <p className="text-[13px] font-extrabold text-danger-dark">
            This account is suspended
          </p>
          <p className="text-[12.5px] font-semibold text-danger-dark/85 mt-0.5">
            {profile.suspendedReason ?? "Contact support."} Your login stays
            open and every ticket already sold remains valid — you simply cannot
            make changes while this is being looked at.
          </p>
        </div>
      )}

      {profile.kycRejectionReason && (
        <div className="rounded-[var(--radius-card)] border border-status-warning-fg/25 bg-status-warning-bg px-4 py-3">
          <p className="text-[13px] font-extrabold text-status-warning-fg">
            KYC needs attention
          </p>
          <p className="text-[12.5px] font-semibold text-status-warning-fg/85 mt-0.5">
            {profile.kycRejectionReason}
          </p>
        </div>
      )}

      <section className="bg-surface border border-border rounded-[var(--radius-card)] p-4 lg:p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-[14.5px] font-extrabold">Onboarding</h2>
          <StatusPill status={profile.status} />
        </div>
        <ol className="flex flex-col gap-2.5">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center gap-2.5">
              {s.done ? (
                <CheckCircle2
                  size={16}
                  strokeWidth={2.4}
                  className="text-status-success-fg shrink-0"
                />
              ) : (
                <Circle
                  size={16}
                  strokeWidth={2.2}
                  className="text-ink-muted shrink-0"
                />
              )}
              <span
                className={
                  s.done
                    ? "text-[13px] font-bold"
                    : "text-[13px] font-semibold text-ink-muted"
                }
              >
                {s.label}
              </span>
            </li>
          ))}
        </ol>
        {!profile.verified && (
          <p className="text-[12px] font-semibold text-ink-muted mt-4">
            Documents are collected over a secure upload that is not part of
            this build yet.{" "}
            <Link href="/organizer/onboarding" className="text-primary font-bold hover:underline">
              See what is needed
            </Link>
          </p>
        )}
      </section>

      <div className="grid sm:grid-cols-2 gap-4">
        <section className="bg-surface border border-border rounded-[var(--radius-card)] p-4 lg:p-5">
          <h2 className="text-[14.5px] font-extrabold mb-3.5">Plan</h2>
          <dl className="flex flex-col gap-2.5">
            <Row
              k="Tier"
              v={profile.plan ? (profile.plan === "PRO" ? "Pro" : "Basic") : "None yet"}
            />
            <Row k="Commission" v={`${commissionPct}% + GST`} />
            <Row
              k="Live event cap"
              v={
                profile.plan === "PRO"
                  ? "Unlimited"
                  : `${cfg.planBasicLiveEventCap} events`
              }
            />
            <Row
              k="Paid"
              v={
                profile.onboardingFeePaidAt
                  ? formatIstDate(profile.onboardingFeePaidAt)
                  : "—"
              }
            />
            <Row
              k="Renews"
              v={profile.planExpiresAt ? formatIstDate(profile.planExpiresAt) : "—"}
            />
          </dl>
          {profile.plan === "BASIC" && (
            <p className="text-[12px] font-semibold text-ink-muted mt-3.5">
              Pro drops commission to {cfg.planProCommissionPct}% and removes the
              live cap — {inr(cfg.planProPricePaise)} a year.{" "}
              <Link href="/organizer/pricing" className="text-primary font-bold hover:underline">
                Compare
              </Link>
            </p>
          )}
        </section>

        <section className="bg-surface border border-border rounded-[var(--radius-card)] p-4 lg:p-5">
          <h2 className="text-[14.5px] font-extrabold mb-3.5">Business</h2>
          <dl className="flex flex-col gap-2.5">
            <Row k="Legal name" v={profile.legalName ?? "—"} />
            <Row k="Type" v={profile.businessType ?? "—"} />
            <Row k="Contact" v={profile.contactEmail ?? profile.contactPhone ?? "—"} />
            <Row
              k="Address"
              v={
                profile.addressLine
                  ? `${profile.addressLine}${profile.pincode ? ` – ${profile.pincode}` : ""}`
                  : "—"
              }
            />
            <Row
              k="PAN on file"
              v={profile.panNumber ? "Yes" : "Not yet"}
            />
            <Row
              k="Bank on file"
              v={
                profile.bankVerifiedAt
                  ? "Verified"
                  : profile.bankAccountNumber
                    ? "Awaiting verification"
                    : "Not yet"
              }
            />
          </dl>
          <p className="flex items-start gap-1.5 text-[11.5px] font-semibold text-ink-muted mt-3.5">
            <ShieldCheck size={13} strokeWidth={2.4} className="shrink-0 mt-px" />
            PAN, GST and bank details are never shown in full here or in the
            audit log.
          </p>
        </section>
      </div>

      <section className="bg-surface border border-border rounded-[var(--radius-card)] p-4 lg:p-5">
        <h2 className="text-[14.5px] font-extrabold mb-3.5">Public profile</h2>
        <dl className="flex flex-col gap-2.5">
          <Row
            k="Rating"
            v={
              profile.ratingCount > 0
                ? `${Number(profile.ratingAvg).toFixed(1)} from ${profile.ratingCount} review${profile.ratingCount === 1 ? "" : "s"}`
                : "No reviews yet"
            }
          />
          <Row k="Followers" v={profile.followerCount.toLocaleString("en-IN")} />
          <Row k="Verified badge" v={profile.verified ? "Shown" : "Not yet"} />
        </dl>
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[12px] font-bold text-ink-muted shrink-0">{k}</dt>
      <dd className="text-[13px] font-bold text-right truncate">{v}</dd>
    </div>
  );
}
