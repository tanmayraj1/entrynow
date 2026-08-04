import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { Money } from "@/components/ui";
import { DemoCheckout } from "@/components/marketplace/demo-checkout";
import { HoldCountdown } from "@/components/marketplace/hold-countdown";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isDemoMode } from "@/lib/demo";

export const metadata: Metadata = { title: "Payment" };

/**
 * The demo payment screen.
 *
 * Stands in for the gateway's hosted page. It is a real screen rather than an
 * auto-confirm because the whole point of exercising a checkout is the part
 * where a human chooses a method, mistypes a card, gets declined and retries —
 * none of which a promise resolving in the background rehearses.
 *
 * The outcome is decided by the card number, and the confirmation still
 * arrives as a signed webhook on its own connection (D-008). Nothing on this
 * page confirms a booking directly.
 */
export default async function PayPage({
  params,
}: PageProps<"/booking/[bookingNumber]/pay">) {
  const { bookingNumber } = await params;

  const user = await getSessionUser();
  if (!user) notFound();

  const booking = await db.booking.findUnique({
    where: { bookingNumber },
    include: {
      event: { select: { title: true } },
      payments: {
        where: { status: "CREATED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { gatewayOrderId: true },
      },
    },
  });

  if (!booking || booking.userId !== user.id) notFound();

  // Anything already settled belongs on the booking page, not here.
  if (booking.status !== "PENDING_PAYMENT") {
    redirect(`/booking/${bookingNumber}`);
  }

  const gatewayOrderId = booking.payments[0]?.gatewayOrderId ?? null;

  return (
    <div className="px-4 md:px-6 lg:px-12 py-8 max-w-xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <span className="flex items-center gap-2 text-[13px] font-bold text-ink-muted">
          <Lock size={14} strokeWidth={2.4} />
          Secure checkout
        </span>
        {booking.expiresAt && (
          <HoldCountdown expiresAt={booking.expiresAt.toISOString()} />
        )}
      </div>

      <div className="bg-surface border border-border rounded-[20px] overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-[12px] font-extrabold tracking-[0.06em] text-ink-muted">
            PAYING FOR
          </p>
          <p className="text-[15px] font-extrabold mt-1">{booking.event.title}</p>
          <p className="text-[12.5px] text-ink-muted font-semibold mt-0.5">
            Booking {booking.bookingNumber}
          </p>
          <p className="mt-3">
            <Money
              paise={booking.gatewayPayablePaise}
              className="text-[26px] font-extrabold"
            />
          </p>
        </div>

        {isDemoMode() ? (
          <DemoCheckout
            bookingNumber={booking.bookingNumber}
            bookingId={booking.id}
            gatewayOrderId={gatewayOrderId}
            amountPaise={booking.gatewayPayablePaise}
          />
        ) : (
          <div className="p-5">
            <p className="text-[13.5px] text-body-soft leading-relaxed">
              This build has no live payment gateway configured. Set
              <code className="mx-1">PAYMENTS_DRIVER</code> and the gateway
              credentials to take real payments.
            </p>
            <Link
              href={`/booking/${bookingNumber}`}
              className="text-[13px] font-bold mt-3 inline-block"
            >
              ← Back to the booking
            </Link>
          </div>
        )}
      </div>

      <p className="text-[12px] text-ink-muted mt-4 text-center">
        Leaving this page will not cancel your hold — the timer runs on our
        server.
      </p>
    </div>
  );
}
