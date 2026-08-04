# Entry Now — handover

Everything a new contributor (or a new chat) needs to pick this up cold: what
was built, in what order, why it is shaped this way, and where the mines are.

`CLAUDE.md` is the short version, loaded into every session. This is the long
version. Where they disagree, **`DECISIONS.md` wins** — it is the record of every
call actually made, and both of these documents are summaries of it.

---

## 1. What this is

A BookMyShow-style ticketing marketplace for Indian events — Garba/Navratri,
Diwali melas, Holi, Uttarayan, food fests, comedy, concerts, theatre, sports,
nightlife, exhibitions. Ahmedabad-first.

**One Next.js app, four surfaces**, each with its own Tailwind theme scope:

| Surface | Route root | `data-theme` | What it is |
|---|---|---|---|
| Marketplace | `/`, `/[city]` | `market` | Browse, search, map, book, pay, tickets |
| Organizer portal | `/organizer/(portal)` | `dash-organizer` | 11 routes — events, bookings, money, staff, promos |
| Admin portal | `/admin/(portal)` | `dash-admin` | 10 routes — approvals, KYC, disputes, payouts, CMS, config, audit |
| Gate scanner | `/scan` | `scanner` | Dark mobile PWA — camera, offline queue, atomic claim |

Renamed from *Shiv Events* (D-017); the repo directory is still `Shiv_Events`.
Ticket numbers are `EN-{eventShort}-{seq}`, booking numbers `EN` + 6 digits.

**Live:** <https://entrynow.vercel.app> — Vercel (app) + Neon (Postgres) +
Upstash (Redis). Auto-deploys on push to `main`. `/admin` is behind HTTP Basic
in `src/middleware.ts`; everything else is public.

---

## 2. Where the requirements live — and the one that is missing

| Source | Location | Authority |
|---|---|---|
| Design handoff | `design_handoff_shiv_events/` — README + 16 `.dc.html` prototypes | Visual intent only |
| System Logic Specification | **Pasted in chat. Never in the repo.** | Behaviour. Wins on conflict, by its own terms |
| `spec-coverage.json` | repo root | **The spec's durable form** — 132 clauses, each with its implementing file and covering test |
| `DECISIONS.md` | repo root | Every conflict resolved and every gap filled — D-001 … D-036 |

**The spec is not a file.** It existed only in a chat window, so the first real
piece of engineering was transcribing it into `spec-coverage.json` — 132 clauses,
each with an id, a one-line rule, an implementing file and a covering test. That
file is now the only machine-checkable form of the requirement, and audit check
A8 fails the build if a reference points at a file that no longer exists (a stale
path is worse than no path — it reads as covered).

A "Prompt 2" is referenced by the spec but was never supplied. Its stack role is
settled; its one technical citation was re-specified inline by the spec.

The `.dc.html` prototypes are 100% inline styles on a bespoke templating runtime.
Nothing was ported from them. They are references for look and copy, not code.

**When the documents do not cover something, the tiebreaker is: protect
attendee money → organizer trust → platform revenue, in that order.** Every time
that had to be applied, it produced a `DECISIONS.md` entry. Part J of the spec
requires this; it is not optional bookkeeping.

---

## 3. The working method

Development ran as an **audit-gated loop**, not as phase-by-phase feature work.

```bash
npm run audit        # static checks + the completion meter
npm run audit:http   # adds a route crawl + content sanity (needs the dev server)
npm run preflight    # HTTP security assertions against a running server
```

**Thirteen checks.** A1–A5 cover navigation and interaction. A6–A11 are the
completion meter — model-write coverage, invariant tests, spec-clause coverage,
job registration, config/env liveness, adapter completeness. A12–A13 are the
portal invariants: tenant scoping and transactional audit rows.

`incomplete` findings are **not failures** — they mean "not built yet", which is
the normal state mid-loop. Only `blocker` and `broken` fail the exit code.

One iteration looked like this:

1. `npm run audit:http` → read the scoreboard.
2. Take the highest-severity cluster: **breaks an invariant > blocks a booking >
   dead navigation > dead control > polish.**
3. Build it.
4. Gate: `typecheck && lint && test && audit:http && preflight`.
5. **Click through the changed pages in a browser** at 390 / 768 / 1440.
6. Report: what the audit said, what changed, the new score, what is next.

### Step 5 is not a formality

A green audit is not proof, and this project has the scars to show it:

- The audit once passed a wishlist button that was correctly wired but never
  told a session existed, so **every click navigated away**.
- Every portal page 500'd when authenticated, while every static check stayed
  green — Lucide icons are functions and cannot cross the server→client
  boundary. Only an HTTP request with a real session cookie found it.
- The mobile dock covered the last 56px of every page for weeks. The cause was a
  server component importing a constant from a `"use client"` module: the
  bundler substitutes a client reference, the template literal compiled to
  `padding-bottom: var(--dock-pad, function() {…}px)`, the browser dropped it as
  invalid, and **nothing anywhere reported an error**.
- The preflight itself reported nine security failures against code that was
  refusing correctly — and would have reported the *same* nine if the pages had
  been leaking every byte. See §8.

---

## 4. Chronology — what was built, in order

1. **Foundation & design system.** Tailwind v4, four theme scopes, tokens,
   `src/components/ui/`, `src/components/brand/`.
2. **Domain schema & seed.** 47 Prisma models; seeded cities, venues, events,
   organizers, admins, attendees.
3. **Marketplace read path.** Listings, facets, event pages, festivals, search.
4. **The audit harness** (`scripts/audit.ts`) — A1–A5.
5. **Iteration 1 — navigation integrity.** Every dead link and dead control.
6. **Map location search** on real OSM tiles, with the never-trap-the-reader
   rules (D-020).
7. **Rebrand to Entry Now** — palette, logo, vector category glyphs (D-017…D-019).
8. **Step 0 — the completion meter**, A6–A11, and the transcription of the spec
   into `spec-coverage.json`.
9. **Iteration 3 — the booking engine.** The transactional core: atomic hold and
   release, promo reservation, payments adapter with signed webhooks, idempotent
   capture, persisted double-entry ledger. Then the seed was rewritten to run
   *through* the engine, which made it an integration test of the money path.
10. **Phase A — portal foundation.** RBAC guards, branded tenant isolation,
    transactional audit log, state machines, audit checks A12/A13.
11. **The refund engine** (D-031) — wallet mode, idempotent, one transaction per
    booking.
12. **Phase B — both portals**, built together because approvals are meaningless
    without events to approve.
13. **The gate scanner PWA** — signed QR (D-032), the atomic claim, offline
    manifest + IndexedDB queue + device-clock replay (D-033).
14. **Deploy** — Vercel + Neon + Upstash, worker gating, error boundaries,
    security headers, the `/admin` Basic-auth gate.
15. **Polish and hardening** — the ticket-tear preloader, mobile map controls,
    separate portal sign-in doors (D-035), guest checkout (D-036).

---

## 5. The invariants — do not weaken these

| | Rule | Enforced by |
|---|---|---|
| **I1** | `sold + held ≤ total` per tier, under any concurrency | guarded raw SQL + `tests/invariants/hold.test.ts` |
| **I2** | A ticket becomes `SCANNED` at most once, ever | guarded raw SQL + `tests/invariants/scan.test.ts` |
| **I3** | Ledger entries for one booking sum to exactly **0** | asserted *before* insert, inside the transaction |
| **I4** | Client-submitted prices are never trusted | server recomputes; preflight asserts it |
| **I7** | Timestamps stored UTC; **all** business logic in Asia/Kolkata | `src/lib/ist.ts` |

**Concurrency-critical writes are raw guarded SQL inside `$transaction`,
checking `rowCount`.** Prisma's fluent API cannot express them — there is nowhere
to put the guard clause. Do not "simplify" them.

```sql
UPDATE ticket_tiers SET "quantityHeld" = "quantityHeld" + $qty
 WHERE id = $1 AND "quantityTotal" - "quantitySold" - "quantityHeld" >= $qty;

UPDATE tickets SET status = 'SCANNED'
 WHERE "qrTokenId" = $1 AND status = 'ACTIVE';

INSERT INTO webhook_events ("gatewayEventId") VALUES ($1) ON CONFLICT DO NOTHING;
```

`rowCount === 0` is **never an error to swallow**. It is the branch that returns
per-tier availability, `ALREADY_SCANNED`, or a dropped duplicate webhook.

---

## 6. Conventions that are easy to get wrong

- **Money is integer paise**, always through `src/lib/money.ts`. Rupees exist
  only at the formatting boundary. Floats cannot satisfy I3.
- **Dates go through `src/lib/ist.ts`.** Thresholds compare *exact fractions* —
  `differenceInHours` truncates and silently moves every deadline against the
  attendee (D-013).
- **A Garba session running 8 PM–1 AM belongs to its start date** but stays
  scannable until it ends. Gate validity is an instant comparison, never a
  date-key comparison (D-012).
- **CSS base styles live in `@layer base`.** Unlayered CSS beats anything in a
  cascade layer regardless of specificity, so an unlayered `a { color }`
  silently overrides every Tailwind `text-*` utility.
- **Tailwind v4 prunes `@theme` variables it cannot see referenced.** The
  festival gradients are composed at runtime, so they live in a plain `:root`
  block.
- **Never nest an interactive control inside a link.** The wishlist heart is a
  sibling of the card's `<Link>`, positioned over it.
- **The brand gradient is reserved for action** — logo, primary CTAs, map price
  pins, ticket foil, hero mesh. Nothing else (D-019).
- **No emoji as artwork.** Every glyph is an SVG in `src/components/brand/`; an
  emoji renders in the platform font, so the same empty state looked like a
  different product on each OS.
- **Motion is entrance-only** and always behind `prefers-reduced-motion`.
- **The map must never trap the reader** (D-020): wheel zoom needs Ctrl/⌘, and a
  vertical touch drag is handed back to the browser as a page scroll.

### Portal rules

- **An organizer's id comes from the session, never from a request.** Use the
  branded `OrganizerId`, minted only by `organizerScope()`, called only from
  `rbac.ts`. Audit check **A12** fails the build otherwise (D-027).
- **Organizer writes use `updateMany`/`deleteMany`**, never the singular forms —
  those need a unique where-clause and have nowhere to put the ownership filter.
  Assert `count === 1`.
- **Pages use `requireOrganizer`/`requireAdmin` (they throw); server actions use
  `authorizeOrganizer`/`authorizeAdmin` (they return)** — D-028.
- **Every portal mutation calls `writeAudit(tx, …)` inside its transaction.**
  There is no `writeAudit(db, …)`. Check **A13** enforces it.
- **Every status change goes through `src/lib/state-machines.ts`** (D-030).
- **Never Prisma-write `quantitySold`, `quantityHeld` or `ticketSeq`.** Those
  belong to the guarded SQL. Enforced at the *type* level by `NoInventory<>` in
  `scope.ts`, because a grep only sees the shapes it was taught (D-034).
- **Catalog rows deactivate, never delete** (spec G2).

---

## 7. Traps that have already bitten

- **Returning a value from a Prisma interactive transaction commits it.** Every
  in-transaction rejection must `throw` (D-023, D-027).
- **Ticket numbers come from `Event.ticketSeq` via `UPDATE … RETURNING`**, never
  `COUNT(*)` — the latter mints duplicates under concurrency and fails a booking
  whose money already moved (D-021).
- **Capture *transitions* the `CREATED` payment row.** Inserting a second one
  violates the unique `gatewayOrderId`, 500s the webhook, and a real gateway
  answers a 500 by retrying forever (D-024).
- **`Prisma.Decimal` does not throw on `JSON.stringify`.** Its `toJSON()` returns
  a string and runs *before* any replacer, so a naive converter silently stores
  `"6"` instead of `6`. BigInt is the loud twin — it throws. See `toJson` in
  `src/lib/audit.ts` (D-029).
- **`notFound()` / `redirect()` are thrown control-flow.** A server action that
  catches its own errors will swallow them — hence two guard families (D-028).
- **`Payout.amountPaise` and `PayoutItem.*Paise` are BigInt** and are not
  JSON-serialisable across an RSC boundary. Convert at the query layer.
- **`FeaturedSlot.eventId` has no relation**, so `include: { event: true }` is
  impossible. Two-step fetch.
- **A server component cannot import a value from a `"use client"` module.** The
  bundler substitutes a client reference and the failure is silent. Shared
  constants get their own plain module — see `dock-height.ts`.
- **Vercel's free "Standard Protection" does not cover the production
  `*.vercel.app` alias.** It was set on the belief that it did, and the site came
  up fully public with a fixed super-admin OTP. `src/middleware.ts` and the
  `SITE_PASSWORD` requirement in `src/lib/demo.ts` exist because of that.
- **`webhookUrl()` defaulting to localhost** meant the deployed function POSTed
  its own payment webhook to a dead port: card accepted, screen said success,
  booking never confirmed, no error anywhere. Now falls back to `VERCEL_URL`.

---

## 8. A note on verification, worth reading twice

`npm run preflight` asserts things about an **attacker**, not a happy path. It
found nine failures on tenant isolation and admin RBAC that were not failures at
all — and the reason matters.

Both portals call their guard in a `layout.tsx` and check row ownership in the
`page`. By the time the page calls `notFound()`, Next has already streamed the
layout and **committed the HTTP status as 200**. The 404 arrives as a *body*.

The check read `r.status === 404`. So it reported nine failures on code that was
refusing correctly — and, far worse, it would have reported exactly the same nine
failures if those pages had been leaking every byte of another organizer's data.
It never looked at what came back.

The checks now assert on **content**, with a canary drawn from the protected row
(the event's own title), and fail loudly and distinctly on a real leak. The first
attempt at this used the booking number as the canary and produced a false
positive, because Next embeds the request URL in the streamed RSC payload — so
the canary appeared inside the not-found screen too.

**The lesson generalises: a check that cannot distinguish "refused" from
"leaked" is not a security check.**

---

## 9. Stack and running it

Next.js 16 App Router · TypeScript strict · Tailwind v4 · PostgreSQL + Prisma 7
(driver adapter; URL in `prisma.config.ts`) · Redis for OTP, rate limits and
short-lived state · BullMQ for scheduled jobs · Vitest.

External integrations sit behind typed adapters with working `sandbox` drivers,
so webhooks, idempotency and reconciliation are testable without vendor accounts
(D-008). `PAYMENTS_DRIVER`, `SMS_DRIVER`, `EMAIL_DRIVER`, `GEOCODE_DRIVER`,
`WHATSAPP_DRIVER`, `STORAGE_DRIVER`.

```bash
docker compose up -d   # Postgres 5433, Redis 6380 (offset from defaults on purpose)
npm run dev
```

**Every job has a synchronous fallback** (D-022). A queue is infrastructure that
can be down, and "the worker was not running" must never mean "these seats are
gone forever" — so anyone trying to buy a seat is, by definition, executing the
code that reclaims it.

### Signing in locally

- **Phone** `9812345001`, OTP `123456` (pre-filled on screen). Any seeded number
  works; `9000000001` is the super admin, `9900000001`–`6` are organizers.
- **Email** `meera@demo.entrynow.in` / `demo1234`. **Attendees only** — no
  organizer or admin row has a `passwordHash`, which is why the staff doors
  offer phone + OTP only.
- **Guest** — no account at all. Name, phone, email, then pay.

Test cards: `4111 1111 1111 1111` succeeds, `4000 0000 0000 0002` declines.
UPI: `success@upi` / `failure@upi`.

Both weakened paths are gated on `DEMO_MODE=true`, which the server **refuses to
boot with in production** unless `DEMO_MODE_ALLOW_PRODUCTION=true` *and*
`SITE_PASSWORD` is set (D-025, then hardened after the Vercel incident).

---

## 10. Status — 4 August 2026

`npm run audit`: **A1–A3, A7, A12, A13 green**; A6, A8–A11 are "not built yet"
counters. **Completion 45%** (spec 60/132 with 2 clauses relaxed by decision,
models written 33/47). **102 tests**, including DB-backed concurrency tests for
I1 *and* I2 against a real Postgres. `npm run preflight` passes with one warning.
Production `npm run build` is clean across **70 routes**.

**Done and verified:** marketplace read path · map location search on real OSM
tiles · phone-OTP, email+password **and guest** checkout · account hub · the
booking engine · demo mode with a real payment screen and test cards · licensed
event photography · the portal foundation · the refund engine · the organizer
portal (11 routes) · the admin portal (10 routes) · the gate scanner PWA ·
ticket delivery by in-app notification, SMS and email · separate sign-in doors
for each portal.

**Not yet done, in the order it should be taken:**

1. **Iteration 8 — settlement.** The payout *run* is the gap: approve and
   mark-paid exist and sweep the ledger correctly, but nothing creates the
   batches. Needs the 02:00 IST job selecting COMPLETED events past
   `payoutEligibleAt`, excluding suspended organizers and open disputes, plus
   negative-balance carry-forward.
2. **Iteration 4 — ticket lifecycle.** Refund *policy* evaluation (NO_REFUND /
   FLEXIBLE_72H / CUSTOM at the request timestamp, I12), user-initiated
   cancellation, transfers with token rotation, reviews. The refund *engine*
   underneath already exists (D-031).
3. **Part H jobs.** 11 of 12 unwritten; `hold-release` is the working template.
4. **`STORAGE_DRIVER`.** Blocks event cover-image upload and KYC document
   upload. Both are deliberately read-only until it exists.
5. **Iteration 9 — hardening.** SEO/JSON-LD, rate limiting, CSP with nonce,
   i18n, `buildFacets` performance (it currently loads every live event on every
   listing request), accessibility.

**Known warning:** `SESSION_JWT_SECRET` and `QR_JWT_SECRET` are still the
published `.env.example` values. Preflight reports it. Rotating the QR secret
genuinely invalidates every outstanding ticket (D-032), so do it **before**
selling, not after.

**Two live defects found and not yet fixed** (both pre-existing, both cosmetic):

- `TileMap` hydration mismatch — `modifierLabel()` returns `⌘` on the client and
  `Ctrl` on the server, so React regenerates that subtree on every home-page
  load. `src/components/marketplace/tile-map.tsx:402`.
- The `A6`/`A8`–`A11` counters have not been re-baselined since the portals
  landed; some "never written" models are written by seed code only.
