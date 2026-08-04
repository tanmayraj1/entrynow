import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { demoOutcomeFor, isDemoMode } from "@/lib/demo";
import { webhookUrl } from "@/lib/adapters/payments";

/**
 * The demo gateway's "bank".
 *
 * Takes what the user typed on the payment screen, decides success or failure
 * from it, and delivers a **signed webhook to our own endpoint** — the same
 * path a live gateway uses. It deliberately does NOT confirm the booking
 * itself: if this route wrote the booking directly, the demo would exercise a
 * code path that does not exist in production, and the one that does would
 * stay untested (D-008).
 *
 * Refuses outright unless `DEMO_MODE=true`, so it cannot become a way to
 * confirm bookings without paying on a real deployment.
 */

const Body = z.object({
  bookingId: z.string().min(1),
  gatewayOrderId: z.string().nullable(),
  method: z.enum(["upi", "card", "netbanking", "wallet"]),
  reference: z.string().max(64).optional().default(""),
});

const METHOD_MAP = {
  upi: "UPI",
  card: "CARD",
  netbanking: "NETBANKING",
  wallet: "WALLET",
} as const;

export async function POST(request: Request) {
  if (!isDemoMode()) {
    return NextResponse.json(
      { error: "NOT_DEMO", message: "The demo gateway is disabled." },
      { status: 404 },
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "SIGN_IN_REQUIRED" }, { status: 401 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const { bookingId, gatewayOrderId, method, reference } = parsed.data;

  // Ownership check: a booking id is not a capability.
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      userId: true,
      status: true,
      gatewayPayablePaise: true,
    },
  });
  if (!booking || booking.userId !== user.id) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (booking.status !== "PENDING_PAYMENT") {
    return NextResponse.json(
      { error: "NOT_PAYABLE", message: "This booking is no longer awaiting payment." },
      { status: 409 },
    );
  }

  const outcome = demoOutcomeFor(reference);
  const succeeded = outcome === "success";

  const body = JSON.stringify({
    // Stable per attempt, so a retried delivery is recognised as a replay but
    // a genuine second attempt is not.
    id: `evt_demo_${booking.id}_${succeeded ? "cap" : "fail"}`,
    event: succeeded ? "payment.captured" : "payment.failed",
    payload: {
      bookingId: booking.id,
      gatewayOrderId: gatewayOrderId ?? "",
      gatewayPaymentId: `pay_demo_${Date.now().toString(36)}`,
      amountPaise: booking.gatewayPayablePaise,
      method: METHOD_MAP[method],
      vpa: method === "upi" ? reference : null,
      failureReason: succeeded
        ? null
        : "Declined by issuing bank (demo card)",
    },
  });

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "sandbox-webhook-secret";
  const signature = createHmac("sha256", secret).update(body).digest("hex");

  // Awaited, unlike the sandbox adapter's fire-and-forget timer: the user is
  // watching a spinner, and a demo that navigates before the webhook lands
  // shows them a "waiting for payment" screen for no reason.
  const res = await fetch(webhookUrl(), {
    method: "POST",
    headers: { "content-type": "application/json", "x-payment-signature": signature },
    body,
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "WEBHOOK_FAILED", message: "The demo gateway could not confirm." },
      { status: 502 },
    );
  }

  return NextResponse.json({ outcome });
}
