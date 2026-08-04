import { NextResponse } from "next/server";
import { getPaymentsAdapter } from "@/lib/adapters/payments";
import { captureBooking, failBooking } from "@/lib/booking/capture";

/**
 * Payment gateway webhook.
 *
 * Three rules, all of which exist because gateways are not polite clients:
 *
 *   1. **Read the raw body**, then verify the signature against those exact
 *      bytes. Parsing first and re-serialising would change key order and
 *      whitespace, and the HMAC would never match.
 *   2. **Return 2xx for anything we have handled**, including replays. A
 *      non-2xx tells the gateway to retry, so returning 500 for a duplicate
 *      turns one duplicate into an infinite retry storm.
 *   3. **Return non-2xx only when a retry could actually help** — an
 *      unexpected exception. A bad signature is 401 and never retried.
 *
 * Idempotency lives in `captureBooking`, keyed on the gateway's own event id
 * via a unique INSERT (spec C4.6, edge case I3).
 */
export async function POST(request: Request) {
  const payments = getPaymentsAdapter();

  const rawBody = await request.text();
  const signature =
    request.headers.get("x-payment-signature") ??
    request.headers.get("x-razorpay-signature");

  if (!payments.verifySignature(rawBody, signature)) {
    return NextResponse.json(
      { error: "BAD_SIGNATURE" },
      { status: 401 },
    );
  }

  let body: {
    id?: string;
    event?: string;
    payload?: {
      bookingId?: string;
      gatewayOrderId?: string;
      gatewayPaymentId?: string;
      amountPaise?: number;
      method?: string | null;
      vpa?: string | null;
      failureReason?: string | null;
    };
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    // Unparseable is not retryable — the same bytes will fail again.
    return NextResponse.json({ error: "BAD_BODY" }, { status: 400 });
  }

  const eventId = body.id;
  const eventType = body.event;
  const p = body.payload ?? {};

  if (!eventId || !eventType || !p.bookingId) {
    return NextResponse.json({ error: "INCOMPLETE" }, { status: 400 });
  }

  try {
    if (eventType === "payment.captured") {
      const result = await captureBooking({
        gatewayEventId: eventId,
        eventType,
        payload: body,
        bookingId: p.bookingId,
        gatewayOrderId: p.gatewayOrderId ?? "",
        gatewayPaymentId: p.gatewayPaymentId ?? "",
        amountPaise: p.amountPaise ?? 0,
        method: p.method,
        vpa: p.vpa,
      });

      if (!result.ok) {
        // A late capture that lost the race still needs a 200: the delivery
        // was handled, and the money is refunded on our side rather than by
        // the gateway retrying (edge case I5).
        console.error(
          `[webhook] capture rejected for ${p.bookingId}: ${result.code}`,
        );
        return NextResponse.json(
          { handled: true, outcome: result.code },
          { status: 200 },
        );
      }

      return NextResponse.json(
        {
          handled: true,
          replayed: result.replayed,
          tickets: result.ticketCount,
        },
        { status: 200 },
      );
    }

    if (eventType === "payment.failed") {
      const result = await failBooking({
        gatewayEventId: eventId,
        eventType,
        payload: body,
        bookingId: p.bookingId,
        reason: p.failureReason,
      });
      return NextResponse.json(
        { handled: true, replayed: result.replayed },
        { status: 200 },
      );
    }

    // An event type we do not model. Acknowledge it so the gateway stops
    // retrying something we will never act on.
    return NextResponse.json({ handled: false, ignored: eventType });
  } catch (err) {
    // The one case where a retry genuinely helps.
    console.error("[webhook] unhandled error:", err);
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}
