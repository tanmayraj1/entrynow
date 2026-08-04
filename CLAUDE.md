@AGENTS.md

# Entry Now

A BookMyShow-style marketplace for Indian events — Garba/Navratri, Diwali melas,
Holi, Uttarayan, food fests, comedy, concerts, theatre, sports, nightlife and
exhibitions. Ahmedabad-first. One Next.js app, four surfaces: public
marketplace, organizer portal, super-admin portal, and a dark mobile
gate-scanner PWA.

Renamed from *Shiv Events* (D-017). Ticket numbers are `EN-{eventShort}-{seq}`,
booking numbers `EN` + 6 digits. The repo directory is still `Shiv_Events`.

## Where the requirements live

| Source | Location | Authority |
|---|---|---|
| Design handoff | `design_handoff_shiv_events/` — README + 16 `.dc.html` prototypes | Visual intent: tokens, layout, copy, interaction states |
| System Logic Specification | **Pasted in chat, not in the repo** | Behaviour. **Wins on conflict**, by its own terms |
| `spec-coverage.json` | repo root | **The spec's durable form** — 132 clauses, each with its implementing file and covering test |
| `DECISIONS.md` | repo root | The durable record of every conflict resolved and every gap filled |

**`HANDOVER.md`** is the long-form version of this file: the full chronology,
the reasoning behind each surface, and every trap in one place. Read it if you
are picking this up cold. This file is the short version, loaded every session.

The spec is not a file, so **`DECISIONS.md` is the authority** on what was
decided and why. Read it before changing anything about money, time, refunds or
inventory. Append to it — required by the spec's Part J — whenever you make a
call the documents do not cover. The tiebreaker is: protect **attendee money →
organizer trust → platform revenue**, in that order.

The `.dc.html` prototypes are references, not code. They are 100% inline styles
with a bespoke templating runtime; nothing is ported from them directly.

A "Prompt 2" is referenced by the spec but was never supplied. Its stack role is
settled (below); its one technical citation is re-specified inline by the spec.

## Non-negotiable invariants

These come from the spec and are enforced in code. Do not weaken them.

- **I1** `sold + held ≤ total` per tier, under any concurrency.
- **I2** A ticket becomes `SCANNED` at most once, ever.
- **I3** Ledger entries for one booking sum to exactly **0**.
- **I4** Client-submitted prices are never trusted; the server recomputes.
- **I7** Timestamps stored UTC; **all** business logic evaluated in Asia/Kolkata.

Concurrency-critical writes use raw guarded SQL inside `$transaction` and check
`rowCount`. `rowCount === 0` is never an error to swallow — it is the branch
that returns per-tier availability, `ALREADY_SCANNED`, or a dropped duplicate
webhook. Prisma's fluent API cannot express these; do not "simplify" them.

## Conventions that are easy to get wrong

- **Money is integer paise.** Always `src/lib/money.ts`; never format currency
  inline. Rupees exist only at the formatting boundary. Floats cannot satisfy I3.
- **Dates go through `src/lib/ist.ts`.** No business code reads the server's
  timezone. Thresholds compare *exact fractions* — `differenceInHours` truncates
  and silently moves every deadline against the attendee (D-013).
- **A Garba session running 8 PM–1 AM belongs to its start date** but stays
  scannable until it ends. Gate validity is an instant comparison, never a
  date-key comparison (D-012).
- **CSS base styles must live in `@layer base`.** Unlayered CSS beats anything
  in a cascade layer regardless of specificity, so an unlayered `a { color }`
  silently overrides every Tailwind `text-*` utility.
- **Tailwind v4 prunes `@theme` variables it cannot see referenced.** The
  festival gradients are composed at runtime (`var(--gradient-${slug})`), so they
  live in a plain `:root` block, not `@theme`.
- **Never nest an interactive control inside a link.** The wishlist heart is a
  sibling of the card's `<Link>`, positioned over it.
- New surfaces set `data-theme` on their route-group layout. Never introduce a
  raw colour; use the token variables.
- **The brand gradient is reserved for action** — logo, primary CTAs, map price
  pins, ticket foil, hero mesh. Nothing else (D-019). Categories use three flat
  accents from `src/components/brand/category-glyph.tsx`; a per-category
  gradient turned a twelve-item rail into a paint chart.
- **No emoji as artwork.** Every glyph is an SVG in `src/components/brand/`.
  An emoji renders in the platform font, so the same empty state looked like a
  different product on each OS.
- **Motion is entrance-only** and always behind `prefers-reduced-motion`. Use
  `<Reveal>`, which ships content *visible* and hides it from an effect, so a
  failed hydration leaves a readable page rather than blank rectangles.
- **The map must never trap the reader** (D-020): wheel zoom needs Ctrl/⌘, and
  a vertical touch drag is handed back to the browser as a page scroll.

### Portal rules (Dashboards phase)

- **An organizer's id comes from the session, never from a request.** Use the
  branded `OrganizerId` from `src/lib/queries/organizer/scope.ts`; it is minted
  only by `organizerScope()`, called only from `src/lib/auth/rbac.ts`. Audit
  check **A12** fails the build otherwise (D-027).
- **Organizer writes use `updateMany`/`deleteMany`, never `update`/`delete`.**
  The singular forms need a *unique* where-clause and there is no
  `@@unique([id, organizerId])`, so they have nowhere to put the ownership
  filter. Assert `count === 1`. A12 flags the singular forms.
- **Pages use `requireOrganizer`/`requireAdmin` (they throw); server actions use
  `authorizeOrganizer`/`authorizeAdmin` (they return)** — D-028.
- **Every portal mutation calls `writeAudit(tx, …)` inside its transaction.**
  There is no `writeAudit(db, …)`. Audit check **A13** enforces it (I6, D-029).
- **Every status change goes through `src/lib/state-machines.ts`** (I5, D-030).
  `assertTransition` throws, because returning commits.
- **Never Prisma-write `quantitySold`, `quantityHeld` or `ticketSeq`** — those
  belong to the guarded raw SQL in `src/lib/booking/inventory.ts`. A13 flags it.
- **Catalog rows deactivate, never delete** (spec G2). A12 flags
  `city|locality|category|festival` deletes anywhere.

## Stack

Next.js 16 App Router + TypeScript strict · Tailwind v4 (four theme scopes) ·
PostgreSQL + Prisma 7 (driver adapter; URL lives in `prisma.config.ts`) · Redis
for OTP, rate limits and short-lived state · BullMQ for scheduled jobs ·
Vitest. External integrations sit behind typed adapters with working `sandbox`
drivers, so webhooks, idempotency and reconciliation are testable without vendor
accounts (D-008).

## Running it

```bash
docker compose up -d   # Postgres 5433, Redis 6380 (offset from defaults on purpose)
npm run dev
```

Attendees sign in at `/auth`; staff have their own doors at `/organizer/login`
and `/admin/login` (D-035). Same credential store — separate doors are
presentation, never the boundary.

- **Phone** `9812345001`, OTP `123456` (pre-filled). Any seeded number works;
  `9000000001` is the super admin, `9900000001`–`6` are organizers.
- **Email** `meera@demo.entrynow.in`, password `demo1234`. **Attendees only** —
  no organizer or admin row has a `passwordHash`, which is why the staff doors
  offer phone + OTP alone.
- **Guest** — no account at all. Name, phone and email at checkout (D-036).

Pay with test cards on the payment screen — `4111 1111 1111 1111` succeeds,
`4000 0000 0000 0002` declines, `success@upi` / `failure@upi` for UPI.

Both weakened paths are gated on `DEMO_MODE=true`, which the server **refuses
to boot with in production** unless `DEMO_MODE_ALLOW_PRODUCTION=true` says the
deployment is behind access control (D-025). Event photography comes from
Wikimedia Commons and is attributed at `/legal/image-credits` — that page is a
licence condition, not decoration (D-026).

## The working loop

Development runs as an **audit-gated loop**, not phase-by-phase feature work.

```bash
npm run audit        # static checks + the completion meter
npm run audit:http   # adds the route crawl + content sanity (needs dev server)
```

Eleven checks. **A1–A5** cover navigation and interaction; **A6–A11** are the
completion meter: model-write coverage, invariant tests, spec-clause coverage,
job registration, config/env liveness, adapter completeness.

`incomplete` findings are **not failures** — they mean "not built yet", which is
the normal state mid-loop. Only `blocker` and `broken` fail the exit code. The
scoreboard prints a completion percentage; drive it to 100%.

When you satisfy a spec clause, set its `impl` and `test` in
`spec-coverage.json` **in the same commit**. A8 verifies those paths exist, so a
stale reference is reported as broken rather than silently reading as covered.

One iteration: run the audit → fix the highest-severity cluster (**blocks a
booking > dead navigation > dead control > polish**) → gate on
`typecheck && lint && test && audit:http` → **click through the changed pages in
a browser** → report.

A green audit is not proof. It once passed a wishlist button that was correctly
wired but never told a session existed, so every click navigated away. Assert
the observable outcome — URL unchanged, `aria-pressed` flipped, and the server
agrees — plus 390/768/1440 for horizontal overflow.

## Status — 4 August 2026

`npm run audit`: **A1–A3, A7, A12, A13 green**; A6/A8–A11 are "not built yet"
counters. **Completion 45%** (spec 60/132 with 2 clauses relaxed by decision,
models written 33/47). **102 tests**, including DB-backed concurrency tests for
I1 *and* I2 against a real Postgres. `npm run preflight` passes with one
warning. Production `npm run build` is clean across **70 routes**.

**Done and verified:** marketplace read path · map location search on real OSM
tiles · phone-OTP, email+password **and guest** checkout · account hub · the
**booking engine** (atomic hold + release, promo reservation, payments adapter
with signed webhooks, idempotent capture, persisted double-entry ledger) ·
ticket delivery by in-app notification, SMS and email · demo mode with a real
payment screen and test cards · licensed event photography · the **portal
foundation** (RBAC guards, branded tenant isolation, audit log, state machines,
audit checks A12/A13) · the **refund engine** (wallet mode, idempotent,
per-booking transactions — D-031) · the **organizer portal** (11 routes) · the
**admin portal** (10 routes) · each portal's own sign-in door (D-035) · the
**gate scanner PWA** (signed QR, atomic claim, offline manifest + IndexedDB
queue + device-clock replay).

**Not yet done:** transfers · the payout *run* (approve/mark-paid exist; the
02:00 IST batch job does not) · 11 of the 12 Part H jobs · reviews · referrals ·
`SOURCE`-mode refunds (needs a gateway refund adapter; wallet mode ships) ·
event-wizard steps beyond the draft (cover image upload needs `STORAGE_DRIVER`)
· KYC document upload, for the same reason.

Deployed at <https://entrynow.vercel.app> — Vercel + Neon + Upstash,
auto-deploying on push to `main`. `/admin` sits behind HTTP Basic
(`src/middleware.ts`).

`SESSION_JWT_SECRET` and `QR_JWT_SECRET` are still the published `.env.example`
values. Rotating the QR secret invalidates every outstanding ticket (D-032), so
do it **before** selling, not after.

## Traps that have already bitten

- Returning a value from a Prisma interactive transaction **commits** it. Every
  in-transaction rejection must `throw` (D-023, D-027).
- Ticket numbers come from `Event.ticketSeq` via `UPDATE … RETURNING`, never
  `COUNT(*)` — the latter mints duplicates under concurrency and fails a
  booking whose money already moved (D-021).
- Capture *transitions* the `CREATED` payment row; inserting a second one
  violates the unique `gatewayOrderId`, 500s the webhook, and a real gateway
  answers a 500 by retrying forever (D-024).
- **`Prisma.Decimal` does not throw on `JSON.stringify`** — its `toJSON()`
  returns a string and runs *before* any replacer, so a naive converter
  silently stores `"6"` instead of `6`. BigInt is the loud twin (it throws).
  See `toJson` in `src/lib/audit.ts` (D-029).
- `notFound()` / `redirect()` are **thrown** control-flow. A server action that
  catches its own errors will swallow them — hence two guard families in
  `src/lib/auth/rbac.ts` (D-028).
- **A server component cannot import a value from a `"use client"` module.** The
  bundler substitutes a client reference and the failure is *silent* — a
  template literal compiled to `var(--dock-pad, function() {…}px)`, the browser
  dropped it as invalid, and the sticky dock covered the last 56px of every
  mobile page. Shared constants get their own plain module
  (`src/components/marketplace/dock-height.ts`).
- **A refused page does not answer 404.** Both portals guard in a `layout.tsx`
  and check row ownership in the `page`, so Next has already streamed the layout
  and committed a 200 before anything calls `notFound()` — the 404 arrives as a
  *body*. Any check asserting on status alone is measuring the wrong thing;
  `scripts/preflight.mts` asserts on content with a canary instead.
- **Guest checkout must never reach a claimed account.** `User.phone` is unique,
  so "find or create by phone" is one line away from an account takeover. See
  `src/lib/auth/guest.ts` and D-036.
