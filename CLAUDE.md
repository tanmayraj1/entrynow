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

`npm run build` is `prisma migrate deploy && next build`. The migrate step is
not optional garnish: Vercel runs `prisma generate` via `postinstall`, which
regenerates the *client* from the schema but never touches the database — so a
migration that adds a column ships a client that selects it against a table
that does not have it, and every query using that model 500s in production
while the build goes green. `prisma.config.ts` points the CLI at
`DIRECT_DATABASE_URL` because `migrate` needs a session-level connection that
Neon's pooler cannot give.

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
- **A `loading.tsx` above a `notFound()` turns a 404 into a 200** (D-037). It is
  a Suspense boundary, so Next flushes the shell — and commits the status —
  before anything below it runs. Adding preloaders "everywhere" silently made
  `/`, unknown cities, dead event URLs, foreign bookings and every portal
  refusal answer 200. **Keep a `loading.tsx` only where nothing beneath it can
  404**; today that is `account/` and `admin/(portal)/` alone. Removing one is
  not a blank screen — Next keeps the current page up during a client
  navigation.
- **A refused page can still answer 200 even without that.** A guard in a
  `layout.tsx` with the row check in the `page` streams the layout first, so the
  404 arrives as a *body*. Any check asserting on status alone is measuring the
  wrong thing; `scripts/preflight.mts` asserts on content with a canary drawn
  from the protected row.
- **Guest checkout must never reach a claimed account.** `User.phone` is unique,
  so "find or create by phone" is one line away from an account takeover. See
  `src/lib/auth/guest.ts` and D-036.
- **`min-height` beats a utility's `height`.** `globals.css` gives every
  `button` a 44px floor under `@media (pointer: coarse)`, so an `h-1.5` dot
  renders 44×44 on every phone — the carousel's indicators were two large white
  discs over the CTA. Keep the 44px target and paint the small mark on an inner
  `<span>`; never shrink the rule.
- **Satori is not a browser**, and it fails *silently* rather than throwing.
  Three ways, all found building the share cards (`src/lib/og/card.tsx`): it
  drops a **`<>` fragment** and everything inside it; it ignores the **`inset`
  shorthand**, collapsing an overlay to zero size; and it parses only simple
  `radial-gradient` forms. In every case the card still renders and the build
  still passes — the element is just not there.
- **resvg cannot decode a progressive JPEG**, and unlike the above it fails
  *loudly and late* — mid-stream, so the route 500s and the crawler gets no
  card at all. `/_next/image` re-encodes to progressive (and to AVIF unless you
  pin `Accept`), so cover photos are embedded from the original baseline file
  and checked by `isDecodable()` before they reach the renderer.
- **`Venue` is shared catalogue *and* tenant data.** `createdByOrganizerId`
  NULL means the platform curated it; set means one organizer added it and only
  they may see or edit it (D-040). It is deliberately **not** in A12's
  `TENANT_MODELS`, so the audit will not catch a missing ownership filter —
  reads go through `listSelectableVenues`, writes through `updateMany` with the
  owner in the `where`.
- **Summing a ledger `type` without naming an `account` returns zero.**
  Commission is double-entry: every charge writes `PLATFORM +X` *and*
  `ORGANIZER −X`, which is what makes a booking's rows sum to 0 (I3). So
  `where: { type: { in: ["COMMISSION", "GST_COMMISSION"] } }` sums both legs and
  yields 0.00 for every booking — a column of dashes that reads as "no
  commission configured" rather than as a bug. The organizer-side queries get
  away without it only because `organizerId` is populated on ORGANIZER legs
  alone. Any query grouping by *booking* or *event* must say `account`.
- **Firebase verifies the phone; it is never the identity** (D-041). It is
  asked one question — did this browser prove control of this number — and the
  answer feeds `findOrCreateUserByPhone`. No Firebase UID exists anywhere in
  the schema. `verify()` must check `issuer`/`audience` (or any project's token
  works), `sign_in_provider === "phone"` (or an email sign-in claims a number),
  and that `phone_number` matches the number being claimed (or a user verifies
  their own and submits someone else's). Verified with `jose`, not
  `firebase-admin` — no service-account secret in a public repo.
- **The brand mark exists three times and they must be kept in step.**
  `src/components/brand/logo.tsx` (the app), `src/app/icon.svg` (tabs and
  bookmarks) and the rasters from `scripts/make-icons.py` (favicon.ico,
  apple-icon.png, and the mark embedded in every share card). The icon's "e" is
  an **outline**, not a `<text>` node — a standalone SVG cannot reach the app's
  font stack, so `<text>` renders in the platform font and the letterform
  differs per OS, which is the same failure the no-emoji rule prevents. Both
  the SVG and the rasters carry the `onDark` swap: on a dark ground the navy
  half goes white and the counter goes navy, or the ticket loses a half.
- **Per-route `openGraph` / `twitter` metadata REPLACES the root's, never
  merges.** Returning `twitter: { title }` from a `generateMetadata` silently
  discards `card: "summary_large_image"` and turns the 1200×630 card into a
  thumbnail. Build the blocks with `shareMetadata()` in `src/lib/site.ts`.
