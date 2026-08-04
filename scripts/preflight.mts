/**
 * Pre-flight: functionality and security checks against a running server.
 *
 *   npm run dev
 *   npx tsx scripts/preflight.mts
 *
 * Everything here is an ASSERTION ABOUT AN ATTACKER, not a happy path. The
 * vitest suite proves the engine is correct when used correctly; this proves
 * it is not trivially abusable when used incorrectly — which is the question
 * that matters before a URL exists.
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0 && !(t.slice(0, i).trim() in process.env))
    process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
}
const { randomUUID, createHash } = await import("node:crypto");
const { SignJWT } = await import("jose");
const { db } = await import("../src/lib/db.js");

const BASE = "http://localhost:3000";
let fail = 0, warn = 0;
const ok = (l: string, pass: boolean, d = "") => {
  console.log(`${pass ? "  ok  " : " FAIL "} ${l}${d ? "  — " + d : ""}`); if (!pass) fail++;
};
const note = (l: string) => { console.log(`  warn  ${l}`); warn++; };

async function session(userId: string) {
  const sid = randomUUID();
  await db.session.create({ data: { userId, tokenHash: createHash("sha256").update(sid).digest("hex"),
    expiresAt: new Date(Date.now() + 86_400_000), userAgent: "preflight" } });
  const jwt = await new SignJWT({ sid, uid: userId }).setProtectedHeader({ alg: "HS256" })
    .setIssuedAt().setExpirationTime("1d").sign(new TextEncoder().encode(process.env.SESSION_JWT_SECRET!));
  return `se_session=${jwt}`;
}

const meera = await db.user.findFirstOrThrow({ where: { email: "meera@demo.entrynow.in" } });
const anand = await db.user.findFirstOrThrow({ where: { email: "anand@demo.entrynow.in" } });
const cookieA = await session(meera.id);
const cookieB = await session(anand.id);

console.log("\n── AUTHENTICATION ──");
{
  const r = await fetch(`${BASE}/api/bookings`, { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ eventSlug: "x", lines: [] }) });
  ok("booking API rejects anonymous callers", r.status === 401, `got ${r.status}`);
}
{
  const r = await fetch(`${BASE}/api/bookings`, { method: "POST",
    headers: { "content-type": "application/json", cookie: "se_session=garbage.jwt.value" },
    body: JSON.stringify({ eventSlug: "x", lines: [{ tierId: "x", quantity: 1 }] }) });
  ok("a forged session cookie is rejected", r.status === 401, `got ${r.status}`);
}
{
  // A JWT signed with the WRONG secret must not authenticate.
  const bad = await new SignJWT({ sid: randomUUID(), uid: meera.id })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1d")
    .sign(new TextEncoder().encode("attacker-chosen-secret-attacker-chosen"));
  const r = await fetch(`${BASE}/api/bookings`, { method: "POST",
    headers: { "content-type": "application/json", cookie: `se_session=${bad}` },
    body: JSON.stringify({ eventSlug: "x", lines: [{ tierId: "x", quantity: 1 }] }) });
  ok("a JWT signed with a different secret is rejected", r.status === 401, `got ${r.status}`);
}

console.log("\n── PRICE TAMPERING (I4) ──");
const ev = await db.event.findFirstOrThrow({ where: { slug: "the-improv-project-ahmedabad" }, include: { tiers: true } });
const tier = ev.tiers.find((t) => t.name === "General")!;
{
  const r = await fetch(`${BASE}/api/bookings`, { method: "POST",
    headers: { "content-type": "application/json", cookie: cookieA },
    body: JSON.stringify({ eventSlug: ev.slug, lines: [{ tierId: tier.id, quantity: 1 }],
      totalPaise: 1, subtotalPaise: 1, bookingFeePaise: 0 }) });
  const b = await r.json();
  const created = r.ok ? await db.booking.findUnique({ where: { bookingNumber: b.bookingNumber } }) : null;
  ok("client-supplied totals are ignored", !!created && created.subtotalPaise === tier.pricePaise,
     created ? `server computed ${created.subtotalPaise}, client claimed 1` : "no booking");
  if (created) { await db.bookingItem.deleteMany({ where: { bookingId: created.id } });
    await db.booking.delete({ where: { id: created.id } });
    await db.$executeRaw`UPDATE ticket_tiers SET "quantityHeld" = GREATEST(0,"quantityHeld"-1) WHERE id = ${tier.id}`; }
}
{
  const r = await fetch(`${BASE}/api/bookings`, { method: "POST",
    headers: { "content-type": "application/json", cookie: cookieA },
    body: JSON.stringify({ eventSlug: ev.slug, lines: [{ tierId: tier.id, quantity: -5 }] }) });
  ok("negative quantities are rejected", r.status === 400, `got ${r.status}`);
}
{
  const r = await fetch(`${BASE}/api/bookings`, { method: "POST",
    headers: { "content-type": "application/json", cookie: cookieA },
    body: JSON.stringify({ eventSlug: ev.slug, lines: [{ tierId: tier.id, quantity: 99999 }] }) });
  ok("absurd quantities are rejected", r.status === 400, `got ${r.status}`);
}
{
  const other = await db.ticketTier.findFirstOrThrow({ where: { eventId: { not: ev.id } } });
  const r = await fetch(`${BASE}/api/bookings`, { method: "POST",
    headers: { "content-type": "application/json", cookie: cookieA },
    body: JSON.stringify({ eventSlug: ev.slug, lines: [{ tierId: other.id, quantity: 1 }] }) });
  ok("a tier from another event cannot be bought", r.status === 409, `got ${r.status}`);
}

console.log("\n── OWNERSHIP / IDOR ──");
const mine = await fetch(`${BASE}/api/bookings`, { method: "POST",
  headers: { "content-type": "application/json", cookie: cookieA },
  body: JSON.stringify({ eventSlug: ev.slug, lines: [{ tierId: tier.id, quantity: 1 }] }) }).then((r) => r.json());
const mineRow = await db.booking.findUniqueOrThrow({ where: { bookingNumber: mine.bookingNumber } });
{
  const r = await fetch(`${BASE}/booking/${mine.bookingNumber}`, { headers: { cookie: cookieB } });
  ok("another user cannot view my booking page", r.status === 404, `got ${r.status}`);
}
{
  const r = await fetch(`${BASE}/booking/${mine.bookingNumber}/pay`, { headers: { cookie: cookieB } });
  ok("another user cannot open my payment page", r.status === 404, `got ${r.status}`);
}
{
  const r = await fetch(`${BASE}/api/demo/pay`, { method: "POST",
    headers: { "content-type": "application/json", cookie: cookieB },
    body: JSON.stringify({ bookingId: mineRow.id, gatewayOrderId: null, method: "card", reference: "4111111111111111" }) });
  ok("another user cannot pay for my booking", r.status === 404, `got ${r.status}`);
}
{
  const r = await fetch(`${BASE}/booking/${mine.bookingNumber}`);
  ok("an anonymous visitor cannot view a booking", r.status === 404, `got ${r.status}`);
}

console.log("\n── WEBHOOK ──");
{
  const body = JSON.stringify({ id: `evt_forged_${Date.now()}`, event: "payment.captured",
    payload: { bookingId: mineRow.id, gatewayOrderId: "x", gatewayPaymentId: "y", amountPaise: 1 } });
  const r = await fetch(`${BASE}/api/webhooks/payments`, { method: "POST",
    headers: { "content-type": "application/json" }, body });
  ok("an unsigned webhook is rejected", r.status === 401, `got ${r.status}`);
  const after = await db.booking.findUniqueOrThrow({ where: { id: mineRow.id } });
  ok("the forged webhook confirmed nothing", after.status === "PENDING_PAYMENT", after.status);
}
{
  const body = JSON.stringify({ id: "e", event: "payment.captured", payload: { bookingId: mineRow.id } });
  const r = await fetch(`${BASE}/api/webhooks/payments`, { method: "POST",
    headers: { "content-type": "application/json", "x-payment-signature": "deadbeef" }, body });
  ok("a wrong signature is rejected", r.status === 401, `got ${r.status}`);
}

console.log("\n── OTP LIMITS ──");
{
  // `src/lib/auth/otp.ts` is `server-only` and cannot be imported by a plain
  // script, so this asserts the LIMITS ARE CONFIGURED rather than re-proving
  // enforcement — that lives in the module and is exercised by the sign-in
  // flow itself. A misconfiguration (limit removed, window zeroed) is the
  // failure mode a deploy can actually introduce.
  const rows = await db.configSetting.findMany({
    where: { key: { in: ["otpMaxSendsPer10Min", "otpMaxVerifyAttempts", "otpLockMinutes", "otpValidityMinutes"] } },
  });
  const cfg = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
  ok("OTP send limit is set", cfg.otpMaxSendsPer10Min > 0 && cfg.otpMaxSendsPer10Min <= 5, `${cfg.otpMaxSendsPer10Min}/10min`);
  ok("OTP verify attempts are capped", cfg.otpMaxVerifyAttempts > 0 && cfg.otpMaxVerifyAttempts <= 10, `${cfg.otpMaxVerifyAttempts}`);
  ok("OTP lockout is set", cfg.otpLockMinutes > 0, `${cfg.otpLockMinutes} min`);
  ok("OTP expiry is short", cfg.otpValidityMinutes > 0 && cfg.otpValidityMinutes <= 10, `${cfg.otpValidityMinutes} min`);
}

console.log("\n── DEMO-MODE GUARD ──");
{
  // Node 24 makes process.env.NODE_ENV non-configurable, so the guard is
  // exercised in a child process with a real production environment — which
  // is closer to what a deploy actually does anyway.
  const { execFileSync } = await import("node:child_process");
  const probe = (ack: boolean) => {
    try {
      execFileSync(process.execPath, ["--input-type=module", "-e",
        `const m = await import("./src/lib/demo.ts"); m.assertDemoModeIsIntentional();`],
        { env: { ...process.env, NODE_ENV: "production", DEMO_MODE: "true",
                 ...(ack ? { DEMO_MODE_ALLOW_PRODUCTION: "true" } : { DEMO_MODE_ALLOW_PRODUCTION: "" }) },
          stdio: "pipe" });
      return false;
    } catch { return true; }
  };
  ok("demo mode refuses to boot in production unacknowledged", probe(false));
  ok("...and boots once explicitly acknowledged", !probe(true));
}

console.log("\n── TENANT ISOLATION ──");
{
  // Two REAL organizers with real rows. The ids below are correct and exist —
  // only the session is wrong, which is exactly the attack an IDOR check has
  // to survive. Every one of these must 404, not 403: a 403 confirms the row
  // is there and hands an attacker a working enumeration oracle.
  const orgs = await db.organizerProfile.findMany({
    where: { status: { in: ["VERIFIED", "SUSPENDED"] } },
    take: 2, orderBy: { createdAt: "asc" },
    include: { user: true, events: { take: 1, select: { id: true } } },
  });

  if (orgs.length < 2 || !orgs[0].events.length) {
    note("tenant isolation not exercised — needs two seeded organizers, one with an event");
  } else {
    const [a, b] = orgs;
    const cookieOrgB = await session(b.user.id);
    const foreign = a.events[0].id;

    for (const path of [
      `/organizer/events/${foreign}`,
      `/organizer/events/${foreign}/bookings`,
      `/organizer/events/${foreign}/live`,
      `/organizer/events/${foreign}/staff`,
    ]) {
      const r = await fetch(`${BASE}${path}`, { headers: { cookie: cookieOrgB }, redirect: "manual" });
      ok(`organizer B is refused ${path.replace(foreign, "{A-event}")}`, r.status === 404, `got ${r.status}`);
    }

    // The owner still gets in — otherwise the four checks above would pass on a
    // portal that is simply broken for everyone.
    const cookieOrgA = await session(a.user.id);
    const own = await fetch(`${BASE}/organizer/events/${foreign}`, { headers: { cookie: cookieOrgA }, redirect: "manual" });
    ok("organizer A can open their own event", own.status === 200, `got ${own.status}`);

    // The scan manifest is the night's full token list — the single most
    // sensitive artefact the platform emits.
    const man = await fetch(`${BASE}/api/scan/manifest?eventId=${foreign}`, { headers: { cookie: cookieOrgB } });
    ok("organizer B cannot pull organizer A's scan manifest", man.status === 404, `got ${man.status}`);

    const look = await fetch(`${BASE}/api/scan/lookup?eventId=${foreign}&ticketNumber=EN-XXX-0001`, { headers: { cookie: cookieOrgB } });
    ok("organizer B cannot look up tickets at organizer A's event", look.status === 404, `got ${look.status}`);
  }
}

console.log("\n── ADMIN RBAC ──");
{
  const sub = await db.adminRole.findFirst({
    where: { NOT: { permissions: { has: "SUPER" } } },
    include: { user: true },
  });
  const sup = await db.adminRole.findFirst({
    where: { permissions: { has: "SUPER" } },
    include: { user: true },
  });

  if (!sub || !sup) {
    note("admin RBAC not exercised — needs one SUPER and one sub-admin seeded");
  } else {
    const cookieSub = await session(sub.user.id);
    const cookieSuper = await session(sup.user.id);
    const held = sub.permissions;

    // Only the routes this sub-admin genuinely lacks. Asserting a blanket 404
    // would fail the moment the seed hands them a different permission set,
    // and a check that breaks on seed data teaches people to ignore it.
    const gated: [string, string][] = [
      ["/admin/finance", "FINANCE"],
      ["/admin/cms", "CONTENT"],
      ["/admin/config", "SUPER"],
      ["/admin/audit", "SUPER"],
      ["/admin/approvals", "APPROVALS"],
    ];
    for (const [path, need] of gated) {
      if (held.includes(need as never)) continue;
      const r = await fetch(`${BASE}${path}`, { headers: { cookie: cookieSub }, redirect: "manual" });
      ok(`sub-admin without ${need} is refused ${path}`, r.status === 404, `got ${r.status}`);
    }

    for (const path of ["/admin", "/admin/finance", "/admin/config", "/admin/audit", "/admin/cms"]) {
      const r = await fetch(`${BASE}${path}`, { headers: { cookie: cookieSuper }, redirect: "manual" });
      ok(`SUPER reaches ${path}`, r.status === 200, `got ${r.status}`);
    }

    // An ordinary attendee must not reach the admin surface at all.
    const r = await fetch(`${BASE}/admin`, { headers: { cookie: cookieA }, redirect: "manual" });
    ok("a non-admin user is refused /admin", r.status === 404, `got ${r.status}`);
  }
}

console.log("\n── SECRETS ──");
{
  const shipped = ["dev-only-session-secret-change-me-in-production-32b",
                   "dev-only-qr-secret-change-me-in-production-32bytes"];
  const inUse = [process.env.SESSION_JWT_SECRET, process.env.QR_JWT_SECRET];
  if (inUse.some((v) => v && shipped.includes(v)))
    note("SESSION_JWT_SECRET / QR_JWT_SECRET are still the published .env.example values — rotate before deploying");
  else ok("secrets differ from the published example values", true);
  const { execSync } = await import("node:child_process");
  const tracked = execSync("git ls-files | grep -c '^\\.env' || true").toString().trim();
  ok(".env is not tracked by git", tracked === "0", `${tracked} tracked`);
}

console.log("\n── CONTENT ──");
for (const path of ["/ahmedabad", "/ahmedabad/events", "/tickets", "/auth", "/legal/image-credits", "/organizer"]) {
  const r = await fetch(`${BASE}${path}`);
  ok(`${path} renders`, r.status === 200, `got ${r.status}`);
}
{
  const html = await fetch(`${BASE}/ahmedabad/events`).then((r) => r.text());
  const imgs = (html.match(/\/images\/events\//g) ?? []).length;
  ok("listing renders sourced event photography", imgs > 0, `${imgs} references`);
}

// Clean up the probe booking.
await db.bookingItem.deleteMany({ where: { bookingId: mineRow.id } });
await db.booking.delete({ where: { id: mineRow.id } });
await db.$executeRaw`UPDATE ticket_tiers SET "quantityHeld" = GREATEST(0,"quantityHeld"-1) WHERE id = ${tier.id}`;
await db.session.deleteMany({ where: { userAgent: "preflight" } });

console.log(`\n${fail === 0 ? "✅ PRE-FLIGHT PASS" : `❌ ${fail} FAILED`}${warn ? `  ·  ${warn} warning(s)` : ""}`);
await db.$disconnect();
process.exit(fail === 0 ? 0 : 1);
