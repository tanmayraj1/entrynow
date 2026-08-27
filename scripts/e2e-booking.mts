/**
 * End-to-end booking smoke test — real HTTP, a real signed session cookie, and
 * the sandbox gateway's real webhook delivery.
 *
 *   npm run dev            # in one shell
 *   npx tsx scripts/e2e-booking.mts
 *
 * The vitest suite calls the booking functions directly, which is the right
 * place to prove the invariants. This proves the WIRING the suite cannot see:
 * route handler, zod parsing, session cookie, adapter, signature verification,
 * and the webhook arriving on its own connection.
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

const BASE = process.env.E2E_URL ?? "http://localhost:3000";

const user = await db.user.findFirst({ where: { phone: "919812345001" } });
if (!user) throw new Error("seed user missing");

// Mirror createSession(): a row keyed by the hash, and a JWT carrying the sid.
const sid = randomUUID();
await db.session.create({
  data: {
    userId: user.id,
    tokenHash: createHash("sha256").update(sid).digest("hex"),
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
    userAgent: "e2e",
  },
});
const token = await new SignJWT({ sid, uid: user.id })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("30d")
  .sign(new TextEncoder().encode(process.env.SESSION_JWT_SECRET!));
const cookie = `se_session=${token}`;

// Any live event with stock left, rather than a named one — the concurrency
// test cares that inventory holds, not which event it holds for.
const event = await db.event.findFirstOrThrow({
  where: { status: "LIVE", tiers: { some: { isActive: true } } },
  include: { tiers: { where: { isActive: true }, orderBy: { quantityTotal: "desc" } } },
});
const tier = event.tiers[0]!;

const before = await db.ticketTier.findUniqueOrThrow({ where: { id: tier.id } });
console.log(`BEFORE   sold=${before.quantitySold} held=${before.quantityHeld} total=${before.quantityTotal}`);

const res = await fetch(`${BASE}/api/bookings`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({ eventSlug: event.slug, lines: [{ tierId: tier.id, quantity: 2 }] }),
});
const body = await res.json();
console.log(`POST /api/bookings -> ${res.status} ${JSON.stringify(body).slice(0, 180)}`);
if (!res.ok) { await db.$disconnect(); process.exit(1); }

const held = await db.ticketTier.findUniqueOrThrow({ where: { id: tier.id } });
console.log(`HELD     sold=${held.quantitySold} held=${held.quantityHeld}   <- hold is live`);

await new Promise((r) => setTimeout(r, 3000)); // sandbox webhook latency

const booking = await db.booking.findUniqueOrThrow({
  where: { bookingNumber: body.bookingNumber },
  include: { tickets: true, ledger: true, payments: true },
});
const after = await db.ticketTier.findUniqueOrThrow({ where: { id: tier.id } });
const sum = booking.ledger.reduce((s, r) => s + r.amountPaise, 0);

console.log(`AFTER    sold=${after.quantitySold} held=${after.quantityHeld}   <- hold converted`);
console.log(`booking  status=${booking.status} payments=${booking.payments.map((p) => p.status).join(",")}`);
console.log(`tickets  ${booking.tickets.map((t) => t.ticketNumber).join(", ")}`);
console.log(`ledger   ${booking.ledger.length} rows, sum=${sum} paise (I3 requires 0)`);

const ok =
  booking.status === "CONFIRMED" &&
  booking.tickets.length === 2 &&
  sum === 0 &&
  after.quantitySold === before.quantitySold + 2 &&
  after.quantityHeld === before.quantityHeld;
console.log(ok ? "\n✅ END-TO-END PASS" : "\n❌ END-TO-END FAIL");
await db.$disconnect();
process.exit(ok ? 0 : 1);
