import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { createBookingAndSchedule } from "@/lib/booking/create";
import { getPaymentsAdapter, webhookUrl } from "@/lib/adapters/payments";
import { db } from "@/lib/db";

/**
 * Create a booking: hold the seats, then open a payment order.
 *
 * The client sends tier ids and quantities and nothing else about money.
 * Invariant I4 — prices, discounts and totals are all recomputed server-side
 * from the database, so a tampered request buys nothing cheaper.
 */

const Body = z.object({
  eventSlug: z.string().min(1),
  sessionId: z.string().nullish(),
  lines: z
    .array(
      z.object({
        tierId: z.string().min(1),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(10),
  promoCode: z.string().trim().max(40).nullish(),
  useWallet: z.boolean().optional(),
  buyer: z
    .object({
      name: z.string().trim().max(80).optional(),
      phone: z.string().trim().max(20).optional(),
      email: z.string().trim().email().max(120).optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "SIGN_IN_REQUIRED", message: "Sign in to book." },
      { status: 401 },
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "That selection could not be read." },
      { status: 400 },
    );
  }

  const result = await createBookingAndSchedule({
    userId: user.id,
    ...parsed.data,
  });

  if (!result.ok) {
    // 409 for inventory and limit conflicts: the request was well-formed, the
    // world changed. The client repairs the selection from `availability`.
    return NextResponse.json(
      {
        error: result.code,
        message: result.message,
        availability: result.availability ?? null,
      },
      { status: result.code === "EVENT_UNAVAILABLE" ? 404 : 409 },
    );
  }

  // Wallet-only orders skip the gateway entirely (spec C4.5). Nothing to pay
  // means nothing to create an order for.
  const booking = await db.booking.findUnique({
    where: { id: result.bookingId },
    select: { gatewayPayablePaise: true },
  });
  const payable = booking?.gatewayPayablePaise ?? 0;

  let order: { gatewayOrderId: string; publicKey: string } | null = null;
  if (payable > 0) {
    const payments = getPaymentsAdapter();
    const created = await payments.createOrder({
      bookingId: result.bookingId,
      bookingNumber: result.bookingNumber,
      amountPaise: payable,
      webhookUrl: webhookUrl(),
    });
    order = {
      gatewayOrderId: created.gatewayOrderId,
      publicKey: created.publicKey,
    };
    await db.payment.create({
      data: {
        bookingId: result.bookingId,
        status: "CREATED",
        amountPaise: payable,
        gatewayOrderId: created.gatewayOrderId,
      },
    });
  }

  return NextResponse.json(
    {
      bookingNumber: result.bookingNumber,
      // The countdown is derived from this server value, never from a
      // client-side clock (spec C4.2c).
      expiresAt: result.expiresAt.toISOString(),
      gatewayPayablePaise: payable,
      order,
    },
    { status: 201 },
  );
}
