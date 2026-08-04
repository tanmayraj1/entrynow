import "server-only";

/**
 * Payments adapter.
 *
 * Resolved by `PAYMENTS_DRIVER`. The sandbox driver is a fully functional fake
 * (D-008): it mints an order id, waits `SANDBOX_WEBHOOK_DELAY_MS`, then makes
 * a real HTTP POST to our own webhook endpoint with a signature the endpoint
 * really verifies.
 *
 * That last part is the point. A sandbox that resolves a promise in-process
 * would leave the parts that actually break in production — idempotency,
 * out-of-order delivery, replay, signature checks, the capture racing the hold
 * expiry — completely untested. Here they run on every dev booking.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface PaymentOrder {
  gatewayOrderId: string;
  amountPaise: number;
  /** Handed to the client SDK. Meaningless for sandbox. */
  publicKey: string;
}

export interface PaymentsAdapter {
  readonly name: string;
  /** Does this driver deliver its own webhook, or is one expected from a real
   *  gateway? Drives whether the UI polls or waits. */
  readonly selfDelivers: boolean;
  createOrder(args: {
    bookingId: string;
    bookingNumber: string;
    amountPaise: number;
    /** Where the driver should deliver its webhook. Absolute URL. */
    webhookUrl: string;
  }): Promise<PaymentOrder>;
  /** Verify a webhook body. Throwing is a rejected delivery, not a 500. */
  verifySignature(rawBody: string, signature: string | null): boolean;
}

// ---------------------------------------------------------------------------

const WEBHOOK_SECRET =
  process.env.RAZORPAY_WEBHOOK_SECRET || "sandbox-webhook-secret";

function sign(rawBody: string): string {
  return createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
}

function verify(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = sign(rawBody);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  // Length check first: timingSafeEqual throws on a length mismatch, and that
  // throw would itself leak the length through the error path.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const sandbox: PaymentsAdapter = {
  name: "sandbox",
  selfDelivers: true,

  async createOrder({ bookingId, bookingNumber, amountPaise, webhookUrl }) {
    const gatewayOrderId = `order_sbx_${bookingNumber}_${Date.now().toString(36)}`;

    // In demo mode a HUMAN drives the payment screen, so auto-delivering here
    // would confirm the booking out from under them before they ever picked a
    // method. `/api/demo/pay` sends the webhook instead.
    if (process.env.DEMO_MODE === "true") {
      return { gatewayOrderId, amountPaise, publicKey: "demo_key" };
    }

    const delayMs = Number(process.env.SANDBOX_WEBHOOK_DELAY_MS ?? 600);
    const failRate = Number(process.env.SANDBOX_PAYMENT_FAIL_RATE ?? 0);
    const fails = failRate > 0 && Math.random() < failRate;

    // Fire-and-forget, exactly like a real gateway: `createOrder` returns
    // immediately and the outcome arrives later, on its own connection.
    setTimeout(() => {
      const body = JSON.stringify({
        // A real gateway's event id is stable across retries — that stability
        // is what makes our idempotency claim work.
        id: `evt_sbx_${gatewayOrderId}`,
        event: fails ? "payment.failed" : "payment.captured",
        payload: {
          bookingId,
          gatewayOrderId,
          gatewayPaymentId: `pay_sbx_${Date.now().toString(36)}`,
          amountPaise,
          method: "UPI",
          vpa: "sandbox@upi",
          failureReason: fails ? "Sandbox forced failure" : null,
        },
      });

      void fetch(webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-payment-signature": sign(body),
        },
        body,
      }).catch((err) => {
        // A real gateway would retry. Log loudly rather than silently
        // stranding a booking in PENDING_PAYMENT.
        console.error("[payments:sandbox] webhook delivery failed:", err);
      });
    }, delayMs);

    return { gatewayOrderId, amountPaise, publicKey: "sandbox_key" };
  },

  verifySignature: verify,
};

const notConfigured = (name: string): PaymentsAdapter => ({
  name,
  selfDelivers: false,
  async createOrder() {
    throw new Error(
      `Payments driver "${name}" is selected but has no credentials configured. ` +
        `Set PAYMENTS_DRIVER=sandbox for local development.`,
    );
  },
  verifySignature: verify,
});

export function getPaymentsAdapter(): PaymentsAdapter {
  const driver = process.env.PAYMENTS_DRIVER ?? "sandbox";
  switch (driver) {
    case "sandbox":
      return sandbox;
    default:
      return notConfigured(driver);
  }
}

/**
 * Absolute URL of our own webhook endpoint, for drivers that self-deliver.
 *
 * The fallback chain matters more than it looks. A self-delivering driver
 * POSTs over real HTTP, so if this resolves wrongly the payment screen still
 * "succeeds" and the booking is simply never confirmed — money taken, no
 * ticket, no error anywhere. On a serverless host with no
 * `NEXT_PUBLIC_APP_URL` set, the old localhost default did exactly that: the
 * function dialled a port on itself that nothing was listening on.
 *
 * `VERCEL_URL` is preferred over the production alias because it names *this*
 * deployment — a self-delivered webhook should come back to the build that
 * created the order, not to whatever is currently aliased to production.
 * Vercel injects it automatically, so a forgotten env var can no longer break
 * checkout silently.
 */
export function webhookUrl(): string {
  return `${appUrl()}/api/webhooks/payments`;
}

/**
 * This deployment's public origin, with no trailing slash.
 *
 * Shared with ticket delivery, which has to put a real link in an SMS — a
 * message that says "open localhost:3000" is worse than no message.
 */
export function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  const vercel = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : undefined;
  const base = explicit ?? vercel ?? "http://localhost:3000";
  return base.replace(/\/+$/, "");
}
