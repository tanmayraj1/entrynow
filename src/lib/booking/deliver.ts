import "server-only";

import { db } from "@/lib/db";
import { getSmsAdapter } from "@/lib/adapters/sms";
import { getEmailAdapter } from "@/lib/adapters/email";
import { formatIstDate, formatIstTime } from "@/lib/ist";
import { appUrl } from "@/lib/adapters/payments";

/**
 * Send a confirmed booking's tickets to the buyer (spec C4.6).
 *
 * Three channels, in descending order of how reliably they arrive:
 *
 *   1. **An in-app `Notification` row.** Always written. It is the only
 *      channel the platform fully controls, and the one a guest with a mistyped
 *      email still gets when they come back to the link.
 *   2. **SMS** to `buyerPhone` — the number the gate identifies them by.
 *   3. **Email** to `buyerEmail` — the copy that survives a lost phone.
 *
 * ## Why this runs *outside* the capture transaction
 *
 * The money has already moved. If an SMS provider is down, or an address
 * bounces, the correct outcome is a confirmed booking with a failed delivery —
 * never a rolled-back payment. So every send is wrapped, failures are logged,
 * and the function always resolves. The tickets exist in the database either
 * way and the confirmation screen shows them immediately, which is why a failed
 * send is an inconvenience rather than a lost ticket.
 *
 * Both adapters run their `sandbox` driver unless `SMS_DRIVER` / `EMAIL_DRIVER`
 * say otherwise, and sandbox logs rather than sends. **Nothing in the UI may
 * claim a message was delivered** — see `src/lib/adapters/email.ts`.
 */
export async function deliverTickets(bookingId: string): Promise<void> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      bookingNumber: true,
      userId: true,
      buyerName: true,
      buyerPhone: true,
      buyerEmail: true,
      event: { select: { title: true, slug: true } },
      tickets: { select: { ticketNumber: true } },
      items: { select: { sessionId: true } },
    },
  });
  if (!booking || booking.tickets.length === 0) return;

  const count = booking.tickets.length;
  const plural = count === 1 ? "ticket" : "tickets";
  const link = `${appUrl()}/tickets`;

  const session = booking.items[0]?.sessionId
    ? await db.eventSession.findUnique({
        where: { id: booking.items[0].sessionId },
        select: { startsAt: true },
      })
    : null;
  const when = session
    ? ` on ${formatIstDate(session.startsAt)} at ${formatIstTime(session.startsAt)}`
    : "";

  // 1. In-app. Written first and separately, because it is the channel that
  //    cannot fail for reasons outside this codebase.
  await db.notification
    .create({
      data: {
        userId: booking.userId,
        kind: "BOOKING_CONFIRMED",
        title: `${count} ${plural} for ${booking.event.title}`,
        body: `Booking ${booking.bookingNumber} is confirmed${when}. Show the QR at the gate.`,
        href: "/tickets",
      },
    })
    .catch((err) => console.error("[deliver] notification failed", err));

  const summary =
    `Entry Now: ${count} ${plural} confirmed for ${booking.event.title}${when}. ` +
    `Booking ${booking.bookingNumber}. Your QR: ${link}`;

  if (booking.buyerPhone) {
    await getSmsAdapter()
      .send(booking.buyerPhone, summary)
      .catch((err) => console.error("[deliver] sms failed", err));
  }

  if (booking.buyerEmail) {
    await getEmailAdapter()
      .send({
        to: booking.buyerEmail,
        subject: `Your ${plural} for ${booking.event.title}`,
        body:
          `Hi ${booking.buyerName ?? "there"},\n\n` +
          `${count} ${plural} confirmed for ${booking.event.title}${when}.\n` +
          `Booking number: ${booking.bookingNumber}\n` +
          `Ticket numbers: ${booking.tickets.map((t) => t.ticketNumber).join(", ")}\n\n` +
          `Open your QR at ${link} and show it at the gate.\n\n` +
          `— Entry Now`,
      })
      .catch((err) => console.error("[deliver] email failed", err));
  }
}
