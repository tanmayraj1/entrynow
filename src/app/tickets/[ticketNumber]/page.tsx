import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MapPin, Ticket as TicketIcon } from "lucide-react";
import QRCode from "qrcode";
import { Button, Money, StatusPill } from "@/components/ui";
import { SignInPrompt } from "@/components/marketplace/sign-in-prompt";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { signQr } from "@/lib/qr";
import { formatIstDate, formatIstTime } from "@/lib/ist";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Your ticket" };

export default async function TicketPage({
  params,
}: PageProps<"/tickets/[ticketNumber]">) {
  const { ticketNumber } = await params;
  const user = await getSessionUser();

  if (!user) {
    return (
      <SignInPrompt
        title="Sign in to see this ticket"
        body="Tickets are tied to the phone number they were booked with."
        next={`/tickets/${ticketNumber}`}
      />
    );
  }

  const ticket = await db.ticket.findFirst({
    // Scoped to the owner: a ticket number must not be a way to read someone
    // else's QR.
    where: { ticketNumber, userId: user.id },
    include: {
      event: {
        include: {
          city: { select: { slug: true } },
          category: { select: { gradient: true, name: true } },
          venue: {
            select: {
              name: true,
              addressLine: true,
              lat: true,
              lng: true,
              locality: { select: { name: true } },
            },
          },
        },
      },
      tier: true,
      session: true,
      booking: { select: { bookingNumber: true, totalPaise: true } },
      scannedGate: { select: { name: true } },
    },
  });

  if (!ticket) notFound();

  // The QR carries a SIGNED payload over the opaque token, not the token
  // itself — so a forged code fails at the gate before it touches the
  // database, and rotating `QR_JWT_SECRET` really does invalidate every
  // outstanding ticket (which the docs claimed long before it was true).
  // Everything else is still looked up server-side at scan time, so a
  // screenshot leaks nothing but a single-use claim.
  //
  // Expiry is the event's own last session plus a wide margin. A tight window
  // would turn a paying attendee away over a wrong clock at a ground; the
  // atomic single-use claim, not expiry, is what stops a shared screenshot.
  const lastSession = await db.eventSession.findFirst({
    where: { eventId: ticket.eventId },
    orderBy: { endsAt: "desc" },
    select: { endsAt: true },
  });
  const expiresAt = new Date(
    (lastSession?.endsAt ?? new Date()).getTime() + 7 * 86_400_000,
  );
  const qrPayload = await signQr(
    { jti: ticket.qrTokenId, ev: ticket.eventId },
    expiresAt,
  );
  const qrSvg = await QRCode.toString(qrPayload, {
    type: "svg",
    margin: 0,
    // A signed JWS is ~180 chars against the bare token's 25, so the symbol is
    // denser. "M" keeps it scannable through a cracked screen at gate
    // distance; "H" would push the module count past what a cheap phone
    // camera resolves in poor light.
    errorCorrectionLevel: "M",
  });

  const dead =
    ticket.status === "CANCELLED" ||
    ticket.status === "EXPIRED" ||
    ticket.status === "SCANNED" ||
    ticket.status === "TRANSFERRED";

  const overlay =
    ticket.status === "SCANNED"
      ? ticket.scannedAt
        ? `Scanned at ${formatIstTime(ticket.scannedAt)}${ticket.scannedGate ? ` · ${ticket.scannedGate.name}` : ""}`
        : "Already scanned"
      : ticket.status === "CANCELLED"
        ? "Cancelled"
        : ticket.status === "EXPIRED"
          ? "Expired"
          : ticket.status === "TRANSFERRED"
            ? "Transferred"
            : null;

  return (
    <div className="px-4 md:px-6 lg:px-12 py-8 max-w-lg mx-auto">
      <Link href="/tickets" className="text-[13px] font-bold">
        ‹ All tickets
      </Link>

      <div className="bg-surface border border-border rounded-[20px] overflow-hidden mt-3">
        <div
          className="px-5 py-4 text-white"
          style={{ background: `var(--gradient-${ticket.event.category.gradient})` }}
        >
          <p className="text-[11px] font-extrabold tracking-[0.1em] opacity-90">
            {ticket.event.category.name.toUpperCase()}
          </p>
          <h1 className="text-[19px] leading-tight mt-0.5">
            {ticket.event.title}
          </h1>
        </div>

        <div className="p-5 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <StatusPill status={ticket.status} />
            <span className="text-[12px] font-bold text-ink-muted tabular">
              {ticket.ticketNumber}
            </span>
          </div>

          <div className="relative">
            <div
              // A scanned QR renders at 18% opacity with an overlay pill, per
              // the design's QR lifecycle.
              className={cn(
                "size-[220px] [&_svg]:size-full",
                dead && "opacity-[0.18]",
              )}
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            {overlay && (
              <span className="absolute inset-0 grid place-items-center">
                <span className="bg-ink text-white text-[12px] font-extrabold px-3.5 py-2 rounded-full text-center">
                  {overlay}
                </span>
              </span>
            )}
          </div>

          <p className="text-[12px] text-ink-muted font-semibold text-center max-w-xs">
            {dead
              ? "This QR is no longer valid for entry."
              : "Turn your brightness up at the gate. This admits one person, once."}
          </p>
        </div>

        <dl className="border-t border-divider px-5 py-4 grid grid-cols-2 gap-3 text-[13px]">
          <Fact label="Attendee" value={ticket.attendeeName} />
          <Fact label="Tier" value={ticket.tier.name} />
          {ticket.session && (
            <>
              <Fact label="Date" value={formatIstDate(ticket.session.startsAt)} />
              <Fact
                label="Time"
                value={`${formatIstTime(ticket.session.startsAt)} – ${formatIstTime(ticket.session.endsAt)}`}
              />
            </>
          )}
          <Fact label="Booking" value={ticket.booking.bookingNumber} />
          <Fact
            label="Paid"
            value={<Money paise={ticket.booking.totalPaise} />}
          />
        </dl>

        <div className="border-t border-divider px-5 py-4">
          <p className="text-[11px] font-extrabold text-ink-muted tracking-[0.06em]">
            VENUE
          </p>
          <p className="text-[13.5px] font-bold mt-1 flex items-start gap-1.5">
            <MapPin size={14} strokeWidth={2.2} className="mt-0.5 shrink-0" />
            <span>
              {ticket.event.venue.name}
              <span className="block text-[12.5px] text-ink-muted font-semibold">
                {ticket.event.venue.addressLine}
              </span>
            </span>
          </p>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${ticket.event.venue.lat},${ticket.event.venue.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2.5"
          >
            <Button variant="outline" size="sm">
              Open in Maps ↗
            </Button>
          </a>
        </div>
      </div>

      {!dead && (
        <div className="bg-surface border border-border rounded-[18px] p-5 mt-4">
          <h2 className="text-[15px] flex items-center gap-2">
            <TicketIcon size={16} strokeWidth={2.2} />
            Manage this ticket
          </h2>
          <p className="text-[13px] text-body-soft mt-1.5 leading-relaxed">
            Transfers and cancellation are the next thing being built. Until
            then,{" "}
            <Link href="/account/help">our help centre</Link> covers what to do,
            and support can action either for you.
          </p>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10.5px] font-extrabold text-ink-muted tracking-[0.06em]">
        {label.toUpperCase()}
      </dt>
      <dd className="font-bold mt-0.5">{value}</dd>
    </div>
  );
}
