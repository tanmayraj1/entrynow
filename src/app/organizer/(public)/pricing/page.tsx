import Link from "next/link";
import type { Metadata } from "next";
import { Check } from "lucide-react";
import { Button } from "@/components/ui";
import { getBusinessConfig } from "@/lib/config";
import { inr, pctOf } from "@/lib/money";

export const metadata: Metadata = {
  title: "Plans & commission",
  description: "What listing on Entry Now costs — plans, commission and GST.",
};

export default async function PricingPage() {
  const cfg = await getBusinessConfig();

  const plans = [
    {
      name: "Basic",
      pricePaise: cfg.planBasicPricePaise,
      commission: cfg.platformCommissionPct,
      highlight: false,
      perks: [
        `Up to ${cfg.planBasicLiveEventCap} live events at a time`,
        `${cfg.platformCommissionPct}% commission on ticket sales`,
        "QR entry and the gate scanner",
        "Daily settlement after each event",
        "Email support",
      ],
    },
    {
      name: "Pro",
      pricePaise: cfg.planProPricePaise,
      commission: cfg.planProCommissionPct,
      highlight: true,
      perks: [
        "Unlimited live events",
        `${cfg.planProCommissionPct}% commission on ticket sales`,
        "Eligible for homepage featuring",
        "Live ops board and per-gate throughput",
        "Announcement blasts to your attendees",
        "Priority support on event days",
      ],
    },
  ];

  // Worked example so the commission is concrete rather than a percentage.
  const exampleSale = 100_000_00; // ₹1,00,000 of tickets sold

  return (
    <div className="px-4 md:px-6 lg:px-12 py-10">
      <div className="max-w-2xl">
        <h1 className="text-[28px] md:text-[34px] tracking-[-0.8px]">
          Plans &amp; commission
        </h1>
        <p className="text-[14px] text-body-soft mt-2 leading-relaxed">
          One annual plan, plus commission on what you actually sell. GST at{" "}
          {cfg.gstPct}% applies to both, as Indian law requires.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 max-w-4xl mt-8">
        {plans.map((p) => (
          <div
            key={p.name}
            className={`rounded-[20px] p-6 border-2 flex flex-col ${
              p.highlight
                ? "border-primary bg-selected-bg"
                : "border-border bg-surface"
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[20px]">{p.name}</h2>
              {p.highlight && (
                <span className="text-[10.5px] font-extrabold text-white bg-primary px-2.5 py-1 rounded-full">
                  MOST CHOSEN
                </span>
              )}
            </div>

            <p className="mt-3">
              <span className="text-[32px] font-extrabold tabular">
                {inr(p.pricePaise)}
              </span>
              <span className="text-[13px] text-ink-muted font-semibold">
                {" "}
                / year
              </span>
            </p>
            <p className="text-[12px] text-ink-muted font-semibold">
              + {cfg.gstPct}% GST — {inr(p.pricePaise + pctOf(p.pricePaise, cfg.gstPct))}{" "}
              in total
            </p>

            <ul className="flex flex-col gap-2 mt-5 grow">
              {p.perks.map((perk) => (
                <li
                  key={perk}
                  className="flex items-start gap-2 text-[13px] text-body-soft"
                >
                  <Check
                    size={15}
                    strokeWidth={2.6}
                    className="text-primary shrink-0 mt-0.5"
                  />
                  {perk}
                </li>
              ))}
            </ul>

            <Link href="/organizer/onboarding" className="mt-6">
              <Button fullWidth variant={p.highlight ? "primary" : "outline"}>
                Choose {p.name}
              </Button>
            </Link>
          </div>
        ))}
      </div>

      <section className="max-w-4xl mt-10">
        <h2 className="text-[20px]">What that means on real money</h2>
        <p className="text-[13.5px] text-body-soft mt-1.5">
          If you sell {inr(exampleSale)} of tickets:
        </p>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-[13px] border-collapse bg-surface border border-border rounded-[14px] overflow-hidden">
            <thead>
              <tr className="bg-bg">
                <th className="text-left font-bold text-[11.5px] uppercase tracking-wide text-ink-muted px-4 py-3">
                  Plan
                </th>
                <th className="text-right font-bold text-[11.5px] uppercase tracking-wide text-ink-muted px-4 py-3">
                  Commission
                </th>
                <th className="text-right font-bold text-[11.5px] uppercase tracking-wide text-ink-muted px-4 py-3">
                  GST on it
                </th>
                <th className="text-right font-bold text-[11.5px] uppercase tracking-wide text-ink-muted px-4 py-3">
                  You receive
                </th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => {
                const commission = pctOf(exampleSale, p.commission);
                const gst = pctOf(commission, cfg.gstPct);
                return (
                  <tr key={p.name} className="border-t border-divider">
                    <td className="px-4 py-3 font-bold">{p.name}</td>
                    <td className="px-4 py-3 text-right tabular font-semibold">
                      {inr(commission)}
                    </td>
                    <td className="px-4 py-3 text-right tabular font-semibold">
                      {inr(gst)}
                    </td>
                    <td className="px-4 py-3 text-right tabular font-extrabold text-primary">
                      {inr(exampleSale - commission - gst)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="text-[13px] text-body-soft mt-4 flex flex-col gap-1.5 list-disc pl-5">
          <li>
            The booking fee attendees pay at checkout ({cfg.bookingFeePct}% of
            the ticket subtotal, {inr(cfg.bookingFeeMinPaise)}–
            {inr(cfg.bookingFeeMaxPaise)}) is ours, not yours — it does not come
            out of your revenue.
          </li>
          <li>
            Payouts run daily and release {cfg.payoutDelayDays} days after your
            event completes, to your verified bank account.
          </li>
          <li>
            Refunds you or we authorise are deducted from the settlement for
            that event.
          </li>
        </ul>
      </section>
    </div>
  );
}
