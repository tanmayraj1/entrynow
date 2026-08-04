import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { Button, Money, StatusPill } from "@/components/ui";
import { HoldCountdown } from "@/components/marketplace/hold-countdown";
import { TicketStub } from "@/components/brand/ticket-stub";
import { CategoryGlyph } from "@/components/brand/category-glyph";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatIstDate, formatIstTime } from "@/lib/ist";

export const metadata: Metadata = { title: "Your booking" };

/**
 * One booking, in whatever state it is actually in.
 *
 * Deliberately a server component that re-reads on every refresh rather than a
 * client flow holding its own idea of progress: the authority on whether this
 * booking is paid is the webhook that already landed, and the only honest way
 * to show that is to ask the database.
 */
export default async function BookingPage({
  params,
}: PageProps<"/booking/[bookingNumber]">) {
  const { bookingNumber } = await params;

  const user = await getSessionUser();
  if (!user) notFound();

  const booking = await db.booking.findUnique({
    where: { bookingNumber },
    include: {
      event: {
        select: {
          title: true,
          slug: true,
          shortCode: true,
          city: { select: { slug: true } },
          category: { select: { slug: true, name: true } },
          venue: { select: { name: true, locality: { select: { name: true } } } },
        },
      },
      items: { include: { tier: { select: { name: true } }, session: true } },
      tickets: { select: { id: true, ticketNumber: true, status: true } },
      payments: {
        orderBy: { createdAt: "desc" },
        select: { status: true, failureReason: true },
      },
    },
  });

  // Scoped to the owner. A booking number is guessable enough that it must not
  // be the only thing standing between a stranger and someone's tickets.
  if (!booking || booking.userId !== user.id) notFound();

  const eventHref = `/${booking.event.city.slug}/events/${booking.event.slug}`;
  const pending = booking.status === "PENDING_PAYMENT";
  const confirmed = booking.status === "CONFIRMED";
  const failed = ["FAILED", "EXPIRED"].includes(booking.status);
  const lastPayment = booking.payments[0];

  return (
    <div className="px-4 md:px-6 lg:px-12 py-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-[24px] tracking-[-0.5px]">
          Booking {booking.bookingNumber}
        </h1>
        <StatusPill status={booking.status} />
      </div>

      {/* ------------------------------------------------------------ status */}
      {pending && booking.expiresAt && (
        <div className="mt-4 bg-surface border border-border rounded-[18px] p-5">
          <HoldCountdown
            expiresAt={booking.expiresAt.toISOString()}
            pollWhilePending
          />
          <p className="text-[13.5px] text-body-soft mt-3 leading-relaxed">
            Your seats are held. We&apos;re waiting for the payment to confirm —
            this page updates itself, so there is no need to reload. If the hold
            runs out the seats go back on sale and you will not be charged.
          </p>
        </div>
      )}

      {confirmed && (
        <div className="mt-4 bg-status-confirmed-bg border border-border rounded-[18px] p-5 flex gap-3">
          <CheckCircle2 size={22} className="text-status-confirmed-fg shrink-0" />
          <div>
            <p className="text-[15px] font-extrabold text-status-confirmed-fg">
              You&apos;re going.
            </p>
            <p className="text-[13.5px] text-body-soft mt-1 leading-relaxed">
              {booking.tickets.length}{" "}
              {booking.tickets.length === 1 ? "ticket" : "tickets"} issued. Each
              one carries its own QR and admits one person, once.
            </p>
            <Link href="/tickets" className="inline-block mt-3">
              <Button size="sm">Open my tickets</Button>
            </Link>
          </div>
        </div>
      )}

      {failed && (
        <div className="mt-4 bg-danger-tint border border-danger rounded-[18px] p-5 flex gap-3">
          <XCircle size={22} className="text-danger-dark shrink-0" />
          <div>
            <p className="text-[15px] font-extrabold text-danger-dark">
              {booking.status === "EXPIRED"
                ? "The hold ran out"
                : "That payment did not go through"}
            </p>
            <p className="text-[13.5px] text-danger-dark mt-1 leading-relaxed">
              {lastPayment?.failureReason ??
                booking.cancelReason ??
                "No money was taken."}{" "}
              The seats are back on sale — you can try again.
            </p>
            <Link href={eventHref} className="inline-block mt-3">
              <Button variant="danger" size="sm">
                Pick again
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- order */}
      <section className="bg-surface border border-border rounded-[18px] p-5 mt-4">
        <h2 className="text-[16px]">{booking.event.title}</h2>
        <p className="text-[12.5px] text-ink-muted font-semibold mt-1">
          {booking.event.venue.locality?.name ?? booking.event.venue.name}
          {booking.items[0]?.session &&
            ` · ${formatIstDate(booking.items[0].session.startsAt)} · ${formatIstTime(booking.items[0].session.startsAt)}`}
        </p>

        <ul className="flex flex-col gap-2 mt-4 pt-4 border-t border-divider">
          {booking.items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 text-[13.5px]"
            >
              <span className="font-semibold">
                {item.tier.name}
                <span className="text-ink-muted"> × {item.quantity}</span>
              </span>
              <Money
                paise={item.unitPricePaise * item.quantity}
                className="font-extrabold"
              />
            </li>
          ))}
        </ul>

        <dl className="flex flex-col gap-1.5 mt-4 pt-4 border-t border-divider text-[13px]">
          <Row label="Subtotal" paise={booking.subtotalPaise} />
          {booking.discountPaise > 0 && (
            <Row label="Promo discount" paise={-booking.discountPaise} />
          )}
          <Row label="Booking fee" paise={booking.bookingFeePaise} />
          <Row label="GST on fee" paise={booking.gstOnFeePaise} />
          {booking.walletAppliedPaise > 0 && (
            <Row label="Paid from wallet" paise={-booking.walletAppliedPaise} />
          )}
          <div className="flex justify-between items-baseline pt-2.5 mt-1.5 border-t border-divider">
            <dt className="text-[15px] font-extrabold">
              {confirmed ? "Paid" : "Total"}
            </dt>
            <dd>
              <Money
                paise={booking.totalPaise}
                className="text-[20px] font-extrabold"
              />
            </dd>
          </div>
        </dl>
      </section>

      {/* ----------------------------------------------------------- tickets */}
      {booking.tickets.length > 0 && (
        <section className="mt-4">
          <h2 className="text-[16px] mb-3">Your tickets</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {booking.tickets.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tickets/${t.ticketNumber}`}
                  className="block text-ink hover:text-ink"
                >
                  <TicketStub
                    stub={
                      <div className="w-[76px] h-full grid place-items-center px-2 py-4">
                        <span className="text-[10px] font-extrabold tracking-[0.06em] text-ink-muted">
                          ADMITS 1
                        </span>
                      </div>
                    }
                  >
                    <div className="p-3.5 flex items-center gap-3">
                      <span
                        aria-hidden
                        className="size-9 rounded-[10px] grid place-items-center text-primary bg-primary-tint shrink-0"
                      >
                        <CategoryGlyph
                          slug={booking.event.category.slug}
                          size={20}
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-extrabold tabular truncate">
                          {t.ticketNumber}
                        </span>
                        <span className="block text-[11.5px] text-ink-muted font-semibold">
                          {t.status}
                        </span>
                      </span>
                    </div>
                  </TicketStub>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pending && (
        <p className="text-[12px] text-ink-muted mt-4 flex items-start gap-2">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          Leaving this page will not cancel the hold — it runs on our server
          until the timer ends.
        </p>
      )}
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
