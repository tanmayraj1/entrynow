# Decisions

Required by System Logic Specification **Part J**:

> Any behavior not covered here: choose the option that protects (in order)
> attendee money → organizer trust → platform revenue, record it in
> DECISIONS.md, continue.

Every entry states the conflict or gap, the decision, and why. Append; do not
rewrite history.

## Source documents

| Ref | Document | Authority |
|---|---|---|
| **DESIGN** | `design_handoff_shiv_events/README.md` + 16 `.dc.html` prototypes | Visual intent: tokens, layout, copy, interaction states |
| **SPEC** | System Logic Specification ("Prompt 3") | Behaviour. Wins on conflict, by its own terms |

A "Prompt 2" is referenced by SPEC (stack, and a §6 atomic-claim snippet) but
was never supplied. Its stack role is filled by D-002; its §6 content is
re-specified inline by SPEC C4.2b. Revisit if it surfaces.

---

## D-001 — Product name is "Shiv Events"

**Conflict.** DESIGN brands the product *Shiv Events* (`SHV-2610-4821`). SPEC
calls it *Utsav* (`UTS-GRB-0412`).

**Decision.** *Shiv Events*. Confirmed by the product owner: Utsav was the
earlier working name.

**Consequence.** ID formats take the better structure from SPEC with the current
brand's prefix:

- Ticket: `SHV-{eventShort}-{seq}` — e.g. `SHV-GRB-0412`
- Booking: `SHV` + 6 digits — e.g. `SHV482100`

SPEC's `{eventShort}` grouping is retained because it makes a ticket number
legible at a gate without a lookup, which the design's flat `SHV-2610-4821`
does not.

## D-002 — Stack: Next.js full-stack

**Gap.** The stack document was never supplied.

**Decision.** Next.js (App Router) + TypeScript strict + Tailwind v4 +
PostgreSQL/Prisma + Redis + BullMQ, one deployable. Chosen with the product
owner.

**Why.** SPEC assumes server-authoritative transactions, webhooks and scheduled
jobs; DESIGN assumes SEO landing pages (Festival, Event). One Next.js app
serves both without a second service.

## D-003 — Booking fee is charged on the pre-discount subtotal

**Conflict.** DESIGN: "fee = 3.5% of **discounted** subtotal". SPEC A3: "3.5% of
subtotal, min ₹15, max ₹99".

**Decision.** 3.5% of the **pre-discount** subtotal, clamped to [₹15, ₹99].

**Why.** SPEC's D1 worked example is decisive and unambiguous: a ₹1,000 subtotal
with a ₹100 promo produces a ₹35 fee. 3.5% × 1000 = 35; 3.5% × 900 = 31.50.
Implemented in `src/lib/money.ts:bookingFee`, asserted in `money.test.ts`.

## D-004 — Ledger gains a `PAYMENT_IN` leg

**Defect in SPEC.** Invariant I3 requires `sum(LedgerEntries per booking) = 0`.
The five rows listed in D1 sum to **+941.30** — exactly what the user paid. The
user/gateway side of the double entry is missing, so I3 cannot hold as written.

**Decision.** Add a `PAYMENT_IN` row on an `EXTERNAL` account for the gateway
portion, and `WALLET_REDEEM` (also `EXTERNAL`) for any wallet portion. Both
negative: money entering the booking from outside it.

**Result.** D1 now balances exactly — organizer ₹815.04, platform ₹126.26,
sum 0. Every other figure in D1 is unchanged. Asserted in `money.test.ts`.

**Why `EXTERNAL` for wallet.** Wallet balance is authoritatively tracked in
`WalletTxn`; within a *booking's* ledger the redeemed amount is still
user-provided funds. Keeping it on `EXTERNAL` preserves I3 without duplicating
the wallet's own accounting.

## D-005 — Promos need two counters

**Conflict inside SPEC.** C4.4 says `usedCount` increments only at capture,
"prevents burn by abandoners". Edge case I7 says promo consumption is
*reserved* at order-creation, "like inventory, released on failure/expiry".

**Decision.** Both. Schema carries `used_count` **and** `reserved_count`. The
guarded reservation is:

```sql
UPDATE promos SET reserved_count = reserved_count + 1
WHERE id = $1 AND used_count + reserved_count < usage_limit;
```

At capture: `reserved_count − 1, used_count + 1`. On expiry/failure:
`reserved_count − 1`.

**Why.** They solve different problems — reservation stops the oversell race at
the limit boundary, deferred `usedCount` stops abandoners burning the code.
Neither alone satisfies both requirements.

## D-006 — Refund balancing leg is derived, not recomputed

**Gap.** SPEC D1 describes partial refunds as "reverse 50% of sale/commission
rows only" but does not say how the outbound user leg is derived.

**Decision.** The `EXTERNAL` refund row is the exact negation of the sum of all
other rows in that refund, rather than being recomputed from the organizer's
net.

**Why.** Under a fractional refund, rounding each reversed row independently can
leave a paise of drift. Deriving the balancing leg from the actual sum makes I3
hold by construction at any fraction. Protects attendee money (Part J order).

## D-007 — Plan prices and commission

**Conflict.** DESIGN renders Basic ₹10k / Pro ₹25k and "Pro 6% / Basic 8%" and
"weekly Friday settlements". SPEC A3 sets Basic ₹4,999 (5 live events) / Pro
₹14,999 (unlimited + featured), `PLATFORM_COMMISSION_PCT = 8` with per-organizer
override, and D2 a daily 02:00 IST payout run with `PAYOUT_DELAY_DAYS = 3`.

**Decision.** SPEC's numbers throughout. DESIGN's rendered copy is updated to
match. The design's *Pro 6%* promise is honoured through SPEC's own mechanism:
assigning the Pro plan writes a 6% per-organizer commission override.

**Why.** SPEC wins by its own terms; the lower plan prices and the faster,
predictable payout cadence both favour organizer trust over platform revenue,
matching Part J's ordering. "Weekly Friday settlements" is removed from
organizer-facing copy — leaving it would be a false promise.

## D-008 — Integrations are adapters with sandbox drivers

**Gap.** SPEC names Razorpay Route, an SMS provider and WhatsApp delivery but
assumes accounts exist.

**Decision.** Payments, SMS, WhatsApp, geocoding and storage each sit behind a
typed interface resolved by env var, with a fully functional `sandbox` driver.
The sandbox emits real webhooks (with latency and a configurable failure rate),
so idempotency, the late-capture path and the reconciliation job are all
exercised without a vendor account.

**Why.** The hardest, highest-risk logic in SPEC is the payment lifecycle.
Mocking it away would leave it untested; blocking on vendor KYC would stall
every other phase.

## D-009 — Booking fee clamp is method-independent

**Gap.** SPEC does not say whether the ₹15/₹99 clamp applies before or after a
wallet offset.

**Decision.** The clamp applies to the gross fee, computed from the subtotal
alone, before any wallet or promo consideration.

**Why.** The fee prices the platform's service, which does not vary by how the
user chose to pay. Making it method-dependent would let a user shrink the fee by
splitting payment.

## D-010 — Basic plan cap breach blocks publish

**Gap.** SPEC A3 caps Basic at 5 live events but does not define what happens on
the sixth.

**Decision.** Block the publish action with an inline upgrade CTA. Existing LIVE
events are never affected; DRAFT creation stays allowed.

**Why.** Protects attendee money and organizer trust — silently unpublishing or
auto-charging an upgrade would do the opposite. Mirrors SPEC D3's treatment of a
lapsed plan ("cannot create/publish new events; LIVE events unaffected").

## D-011 — All money is integer paise

**Gap.** SPEC states amounts in rupees with two decimals (₹12.96, ₹941.30).

**Decision.** Every stored and computed amount is an integer number of paise.
Rupees exist only at the formatting boundary (`inr()`) and at parse time.

**Why.** I3 demands exact equality to zero. Floating-point rupees cannot
guarantee it. Rounding is half-away-from-zero so refund reversals stay sign-
symmetric with the captures they mirror.

## D-014 — No inventory hold until payment exists

**Gap.** SPEC C4.2c takes an 8-minute hold the moment checkout starts, and a
hold-release job returns the seats on expiry. The release job is part of the
booking-engine work; the checkout entry point landed earlier, to remove the
dead `/booking/new` link.

**Decision.** `/booking/new` validates the request and computes the totals
server-side, but takes **no hold**, and says so plainly on the page. The hold
starts when payment does.

**Why.** A hold with no release leaks inventory permanently — every abandoned
checkout would burn seats that nobody can buy and nobody can free. Protecting
attendee access to seats beats showing a more complete-looking flow. Reverted
by the booking-engine iteration, which adds the hold and its release together.

## D-015 — The language switcher is removed until i18n ships

**Conflict.** DESIGN shows an `EN · हिंदी · ગુજરાતી` switcher in the utility bar
and footer. It was rendered as plain text with no behaviour.

**Decision.** Removed from both. The ~15% width headroom for Devanagari and
Gujarati stays in the layouts, so the control can return without a redesign.

**Why.** A control that looks interactive and does nothing is worse than its
absence: it tells a Gujarati-speaking user the product supports their language
and then silently refuses. The footer slot now links to the privacy policy,
which is a real destination.

## D-013 — Time thresholds compare exact fractions, never truncated hours

**Gap.** SPEC states thresholds in whole hours ("more than 6h before the
session", "72h before session start", ">2h before session") without saying how
partial hours resolve.

**Decision.** All threshold comparisons use exact fractional hours.
`hoursUntil()` computes from milliseconds rather than using
`differenceInHours`, which truncates toward zero.

**Why.** Truncation silently moves every boundary against the attendee. A
cancellation 6h30m before a session reads as "6" and fails a `> 6` check, so the
seats are burned and not restored — the user loses their refundable inventory
because of a rounding artefact. Caught by `ist.test.ts`. Protects attendee money
(Part J order).

## D-012 — Session "today" is an instant comparison, never a date comparison

**Clarification of SPEC I8.** A Garba session running 8 PM–1 AM belongs to its
start date, and the scanner must accept until the session *ends*.

**Decision.** Gate validity is `now ∈ [startsAt, endsAt + grace]`, a pure
instant comparison. The IST calendar date is used only for *filing* a session
(which day it appears under) and for the `WRONG_SESSION` message. All of it goes
through `src/lib/ist.ts`; no business code may read the server's local zone.

**Why.** A date-key comparison would reject a valid attendee at 00:01 IST.

## D-016 — The map is hand-rolled on raster tiles, not a mapping library

**Gap.** Neither document specifies how the map view is drawn. DESIGN shows
price pins over a stylised ground; SPEC C2.3 only requires "near me" and a
radius.

**Decision.** A ~200-line slippy map: Web Mercator in `src/lib/geo.ts`, tiles as
plain `<img>`, pins as ordinary DOM buttons. Zoom is integer-only. The tile
template is `NEXT_PUBLIC_MAP_TILE_URL`, defaulting to OpenStreetMap.

**Why.** The projection is the same eleven lines the server already needs for
bbox queries, so a library would introduce a *second* source of truth for
coordinates that must agree with the API's `north/south/east/west`. Pins as DOM
inherit the design tokens and stay keyboard-reachable, which a canvas layer does
not. Cost: ~150 kB of JS and a vendor CSS reset avoided.

**Consequence.** OSM's public tile endpoint is rate-limited and forbids heavy
use — before launch this must point at a paid provider or a self-hosted proxy,
and `NEXT_PUBLIC_MAP_ATTRIBUTION` must carry that provider's required notice.

## D-017 — Product name is "Entry Now"; ID prefixes become EN

**Supersedes the branding half of D-001.** The product owner renamed the
platform to *Entry Now* and supplied a logo: a navy ticket torn against an
orange-to-magenta gradient.

**Decision.** *Entry Now*. ID formats keep SPEC's structure with the new prefix:

- Ticket: `EN-{eventShort}-{seq}` — e.g. `EN-GRB-0412`
- Booking: `EN` + 6 digits — e.g. `EN482100`

**Why now.** Nothing writes `Booking` or `Ticket` yet, so the prefix change
costs one sed. After the booking engine ships it would need a migration and a
dual-format parser at the gate scanner, which is exactly the kind of debt that
outlives the rename.

**Consequence.** The palette moves from teal to navy-led with the gradient
reserved for action (CTAs, price pins, active states, ticket foil). Organizer
dashboards take the logo's orange and admin its navy, so an operator with both
open can tell the tabs apart. Green stays the scanner's VALID colour: at a gate,
"go" is not a brand decision.

## D-018 — Reference creatives are art direction, not assets

**Gap.** Seven reference images were supplied "to use" on the site.

**Decision.** They inform the visual language — bold display type, deep
saturated grounds, marigold ornament, layered ticket stubs — and none of them
ship. Every illustration in `src/components/brand/` is drawn for this codebase.

**Why.** The supplied files carry a competitor's logo (BookMyShow), other
companies' marks, licensed characters and identifiable performers with no
release. Shipping them would put a competitor's brand on our own homepage and
create a copyright and likeness exposure that survives any later redesign.
Confirmed with the product owner before proceeding.

## D-019 — Gradients are reserved for action; categories get three flat colours

**Reversal of an earlier call in this session.** The first rebrand pass gave
every category its own gradient, inherited from the old `Category.gradient`
column. On a twelve-category rail that produced a paint chart, and the event
cards below — also gradient-filled — could not compete with it.

**Decision.** The brand gradient appears in exactly five places: the logo,
primary CTAs, map price pins, the ticket foil edge, and the hero mesh.
Everywhere else uses flat colour from a three-value set — navy `#16264C`,
orange `#FF6B2B`, rose `#ED2C63` — assigned per category in
`src/components/brand/category-glyph.tsx`.

Category tiles are an off-white plate with a hairline border and the glyph in
its accent; the accent fills the plate only on hover. The event-card poster
plate is navy with an oversized low-opacity glyph, used only when the organizer
has uploaded no cover art.

**Why.** A gradient used everywhere stops signalling anything. Reserving it for
"act on this" is what makes a CTA read as a CTA, and it lets the actual
merchandise — the event posters — be the loudest thing on the page.

**Consequence.** `Category.gradient` is now only read by the promo banners,
which are meant to shout. The `--gradient-*` custom properties stay defined for
that use and for organizer-uploaded banner art.

## D-020 — The map never steals the page scroll

**Bug, reported from a real browser.** Scrolling the page with the cursor over
the map zoomed the map instead of scrolling past it.

**Decision.** Wheel zoom requires Ctrl / ⌘. A plain wheel is not
`preventDefault`ed and the page scrolls; a transient overlay says "Hold ⌘ and
scroll to zoom" so the gesture stays discoverable. A trackpad pinch already
arrives as `wheel` with `ctrlKey`, so pinch-to-zoom is unaffected.

On touch the box is `touch-action: pan-y`, and a drag whose first movement is
more vertical than horizontal is handed back to the browser as a page scroll.
Pointer capture is claimed on the first *accepted* movement, never on
`pointerdown`, because capturing up front steals a gesture the browser was
about to turn into a scroll.

**Why.** A locator that traps the reader is worse than no map. Zoom is
available from the +/- buttons, the keyboard, and the modifier — losing the
bare wheel costs nothing.

## D-021 — Ticket numbers come from a per-event counter, not COUNT(*)

**Gap.** D-001 fixes the *format* (`EN-{eventShort}-{seq}`) but not how `seq` is
allocated.

**Decision.** `Event.ticketSeq`, incremented by a single
`UPDATE … SET "ticketSeq" = "ticketSeq" + n … RETURNING "ticketSeq"`, which
reserves a whole block for one booking atomically.

**Why.** The obvious implementation — `COUNT(*)` of the event's existing
tickets, plus an index — lets two concurrent captures read the same count and
mint the same number. The unique index would then reject the second one, which
turns a **successful payment into a failed booking**: the worst possible place
to discover a race, because the money has already moved. Protects attendee
money (Part J order).

## D-022 — Every scheduled job has a synchronous fallback

**Gap.** Part H specifies the jobs but not what happens when the job runner is
down.

**Decision.** Inventory release has two independent triggers: the delayed
BullMQ job, and an opportunistic sweep of that event's expired holds run at the
top of every `createBooking`. `enqueueSafely` logs and returns false rather
than throwing, so a Redis outage degrades the queue instead of failing a
booking.

**Why.** A queue is infrastructure, and infrastructure is down sometimes. "The
worker wasn't running" must never mean "these seats are gone forever". The
sweep is self-healing by construction: whoever is trying to buy the seat is, by
definition, executing the code that reclaims it. Protects organizer trust.

## D-023 — In-transaction failures throw; they never return

**Bug, caught by `tests/invariants/hold.test.ts`.** A multi-tier order where
the second tier had no stock left the FIRST tier's seats held anyway.

**Cause.** Returning a value from a Prisma interactive transaction **commits**
it. Every failure branch inside `createBooking` was returning a
`{ ok: false }` result, so Prisma dutifully committed the holds taken before
the failure. Only a throw rolls back.

**Decision.** Every in-transaction rejection throws `BookingRejected`, which
carries the user-facing result; the caller catches it outside the transaction
and returns it. Same pattern for `LateCaptureSoldOut` in capture.

**Why this is worth a decision entry.** The broken version type-checked, passed
lint, and returned exactly the right JSON to the client. Nothing but a
concurrency test against a real Postgres would have found it — which is the
argument for those tests existing at all.

## D-024 — Capture transitions the payment row, it does not insert one

**Bug, caught by `scripts/e2e-booking.mts`.** The webhook 500'd with a unique
violation on `Payment.gatewayOrderId`.

**Cause.** `POST /api/bookings` inserts the payment as `CREATED` when it opens
the gateway order. Capture then inserted a *second* row for the same order.

**Decision.** Capture upserts on `gatewayOrderId`; failure updates the CREATED
row in place. A payment is one row that moves through its state machine (spec
B4), not one row per event about it.

**Why it mattered more than it looked.** The webhook returned 500, which tells
a real gateway to **retry** — so a single bug would have become an unbounded
retry storm against an endpoint that could never succeed. Found only because
the sandbox driver delivers a real HTTP webhook rather than resolving a promise
in-process (D-008).

## D-025 — Demo auth is gated, announced, and refuses to boot silently

**Requirement.** The product owner asked for two sign-in options for a demo:
phone + OTP, and email + password with **no verification**.

**Decision.** Both ship, behind `DEMO_MODE=true`:

- Email sign-up creates a usable account from any address, unverified.
- Phone sign-in keeps the sandbox driver's fixed OTP.
- Payment is a real screen driven by test cards, not an auto-confirm.

Three things make that safe to build rather than dangerous to ship:

1. `assertDemoModeIsIntentional()` runs from `instrumentation.ts` and **throws
   at boot** if `DEMO_MODE=true` with `NODE_ENV=production`, unless
   `DEMO_MODE_ALLOW_PRODUCTION=true` explicitly acknowledges it.
2. A non-dismissible banner sits above every marketplace page.
3. `DEMO_MODE` is deliberately not `NEXT_PUBLIC_` — a client-readable flag
   could be flipped in devtools, and it decides whether an unverified login is
   accepted.

**Why the guard rather than trust.** With a fixed OTP, anyone can sign in as
the seeded super-admin. That is entirely reasonable behind access control and
catastrophic on a public URL, and the difference between the two is one
environment variable that is easy to carry forward by accident. Failing at boot
puts the mistake in front of whoever is watching the deploy logs.

**Sign-in and sign-up share one action** so the two cannot be used to enumerate
which addresses have accounts, and the password is verified even when no user
exists so response timing does not leak it either.

## D-026 — Event photography is Wikimedia Commons, with generated attribution

**Gap.** The catalogue needed real hero photography; the earlier supplied
reference images could not ship (D-018).

**Decision.** `scripts/fetch-event-images.mts` pulls category-relevant photos
from Wikimedia Commons, filtered to CC BY / CC BY-SA / CC0 / public domain and
to landscape aspect, and writes `public/images/events/credits.json`.
`/legal/image-credits` renders that manifest.

**Why not a random-photo service.** Picsum and friends are keyless but return
*unrelated* photographs. A stock landscape on a Garba night reads as filler and
actively damages the listing. Commons is the only keyless source where the
subject is searchable **and** the licence is machine-readable.

**Why the credits page is load-bearing.** CC BY and CC BY-SA grant free
commercial use *on condition of attribution*. Without the page these images
would be unlicensed in practice, so it is generated from the same manifest the
downloader writes and cannot drift from what is on disk.

## D-027 — Tenant isolation is a type, a query layer, and a build check

**Requirement.** Organizer A must not read or write organizer B's rows. The
product owner asked for this to be *provable*, not intended.

**Decision.** Three layers, because any one alone is escapable:

1. **A branded `OrganizerId`** (`src/lib/queries/organizer/scope.ts`), minted
   only by `organizerScope()`, called only from `src/lib/auth/rbac.ts`, only
   from the session. An id that arrived in a URL is a plain `string` and does
   not type-check.
2. **Ownership-checked accessors.** Reads use `findFirst` with the organizer in
   the `where`; writes use `updateMany`/`deleteMany` and assert `count === 1`.
3. **Audit check A12**, severity `broken`, so a violation fails the build.

**Why writes must use the plural forms.** Prisma's `update`/`delete` require a
*unique* where-clause, and there is no `@@unique([id, organizerId])` on `Event`
— so `update({ where: { id } })` is the only shape that compiles, and it has
nowhere to put the ownership filter. `updateMany` takes an arbitrary filter and
returns a count, which is the check itself. A12 flags the singular forms.

**Verified it works**: a deliberately unscoped `findMany` dropped into the
scoped directory was reported as `broken` before being deleted.

## D-028 — Page guards throw; action guards return

**Gap.** Next implements `notFound()` and `redirect()` by *throwing* a
control-flow error.

**Decision.** Two families in `src/lib/auth/rbac.ts`:
`requireOrganizer` / `requireAdmin` for pages and layouts, which throw; and
`authorizeOrganizer` / `authorizeAdmin` for server actions, which return
`{ ok: false, error }`.

**Why.** Server actions in this codebase follow the `src/app/auth/actions.ts`
shape: wrap the work, return a typed result, never throw on user error. Such an
action calling `notFound()` **catches Next's own control-flow throw** and turns
a 404 into a generic error — or worse, swallows it and continues past the
failed authorisation check.

**Also decided:** an admin lacking a permission gets the same message as a
non-admin. A distinct message tells a lower-privileged admin exactly which
permission to target.

## D-029 — Audit rows are transactional, redacted, and Decimal-safe

**Decision.** `writeAudit(tx, …)` takes the transaction as its **first**
parameter, so an audit row and the change it describes commit or roll back
together. There is deliberately no `writeAudit(db, …)` overload — an audit row
for a rolled-back change is then unrepresentable. A13 flags `writeAudit(db`.

**Two traps found while building it**, both worth recording:

- **`Prisma.Decimal` does not throw on `JSON.stringify`.** It has a `toJSON()`
  returning a *string*, and `JSON.stringify` calls that **before** the replacer
  sees the value — so a `toNumber` duck-type in the replacer never fires and
  the row silently stores `"6"` (or, without `toJSON`, `{s,e,d}` internals)
  instead of `6`. The fix is a non-arrow replacer reading `this[key]`, which is
  the raw pre-`toJSON` value. BigInt is the loud twin: it throws outright.
  Caught by `src/lib/audit.test.ts`, which failed on first run.
- **KYC and banking fields are redacted.** The audit log is append-only,
  long-lived and readable by every SUPER admin. That a bank account *changed*
  is the auditable fact; copying the number into a second, wider-read table is
  a liability with no investigative benefit.

## D-030 — State transitions live in one table, and terminal means terminal

**Decision.** `src/lib/state-machines.ts` holds Event, OrganizerProfile, Payout
and Dispute as explicit adjacency maps (spec I5). `assertTransition` **throws**
rather than returning false — these run inside Prisma interactive transactions,
where returning a value commits (D-023).

**Why as data.** The illegal edges become as readable as the legal ones. That
`CANCELLED` has no outgoing edges at all is a business rule — a cancellation
has already refunded money — that no amount of reading the admin routes would
reveal.

**Consequence for "delete a bad event"**: `canHardDeleteEvent` permits deletion
only of a DRAFT that never published. Anything else has `Ticket`, `Payment` and
`LedgerEntry` rows pointing at it, and those rows are the evidence of what was
owed to whom. Pause, Cancel and Suspend are the real tools.

## D-031 — Build the wallet-refund path, rather than shipping Cancel disabled

**The open question.** Cancelling an event must return money to everyone who
booked, and no refund engine existed — `db.refund` was read-only across the
entire codebase. Either the admin Cancel button shipped disabled, or a minimal
refund path was built alongside it.

**Decision: build it.** Part J's tiebreaker is attendee money → organizer trust
→ platform revenue, and a Cancel button that ends an event without returning
anyone's money inverts that ordering completely. Shipping the platform's most
destructive action as also its least honest one was not defensible.

**Scope, stated plainly.** `src/lib/refunds.ts` implements the **wallet** path.
`WALLET` mode completes inside the transaction — the balance moves, the
`Refund` row is COMPLETED, and the attendee can spend it immediately. `SOURCE`
mode (back to the original card or UPI handle) needs a gateway refund adapter
that does not exist yet, so it records a PENDING `Refund` and returns
`pendingGateway: true` rather than pretending to have paid anyone.

**Three properties hold regardless of mode:**

- **Idempotent.** The booking transition is a guarded `UPDATE … WHERE status =
  'CONFIRMED'`. A retried bulk cancel, a double-clicked button and a resumed
  job all find `rowCount === 0` and stop. Nobody is paid twice.
- **Invariant I3 survives.** The refund rows sum to zero on their own, so the
  booking's lifetime total stays zero. `writeLedger` asserts it before
  inserting.
- **Capture rows are recomputed** from the booking's snapshotted money columns,
  not read back from `ledger_entries` — the stored rows accumulate reversals
  from any earlier partial refund, so reading them would double-count the
  moment partial refunds ship.

**One transaction per booking, not one for the event.** A sold-out Garba night
is thousands of bookings; a single transaction would hold locks across the
whole event for minutes and lose all completed work if the last one failed.
Per-booking transactions mean a crash halfway leaves the first half genuinely
refunded, and re-running finishes the job.

**Terminal status.** A refunded booking takes the `CANCELLED_BY_{ADMIN,
ORGANIZER,USER}` status that names *who* ended it, and the `Refund` row carries
the money. `REFUNDED` would lose the actor, and "Cancelled by organizer —
₹941.30 refunded to your wallet" is what an attendee needs to read.

**SCANNED tickets are left alone.** Someone who already walked through the gate
attended; rewriting that would corrupt both the gate record and the attendance
count the organizer is paid against.

## D-032 — The QR is signed, which makes a documented promise true

**Decision.** `src/lib/qr.ts` signs a compact JWS over `{jti: qrTokenId, ev:
eventId}` with `QR_JWT_SECRET`.

**Why it mattered.** The secret was never read anywhere in the codebase, so the
documented property — "rotating `QR_JWT_SECRET` invalidates every ticket" — was
simply false: the QR carried a bare `qrTokenId`, and a raw token stays valid
forever. Signing makes that true and adds three things: a forged QR fails
verification *before* touching the database, so `qrTokenId`s cannot be
brute-forced at a gate; the event id is inside the signature, so a foreign
ticket is refused with no query; and `exp` bounds a photographed screen.

**Expiry is deliberately loose** — the event's last session plus seven days,
passed in per ticket rather than a global TTL. A nine-night Garba pass and a
one-night comedy set cannot share a window. A tight expiry would turn a paying
attendee away over a wrong clock at a ground; the atomic single-use claim, not
expiry, is what stops a shared screenshot.

**Legacy tokens are still accepted** and logged as such. Tickets issued before
signing existed are in people's wallets, and refusing them would strand real
attendees at a gate. Remove that branch once every pre-signing event has
completed.

## D-033 — The gate decides locally, but is never the authority

**Decision.** The scanner PWA judges scans against a cached manifest when
offline, queues them in IndexedDB, and replays them through the **identical**
`scanTicket` path an online scan uses. There is no "offline mode" branch in the
engine — `wasOffline` affects only logging and conflict recording.

**Why that shape.** A ground with 8,000 people has no usable mobile data by
8:30 PM. A scanner that stops working is a scanner that gets bypassed, and a
bypassed gate is worse than a slow one. But a device that could *decide* would
be a device that can be lied to, so every offline admit is labelled optimistic
and settled by the server's atomic claim on reconnect.

**Consequences that follow from it:**

- **The manifest opens 30 minutes before gates**, never earlier. It is a list
  of every valid token for the night — the most sensitive artefact the platform
  produces — and it ships `qrTokenId`s, never signed JWTs, so a leaked manifest
  is not a stack of forgeable tickets.
- **Replay is ordered by the device clock**, not by arrival. Two gates
  reconnect in whatever order their signal returns, but the person who
  physically walked through first must be the one recorded as admitted.
- **Cross-gate duplicates become `ScanConflict` rows.** Two offline gates
  cannot see each other — that is the risk spec F2.2 explicitly accepts. The
  loser surfaces for organizer review rather than being silently dropped.
- **`/api/scan` always returns 200**, even for a refused ticket. A non-2xx
  would make the offline queue treat a legitimate ALREADY_SCANNED as a network
  failure and retry it forever.
- **Manual entry is two steps.** The camera path has a QR proving the holder
  has the ticket; typing a number does not, so the operator confirms *who* the
  ticket belongs to before it is burned. One-step manual entry means a typo
  silently admits a stranger and marks someone else's ticket used.

## D-034 — Three audit checks were wrong, and were fixed rather than worked around

Found while building the portals. Each had been quietly passing over real code.

- **A3 matched markup inside doc comments.** A comment reading "keeps a real
  `<input>` in the DOM" was reported as an unlabelled control — on the very
  components whose job is to *be* the labelled control. Now runs against
  `stripComments`, exactly as A12 already did.
- **A13 flagged reads, not writes.** `quantitySold` in a `select:` was reported
  as an I1 violation. That trains people to work around the check, which is
  worse than not having it. It now matches only Prisma `data:` payloads — a
  write is what breaks I1, so a write is what it matches. The check also could
  not see writes through the `updateOwned*` helpers, so **the real fix was at
  the type level**: `NoInventory<>` in `scope.ts` removes those columns from
  the accepted data type, making it a compile error. A grep sees the shapes it
  was taught; a type sees them all.
- **A6 never implemented the raw-SQL branch its own comment promised.** It
  matched `db.foo.` only — so the concurrency-critical writes, which *cannot*
  go through Prisma because the fluent API has nowhere to put the guard clause,
  read as dead code. `SessionScan` and `ScanLog` were reported unwritten while
  the gate was using them. It now also matches `INSERT INTO`/`UPDATE`/`DELETE
  FROM` against each model's `@@map` name.

## D-035 — Each portal gets its own front door, and a signed-out visitor is sent to it

**Conflict:** none in the documents; a product-owner request ("keep the admin
and organizer login separate, on their own page"), plus one behaviour of D-028
that turned out to be hostile to the people it was protecting.

Everyone signed in at `/auth`. That page is written for an attendee — *"Sign in
to book"*, the terms line, the marketplace header offering festivals and
categories — so an organizer arriving to check last night's sales landed
somewhere plainly not meant for them. `/organizer/login` and `/admin/login` now
exist, each in its portal's theme, with no marketplace chrome.

**They are presentation, not a boundary.** Same credential store; a staff
account still signs in fine from `/auth`. What keeps a stranger out is
`requireOrganizer` / `requireAdmin` on every route *and* every action. Nothing
about a separate URL should ever be mistaken for the gate.

Phone + OTP only on both. No staff row has a `passwordHash` — the email path
exists so a demo reviewer can sign in without an SMS provider (D-025) — so an
email tab there would be a door that cannot open.

To sit outside their own portal's guard, each needs its own route group; the
admin routes moved into `src/app/admin/(portal)/`.

**The D-028 amendment.** That decision said `notFound()`, never
`redirect("/auth")`, because a redirect confirms a route exists and hands an
attacker a map. That reasoning is sound for an *authenticated* caller probing
for surfaces, and that case still 404s. It is wrong for a caller with **no
session at all**: an organizer whose session simply expired got a bare 404 on a
portal they use daily, with nothing to click. They are now redirected to that
portal's sign-in page — which is public, linked from the footer, and therefore
gives away nothing anybody could not already see.

## D-036 — Checkout works without an account, and cannot be used to reach one

**Conflict:** direct, with spec C1.5 — *phone verification before a first
booking*. The product owner asked for guest checkout collecting name, phone and
email. Under Part J's ordering (attendee money → organizer trust → platform
revenue) the attendee-facing argument wins: making an account the price of a
ticket is the largest single drop-off on a checkout, and everything the
platform actually needs from a buyer is collected either way. C1.5 is
**deliberately relaxed**, not overlooked, and `spec-coverage.json` records it as
such rather than silently reading as satisfied.

A guest booking still writes a `User` row. `Booking.userId` is required, and
tickets, refunds, the wallet and the gate all hang off it — so guest checkout
fills in the fields that matter and creates an *unclaimed* row, and nothing
downstream needs a guest branch.

**The trap, and the two things that close it.** `User.phone` is unique, so the
obvious "find or create by phone" hands the buyer whatever account already holds
the number they typed. That is an account takeover in one line.

1. **A claimed row is never handed out.** Claimed means someone has proven they
   hold it: `phoneVerifiedAt`, a `passwordHash`, or an organizer/admin role.
   Those are refused and sent to OTP sign-in. Only a row nobody could sign into
   by any other means is reused — and reusing it is what keeps a returning
   guest's tickets together instead of scattered across duplicates. The same
   check applies to email, which is also unique.
2. **Claiming a row revokes every session on it.** Otherwise the attack runs the
   other way: guest-book against a stranger's number today, keep the cookie,
   inherit the account the day they verify it. `claimUserSessions` is called
   from the OTP path, and only when the row was previously unverified, so an
   ordinary repeat sign-in does not log anyone out of their other devices.

A guest session lasts 7 days rather than the usual term. It was issued on an
unverified claim; it is enough to collect the tickets and come back for the
event, and it is not a standing login.

**Delivery.** Capture now calls `deliverTickets` — an in-app notification
always, then SMS to the buyer's phone and email to their address. It runs
*outside* the capture transaction and swallows its own errors: the money has
moved, and a provider outage must produce a confirmed booking with a failed
send, never a rolled-back payment. `EMAIL_DRIVER` is a new adapter whose
sandbox driver logs rather than sends, so the delivery path is real code on
every capture with nothing new to wire when a provider is added. Until then
**no screen may claim a message arrived** — the confirmation shows the ticket
itself, which is the thing that actually admits someone.

## D-037 — A `loading.tsx` above a `notFound()` turns a 404 into a 200

**Conflict:** none in the documents. A regression I introduced, found by audit
check A4 and worth writing down because the mechanism is invisible and the
instinct — "add a nice preloader everywhere" — walks straight into it.

The ticket-tear preloader shipped as a route-level `loading.tsx` on seven
segments. A `loading.tsx` is a Suspense boundary, and a Suspense boundary makes
Next **flush the response shell immediately** — which commits the HTTP status
before any code below it runs. So every `notFound()` and `redirect()` beneath
one silently became a **200 carrying a not-found body**:

| Route | Should be | Was |
|---|---|---|
| `/` | 307 to the default city | 200 |
| `/mars` (unknown city) | 404 | 200 |
| `/ahmedabad/events/does-not-exist` | 404 | 200 |
| `/booking/{someone else's}` | 404 | 200 |
| `/tickets/{invalid}` | 404 | 200 |
| organizer B on A's event | 404 | 200 |
| a sub-admin on `/admin/finance` | 404 | 200 |

Nothing looked wrong: the right screen rendered every time. But a dead event URL
answering 200 is one a search engine keeps in its index forever, and a refusal
answering 200 is one no monitor, crawler or client library can recognise.

**The rule: keep a `loading.tsx` only where nothing beneath it can 404.**

Removed from `app/`, `(marketplace)/`, `(marketplace)/[city]/`,
`organizer/(portal)/`, `tickets/` and `scan/`. Kept on `account/` and
`admin/(portal)/`, where it was measured to mask nothing — the admin permission
check lives in the *layout*, which runs above the boundary, so those refusals
still answer a real 404.

Losing a fallback is not a blank screen. On a client-side navigation Next keeps
the current page on screen until the next one is ready, which is better than a
flash of a spinner. The cost is only on a cold hard load, and only the browser's
own blank moment — worth it to keep the status line honest.

The preloader itself is unchanged and still shows on the account hub and the
admin portal, which are the slowest surfaces in the app.

**This also explains the preflight finding in D-035's commit** from the other
direction: the portals answer 200 on a refused *row* because their guard is in
the layout and the ownership check is in the page. Removing the portal
`loading.tsx` files closed that gap for the organizer portal too — those four
checks now report a real 404 rather than "not-found body, streamed 200".

## D-038 — Entry Now becomes multi-country, and I7 is superseded

**Conflict:** direct, with spec **I7** — *"Timestamps stored UTC; all business
logic evaluated in Asia/Kolkata."* Also with the implicit assumption behind
every `*Paise` column and every `₹` in the UI: that there is one currency.

The product owner is taking the platform to Canada with India retained. That is
a market decision, and the spec was written for a single-market product, so the
spec loses — but deliberately and in writing, not by drift.

**What replaces I7:** timestamps are still stored UTC. Business logic is
evaluated in **the timezone of the event's city**, which is `Asia/Kolkata` for
every event that exists today and will not be for a Toronto one. The clause is
marked `relaxed: "D-038"` in `spec-coverage.json` **in the stage that changes the
behaviour**, not now — a clause that still describes what the code does should
not be marked relaxed in advance.

**The reassuring discovery**, made while planning and worth recording because it
determines how risky this is: `src/lib/ist.ts` is already two modules wearing one
name. Roughly half its exports never touch a zone — they are pure instant math
on `getTime()`:

```ts
export function isSessionScannable(session, now, graceMinutes) {
  const t = now.getTime();
  return t >= session.startsAt.getTime() && t <= session.endsAt.getTime() + grace;
}
```

**That is the D-012 guarantee, and it has no timezone to get wrong.** Same for
`hoursUntil`, which carries D-013. So the two invariants that decide whether
someone gets through a gate and whether they get their money back are, by
construction, immune to this migration. What is exposed is calendar and display
code — real work, but a different risk class.

**The genuinely new hazard is DST.** `Asia/Kolkata` has no daylight saving, so
nothing in this codebase has ever run across an offset change. Canada has six
zones, Newfoundland is UTC−03:30, and Saskatchewan does not observe DST at all.
`istStartOfDay` round-trips a `TZDate` through `.getTime()`; that is the single
line most likely to be quietly wrong twice a year.

**Guardrails first (A14–A17).** Four audit checks were added *before* the
migration that makes them pass, so each stage has a machine-checked definition of
done rather than a judgement call. They ship at `incomplete` — A14 has 55 real
violations on day one and a red build on the first commit of a multi-week
migration is how a team learns to ignore its own harness. Each is **promoted to
`broken` by the stage that makes it green**, which is what stops the next
contributor reintroducing a rupee sign.

A16 is the one worth naming: it forbids the scan path from importing any
timezone-aware function. That converts D-012 from a comment inside `ist.ts` — a
file this migration deletes — into a build failure. It already found two live
hits: `src/app/scan/page.tsx` formats the next session time in IST, which is
correct today and wrong the moment a Toronto gate opens.

## D-039 — The demo build is `noindex` by default, and launch is one env var

**Gap, not a conflict:** the spec covers ticketing, not discovery. Nothing in it
says whether search engines may read the site, so the first version of
`robots.ts` had to decide.

**It refuses everything while `DEMO_MODE=true`.** Every event, organizer, venue,
price, rating and review in this database is invented, and all of it is
published under a real brand name that will later sell real tickets. A crawler
cannot tell demo data from inventory. Neither can someone who finds *"Rangilo Re
Garba Mahotsav 2026, from ₹499"* in a search result six months from now and
turns up at a ground nobody booked.

The asymmetry is what decides it: adding a page to an index takes days, removing
one takes weeks, and the cost of being wrong in the cautious direction is
nothing at all. So `isIndexable()` is `!isDemoMode()` — one flag already trusted
with the fixed OTP and the simulated gateway (D-025), now also gating discovery.
Turning SEO on at launch is the same switch that turns the fake OTP off, which
is the correct coupling: this site should become findable at exactly the moment
it stops being a demo.

**This does not gate link previews**, and the distinction matters because
sharing the build with reviewers is the whole point of it existing. WhatsApp,
iMessage, Slack, Discord, X and LinkedIn read Open Graph tags and never consult
`robots.txt` or `<meta name="robots">`. Share cards work in every build; only
indexing is withheld.

**Three places had to agree**, and making them agree is most of the work:

- `robots.ts` is `force-dynamic`. Next prerenders it by default, which bakes
  whatever `DEMO_MODE` was *at build time* into a static file. Being wrong here
  is expensive in both directions — a launched site silently delisted, or a demo
  quietly indexed — and the answer costs one env lookup.
- The root layout also emits `<meta name="robots">`. `robots.txt` governs
  *crawling*; a crawler that reached a URL from an inbound link has already
  fetched the page and needs to be told not to *index* it.
- `sitemap.ts` returns `[]`. A sitemap advertising 74 URLs beside a
  `Disallow: /` is two files disagreeing about one decision.

**Filtered listings are `noindex, follow` regardless.** Ten facets multiply into
more URLs than the marketplace has events, all near-duplicates. `?category=` is
the exception — "comedy in Ahmedabad" is a query someone types, and a page that
answers it. Everything else is crawled *through* to reach the event pages and
never listed itself.

## D-040 — Organizers can add their own venues, and only they can see them

**Gap.** Venues were seeded and nothing in the product ever created one. The
new-event form said so out loud — *"No venues listed in this city yet — pick
another city, or contact support to add one"* — which means an organizer
holding a night at a farmhouse, a society ground or a banquet hall that opened
last month could not list their event at all without a human in the loop. For a
marketplace whose whole promise is self-serve listing, that is a dead end at the
first step.

**The tension** is that a venue is otherwise shared catalogue. Two organizers
genuinely both use GMDC Ground, and the map, the locality filters and the
directions panel all assume a venue is a real place rather than one seller's
private record. Letting organizers write into that catalogue directly means the
first person to type "GMDC" creates a near-duplicate that appears in every other
organizer's dropdown and on the public map, with nobody responsible for it.

**So authorship lives on the row.** `Venue.createdByOrganizerId` is `NULL` for
the curated platform catalogue and set for anything an organizer added. The
picker shows *platform rows plus mine, and nobody else's* — one `OR`, and it is
the entire security model here. An admin can promote a good one later by nulling
the column, which is why the shape is authorship rather than a separate table.

Two things follow that are easy to miss:

- **The unscoped `db.venue.findMany` on both event pages became a leak.** It was
  correct while every venue was public; the moment venues have owners it puts
  one organizer's private venues in another's dropdown — revealing that they are
  running something, and letting an event point at a row someone else can edit.
  Both call sites now go through `listSelectableVenues`, and
  `tests/portal/venues.test.ts` asserts the negative case directly.
- **`venue` is deliberately absent from A12's `TENANT_MODELS`**, because it is
  not one — the platform rows belong to nobody. So the audit will *not* catch a
  missing ownership filter here the way it does for events. The mutations use
  `updateMany` with the owner in the `where` and assert `count === 1` anyway,
  which is the shape that cannot forget.

**Coordinates come from a pasted Maps link, not a form field.** Nobody knows
their venue's latitude; everybody can open it in Google Maps and hit Share. The
parser reads `!3d…!4d…` (the *place*) in preference to `@lat,lng` (the *camera*,
which can be a block away), and falls back to geocoding the address, and finally
to the city centre — the last case says so in the success message rather than
quietly dropping a pin in the middle of town.

A pasted point is checked against the city before it is accepted. This is not
range validation: a transposed pair is a perfectly valid coordinate that lands
in the Arabian Sea, so `lat/lng ∈ [-90,90]×[-180,180]` catches nothing at all.
Comparing to the city is what turns a silent wrong pin into an error message.

**Retire, never delete** (spec G2). Live events reference a venue, so retiring
sets `isActive: false` — it leaves the picker, the existing events keep it, and
it can be restored.

## D-041 — Firebase verifies the phone; it does not become the identity

**Conflict:** direct, with spec **A3.otp** — *"OTP 6 digits, 5 min validity,
max 3 sends/10min/phone, max 5 verify attempts then a 30-min lock."*

**Why the spec loses here.** Every SMS provider that delivers to an Indian
number goes through TRAI's DLT registry: register the entity, register each
template, wait days to weeks. That is a queue, not an engineering problem, and
it sits directly between a finished product and its first real login. Firebase
phone auth sends through Google's own registered senders, so it skips the
queue entirely.

Firebase owns the code length, the validity window, the resend throttle and
the lockout. None of them are configurable. So **A3.otp cannot be satisfied
while `PHONE_VERIFY_DRIVER=firebase`**, and the clause is marked
`relaxed: "D-041"` rather than quietly left failing. It is relaxed, not
deleted: the `otp` driver still implements it in full, it is still the default,
and it is what runs the moment DLT clears.

**What Firebase is, and is not, allowed to be.** It is a *phone-ownership
oracle*. It is asked one question — did this browser prove control of this
number — and its answer feeds `findOrCreateUserByPhone` exactly as a correct
OTP would. It is never the identity. There is no Firebase UID anywhere in the
schema, nothing reconciles a Firebase account against a `User` row, and
sessions, RBAC, the branded `OrganizerId` and the guest-checkout guards (D-036)
are untouched by the choice.

That distinction is the whole reason this is safe to do. Adopting Firebase Auth
*as* the identity system would mean two stores that must agree about who
someone is, which is the shape that produced the near-miss D-036 exists to
prevent.

**Three checks carry it**, and all three are in `verify()`:

- **`issuer` and `audience` must name our project.** Without them a token
  minted by any Firebase project on earth verifies against Google's keys and
  signs someone in. The signature is perfectly valid; it is simply not for us.
- **`sign_in_provider` must be `phone`.** An email or Google sign-in from the
  same project also yields a valid token, and accepting one would let anybody
  who can sign in by any means claim a number they never demonstrated.
- **`phone_number` must equal the number being claimed.** Otherwise a user
  verifies their own phone, edits the form field, and is handed someone else's
  account. `sameNumber()` has its own test for exactly this.

Plus `maxTokenAge: 10 minutes` — Firebase ID tokens live an hour, and a
sign-in is seconds old, so anything older is a replay rather than a
verification.

**Verified with `jose`, not `firebase-admin`.** The Admin SDK wants a
service-account JSON — a real secret, in a repo that is public — and it is a
heavy import on every cold start. A Firebase ID token is an ordinary RS256 JWT
signed by Google, and this project already signs its session cookie and its
ticket QR with `jose`. The entire server-side configuration is
`FIREBASE_PROJECT_ID`, which is not a secret.

**It is built as a seam because it is expected to be reversed.**
`PHONE_VERIFY_DRIVER` chooses between `otp` and `firebase`, and the sign-in
actions, the session model and the `User` table cannot tell which is running.
When DLT registration clears, MSG91 is a new `SmsAdapter` driver plus
`PHONE_VERIFY_DRIVER=otp`, and A3.otp goes back to being enforced.

**The costs, stated plainly**, because they do not disappear by being chosen:
the sign-in screens now load a client SDK and solve an invisible reCAPTCHA;
there are two verification paths to maintain and test rather than one; and the
Redis rate limits the spec names no longer govern sends on the Firebase path —
Google's abuse controls do.

## D-042 — The demo catalogue narrows to Garba, and the harness stops naming events

**Product call, not a conflict.** The seed carried a wide sample across twelve
categories — a cricket fixture, a heritage walk, a comedy night — which was the
right shape for exercising the code and the wrong shape for showing the
product. Beside four Garba nights it read as a directory rather than as a
Navratri marketplace. It is now Garba and Navratri only.

**Supplied poster artwork drives the data, not the other way round.** Four
posters were provided, branded `entrynow.in` and carrying their own venue,
date and lead price. The event rows were written *from* them: Riverfront Event
Centre at ₹249, The Grand Bhagwati Lawns at ₹349, Karnavati Club at ₹299,
YMCA Club Ground at ₹299. A poster that advertises one price against a listing
that says another is worse than no poster — so the artwork is the source and
`EventSpec.poster` overrides the category-cycling fallback.

Three venues the posters name were not in the catalogue and were added. The
posters read **2025** and the events are dated **2026**, so they are actually
upcoming; regenerating the artwork with 2026 closes the last gap.

**Eleven categories and three festivals were deactivated, not deleted**
(spec G2). An active category with no events is a tile on the home page leading
to an empty listing — the same thin-content problem the sitemap was fixed to
avoid (D-039). They stay in the catalogue and an admin turns one back on from
`/admin/cms` the day it has something in it.

**The harness stopped naming individual events**, which is the durable half of
this. `scripts/audit.ts`, `scripts/preflight.mts` and `scripts/e2e-booking.mts`
each hardcoded a demo slug, so curating the catalogue failed a route check, a
price-tampering check and the concurrency test for reasons that had nothing to
do with routing, pricing or concurrency. All three now resolve a subject at
run time — any event on the listing, any live event with a bookable tier. A
harness that breaks when the demo data changes trains people to ignore it.

**One thing a raw seed does not do:** invalidate the catalog cache.
`getCategories` and friends are wrapped in `unstable_cache` with a one-hour TTL
and a `CATALOG_TAG`, and the admin actions call `updateTag` when they write.
`npm run db:seed` writes underneath all of that, so the home page kept showing
twelve categories until the cache expired. Clear `.next/cache` after a seed, or
make the change through `/admin/cms` where the tag is updated for you.

**Rejected: third-party posters.** Images were also supplied from Pinterest.
Several were other companies' finished event posters — one named its performers
and its promoter, one carried another studio's logo, one advertised
*"Passes Available On BookMyShow"*. Putting those on this marketplace would
misrepresent whose events they are, use performers' likenesses without
permission, and in one case advertise a competitor on our own listings. They
are also incompatible with D-026, which requires artist, licence and source for
every image and attributes them at `/legal/image-credits`.

## D-043 — Indexing is its own switch, not a consequence of demo mode

**Conflict.** D-039 made the build `noindex` while `DEMO_MODE=true`, on sound
reasoning: a demo catalogue is invented data published under a real brand, and
someone who finds "Rangilo Re Garba Mahotsav 2026, from ₹499" in a search
result may turn up at a ground that was never booked. De-indexing a page is far
slower than indexing one, so the default was off and "launch" was one env var.

What that missed is that **production needs `DEMO_MODE=true` for a reason that
has nothing to do with the catalogue**: no payment gateway account exists yet,
so checkout runs on the sandbox adapter and its test-card screen. Demo mode is
therefore not a temporary state that ends at launch — it is the payment
configuration — and tying indexing to it meant the site could not be listed
without also opening the fixed OTP.

The symptom was silent and total. `robots.txt` served `Disallow: /`, every page
carried `<meta name="robots" content="noindex, nofollow, nocache">`, and
`/sitemap.xml` returned an empty `<urlset>`. Google had the URL from links and
showed it with **"No information is available for this page"**; Search Console
could not fetch the sitemap. Three separate-looking failures, one cause.

**Decision.** `SEARCH_INDEXING` decides, three-valued:

| Value | Meaning | Where |
|---|---|---|
| `on` | index, whatever demo mode says | Production |
| `off` | never index | Preview and staging deployments |
| unset | follow `DEMO_MODE` | local, and the cautious default |

The `off` value is not redundant with the unset default. A Vercel Preview
deployment inherits Production's env vars unless overridden, so without an
explicit `off` on the Preview scope every branch build would invite indexing
and compete with the real site for its own brand name.

D-039's caution survives as the unset default and as the meaning of turning it
on: `SEARCH_INDEXING=on` is a statement that the catalogue is real enough to
stand behind, not a formality. The events currently listed are real Garba
nights at real Ahmedabad venues; the bookings against them are seeded.

**Also changed, in the same pass.** The sitemap was rewritten to be
comprehensive rather than minimal — it now carries the filtered category
listings (`?category=…`, a distinct URL and the phrase people actually search),
each event's poster as an `<image:image>` node, and a `lastModified` derived
from the newest event in that city rather than `now`, because a file that
claims everything changed on every crawl teaches Google to ignore the field.
It still lists nothing empty and nothing behind a login, and it no longer lists
`/`, which 307s to a city and comes back in Search Console as "Page with
redirect — excluded".
