/**
 * Demo-flow smoke test: email+password sign-in, a DECLINED card, then a
 * successful one — all over real HTTP against the running dev server.
 *
 *   npm run dev
 *   npx tsx scripts/e2e-demo.mts
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0 && !(t.slice(0, i).trim() in process.env))
    process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
}
const { randomUUID, createHash } = await import("node:crypto");
const { SignJWT } = await import("jose");
const { db } = await import("../src/lib/db.js");
const { verifyPassword } = await import("../src/lib/auth/password.js");

const BASE = "http://localhost:3000";
let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
};

// --- 1. The seeded demo password really verifies -----------------------------
const meera = await db.user.findFirstOrThrow({ where: { email: "meera@demo.entrynow.in" } });
check("seeded email account has a working password", await verifyPassword("demo1234", meera.passwordHash));
check("a wrong password is rejected", !(await verifyPassword("wrong", meera.passwordHash)));

// --- 2. Session, as the login would mint it ----------------------------------
const sid = randomUUID();
await db.session.create({
  data: { userId: meera.id, tokenHash: createHash("sha256").update(sid).digest("hex"),
          expiresAt: new Date(Date.now() + 30 * 86_400_000), userAgent: "e2e-demo" },
});
const jwt = await new SignJWT({ sid, uid: meera.id })
  .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d")
  .sign(new TextEncoder().encode(process.env.SESSION_JWT_SECRET!));
const cookie = `se_session=${jwt}`;

const event = await db.event.findFirstOrThrow({
  where: { slug: "the-last-seat-comedy-special" }, include: { tiers: true },
});
const tier = event.tiers.find((t) => t.name === "General")!;

async function book() {
  const res = await fetch(`${BASE}/api/bookings`, {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ eventSlug: event.slug, lines: [{ tierId: tier.id, quantity: 1 }] }),
  });
  return { status: res.status, body: await res.json() };
}
async function pay(bookingId: string, orderId: string | null, reference: string) {
  const res = await fetch(`${BASE}/api/demo/pay`, {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ bookingId, gatewayOrderId: orderId, method: "card", reference }),
  });
  return { status: res.status, body: await res.json() };
}
const load = (n: string) =>
  db.booking.findUniqueOrThrow({ where: { bookingNumber: n }, include: { tickets: true, ledger: true } });

// --- 3. Declined card --------------------------------------------------------
const a = await book();
check("booking created (declined-card run)", a.status === 201);
const held = await db.ticketTier.findUniqueOrThrow({ where: { id: tier.id } });
check("gateway did NOT auto-confirm before payment", held.quantityHeld > 0);
const aBooking = await db.booking.findUniqueOrThrow({ where: { bookingNumber: a.body.bookingNumber } });
check("booking waits at PENDING_PAYMENT", aBooking.status === "PENDING_PAYMENT", aBooking.status);

const declined = await pay(aBooking.id, a.body.order?.gatewayOrderId ?? null, "4000 0000 0000 0002");
check("declined card returns failure", declined.body.outcome === "failure", JSON.stringify(declined.body));
const afterDecline = await load(a.body.bookingNumber);
check("declined booking is FAILED", afterDecline.status === "FAILED", afterDecline.status);
check("declined booking issued no tickets", afterDecline.tickets.length === 0);
const releasedTier = await db.ticketTier.findUniqueOrThrow({ where: { id: tier.id } });
check("declined payment released the hold", releasedTier.quantityHeld === held.quantityHeld - 1);

// --- 4. Successful card ------------------------------------------------------
const b = await book();
check("booking created (success run)", b.status === 201);
const bBooking = await db.booking.findUniqueOrThrow({ where: { bookingNumber: b.body.bookingNumber } });
const okPay = await pay(bBooking.id, b.body.order?.gatewayOrderId ?? null, "4111 1111 1111 1111");
check("test card returns success", okPay.body.outcome === "success");
const done = await load(b.body.bookingNumber);
check("booking CONFIRMED", done.status === "CONFIRMED", done.status);
check("one ticket issued", done.tickets.length === 1, done.tickets.map((t) => t.ticketNumber).join(","));
const sum = done.ledger.reduce((s, r) => s + r.amountPaise, 0);
check("ledger balances (I3)", sum === 0, `sum=${sum}, rows=${done.ledger.length}`);

console.log(failures === 0 ? "\n✅ DEMO FLOW PASS" : `\n❌ ${failures} CHECK(S) FAILED`);
await db.$disconnect();
process.exit(failures === 0 ? 0 : 1);
