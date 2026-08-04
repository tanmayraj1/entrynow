import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AlertCircle } from "lucide-react";
import { Button, Money } from "@/components/ui";
import { GuestCheckout } from "@/components/marketplace/guest-checkout";
import { CheckoutButton } from "@/components/marketplace/checkout-button";
import { getSessionUser } from "@/lib/auth/session";
import { getBusinessConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { computeOrderTotals } from "@/lib/money";
import { isTierBookable, tierRemaining } from "@/lib/availability";
import { formatIstDate, formatIstTime } from "@/lib/ist";

export const metadata: Metadata = { title: "Checkout" };

/** "tierId:2,otherId:1" -> [{ tierId, quantity }] */
function parseTierParam(raw: string | undefined): { tierId: string; quantity: number }[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((pair) => {
      const [tierId, qty] = pair.split(":");
      const quantity = Number(qty);
      return tierId && Number.isInteger(quantity) && quantity > 0
        ? { tierId, quantity }
        : null;
    })
    .filter((x): x is { tierId: string; quantity: number } => x !== null);
}

export default async function NewBookingPage({
  searchParams,
}: PageProps<"/booking/new">) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const eventSlug = one("event");
  const requested = parseTierParam(one("tiers"));
  const sessionId = one("session");

  if (!eventSlug || requested.length === 0) notFound();

  const event = await db.event.findFirst({
    where: { slug: eventSlug, status: "LIVE" },
    include: {
      city: { select: { slug: true } },
      venue: { select: { name: true, locality: { select: { name: true } } } },
      organizer: { select: { commissionPctOverride: true } },
      tiers: true,
      sessions: { where: { isActive: true }, orderBy: { startsAt: "asc" } },
    },
  });
  if (!event) notFound();

  const returnTo = `/booking/new?event=${eventSlug}&tiers=${one("tiers")}${sessionId ? `&session=${sessionId}` : ""}`;

  const user = await getSessionUser();
  if (!user) {
    // No account required (D-036). The three fields collected here are the
    // three the platform actually needs, and the buyer comes straight back to
    // this URL with their selection intact.
    return <GuestCheckout next={returnTo} />;
  }

  // Invariant I4: prices come from the database, never from the URL.
  const now = new Date();
  const lines = requested
    .map((r) => {
      const tier = event.tiers.find((t) => t.id === r.tierId);
      if (!tier) return null;
      return {
        tier,
        quantity: r.quantity,
        bookable: isTierBookable(tier, now),
        remaining: tierRemaining(tier),
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  if (lines.length === 0) notFound();

  const problems = lines
    .filter((l) => !l.bookable || l.quantity > l.remaining || l.quantity > l.tier.perUserLimit)
    .map((l) =>
      !l.bookable
        ? `${l.tier.name} is no longer on sale.`
        : l.quantity > l.remaining
          ? `Only ${l.remaining} left of ${l.tier.name}.`
          : `${l.tier.name} is limited to ${l.tier.perUserLimit} per person.`,
    );

  const cfg = await getBusinessConfig();
  const totals = computeOrderTotals({
    lines: lines.map((l) => ({
      tierId: l.tier.id,
      unitPricePaise: l.tier.pricePaise,
      quantity: l.quantity,
    })),
    config: cfg,
  });


  const session = sessionId
    ? event.sessions.find((s) => s.id === sessionId)
    : undefined;
  const eventHref = `/${event.city.slug}/events/${event.slug}`;

  return (
    <div className="px-4 md:px-6 lg:px-12 py-8 max-w-3xl mx-auto">
      <Link href={eventHref} className="text-[13px] font-bold">
        ‹ Back to {event.title}
      </Link>

      <h1 className="text-[24px] tracking-[-0.5px] mt-3">Review your order</h1>

      {problems.length > 0 && (
        <div className="bg-danger-tint border border-danger rounded-[14px] px-4 py-3 mt-4 flex gap-3">
          <AlertCircle size={18} className="text-danger-dark shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-extrabold text-danger-dark">
              These seats aren&apos;t available any more
            </p>
            <ul className="text-[13px] text-danger-dark mt-1 list-disc pl-4">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <Link href={eventHref}>
              <Button variant="danger" size="sm" className="mt-2.5">
                Pick again
              </Button>
            </Link>
          </div>
        </div>
      )}

      <section className="bg-surface border border-border rounded-[18px] p-5 mt-5">
        <h2 className="text-[16px]">{event.title}</h2>
        <p className="text-[12.5px] text-ink-muted font-semibold mt-1">
          {event.venue.locality?.name ?? event.venue.name}
          {session &&
            ` · ${formatIstDate(session.startsAt)} · ${formatIstTime(session.startsAt)}`}
        </p>

        <ul className="flex flex-col gap-2 mt-4 pt-4 border-t border-divider">
          {lines.map((l) => (
            <li
              key={l.tier.id}
              className="flex items-center justify-between gap-3 text-[13.5px]"
            >
              <span className="font-semibold">
                {l.tier.name}
                <span className="text-ink-muted"> × {l.quantity}</span>
              </span>
              <Money
                paise={l.tier.pricePaise * l.quantity}
                className="font-extrabold"
              />
            </li>
          ))}
        </ul>

        <dl className="flex flex-col gap-1.5 mt-4 pt-4 border-t border-divider text-[13px]">
          <Row label="Subtotal" paise={totals.subtotalPaise} />
          <Row
            label={`Booking fee (${cfg.bookingFeePct}%)`}
            paise={totals.bookingFeePaise}
          />
          <Row label={`GST (${cfg.gstPct}% on fee)`} paise={totals.gstOnFeePaise} />
          <div className="flex justify-between items-baseline pt-2.5 mt-1.5 border-t border-divider">
            <dt className="text-[15px] font-extrabold">Total</dt>
            <dd>
              <Money
                paise={totals.totalPaise}
                className="text-[20px] font-extrabold"
              />
            </dd>
          </div>
        </dl>
      </section>

      <section className="bg-surface border border-border rounded-[18px] p-5 mt-4">
        <h2 className="text-[16px]">Payment</h2>
        <p className="text-[13.5px] text-body-soft mt-1.5 leading-relaxed">
          Your seats are held for <b>{cfg.bookingHoldMinutes} minutes</b> from
          the moment you continue. The countdown on the next screen comes from
          our server, not your device — if it runs out the seats go back on
          sale automatically and nothing is charged.
        </p>
        <div className="mt-4">
          <CheckoutButton
            eventSlug={event.slug}
            sessionId={session?.id ?? null}
            lines={lines.map((l) => ({
              tierId: l.tier.id,
              quantity: l.quantity,
            }))}
            totalPaise={totals.totalPaise}
            disabled={problems.length > 0}
          />
        </div>
        <Link href={eventHref} className="inline-block mt-3">
          <Button variant="outline" size="sm">
            Back to event
          </Button>
        </Link>
      </section>

      <p className="text-[12px] text-ink-muted mt-4">
        By paying you accept the <Link href="/legal/terms">terms of use</Link> and
        this event&apos;s <Link href="/legal/refunds">refund policy</Link>.
      </p>
    </div>
  );
}

function Row({ label, paise }: { label: string; paise: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-body-soft font-semibold">{label}</dt>
      <dd className="font-bold">
        <Money paise={paise} />
      </dd>
    </div>
  );
}
