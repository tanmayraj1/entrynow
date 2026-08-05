# Deploying Entry Now

**Read this first: what this deploy can and cannot do.**

Today's build takes **no real money**. `PAYMENTS_DRIVER=sandbox` means there is
no gateway wired, there is no payout run to pay organizers with, refunds land
in a non-withdrawable wallet rather than back on a card, and attendees cannot
cancel their own booking — only an admin can. That makes this a **client-review
deploy**, and it must sit behind access control. See "Before real money" at the
bottom for the list that changes that.

Target stack: **Vercel** (app) + **Neon** (Postgres) + **Upstash** (Redis).
No third host is needed yet — see "Background jobs".

---

## 1. Database — Neon

Create a project, then take **both** connection strings from the dashboard.
They are not interchangeable:

| String | Host | Used for |
|---|---|---|
| **Pooled** | `…-pooler.…neon.tech` | `DATABASE_URL` — the app |
| **Direct** | `….neon.tech` | `DIRECT_DATABASE_URL` — migrations |

`src/lib/db.ts` builds Prisma with `PrismaPg`, which owns a real `pg` pool.
Every Vercel function instance opens its own, so the app **must** use the
pooled host or you will exhaust Neon's connection limit under any real traffic.

Migrations must use the **direct** host — `prisma migrate` needs a session-level
connection that PgBouncer cannot give it.

Then, from your machine, against the direct URL:

```bash
DATABASE_URL="<direct-url>" npx prisma migrate deploy
```

Seed it — this is a demo, so the demo data is the point:

```bash
DATABASE_URL="<direct-url>" npm run db:seed
```

The seed prints every login it creates. It is **destructive**; never point it
at a database you care about.

## 2. Redis — Upstash

Create a Redis database in the same region as your Vercel deployment. Take the
`rediss://` TCP URL (not the REST one — `src/lib/redis.ts` uses `ioredis`).

Redis holds OTP codes, rate-limit counters and short-lived checkout state. If
it is unreachable the site still serves, but phone sign-in stops working.

## 3. Vercel

Import the GitHub repo. Framework auto-detects as Next.js. Leave the build
command alone — `postinstall` runs `prisma generate`, which is why the
generated client is not in git.

### Environment variables

| Key | Value |
|---|---|
| `DATABASE_URL` | Neon **pooled** URL |
| `DIRECT_DATABASE_URL` | Neon **direct** URL |
| `REDIS_URL` | Upstash `rediss://…` |
| `SESSION_JWT_SECRET` | **generate a new one** — see below |
| `QR_JWT_SECRET` | **generate a new one** |
| `NEXT_PUBLIC_APP_URL` | `https://<your-domain>` |
| `NEXT_PUBLIC_DEFAULT_CITY` | `ahmedabad` |
| `NEXT_PUBLIC_MAP_TILE_URL` | see "Map tiles" |
| `NEXT_PUBLIC_MAP_ATTRIBUTION` | whatever that provider's licence requires |
| `DEMO_MODE` | `true` |
| `DEMO_MODE_ALLOW_PRODUCTION` | `true` — **only after step 4** |
| `RUN_WORKERS` | `false` |
| `SITE_PASSWORD` | a strong shared password — gates `/admin` |

Everything else in `.env.example` keeps its default.

**Generate the two secrets. Do not reuse the values in `.env.example` —
they are public in this repository:**

```bash
node -e "const c=require('crypto');console.log('SESSION_JWT_SECRET='+c.randomBytes(32).toString('hex'));console.log('QR_JWT_SECRET='+c.randomBytes(32).toString('hex'))"
```

Rotate `QR_JWT_SECRET` **before** any ticket is issued. Rotating it invalidates
every outstanding QR — that property is deliberate (D-032), but you only want
to exercise it once, on an empty database.

`RUN_WORKERS=false` is correct on Vercel. Serverless instances cannot host
BullMQ workers, and without the flag every cold start would open a Redis
connection for a worker that dies with the invocation. Expired holds are still
reclaimed by the sweep at the top of every `createBooking` (D-022).

## 4. Access control — the admin portal only

`DEMO_MODE=true` means the OTP is a fixed `123456` for every seeded number,
including `9000000001`, the **super admin**. Anyone with the URL can sign in
as anyone.

For an attendee or an organizer that is harmless — the data is seeded. For the
platform admin it is not: that role cancels events irreversibly, suspends
organizers and rewrites commission rates. So `src/middleware.ts` gates
**`/admin` and nothing else**, via HTTP Basic against `SITE_PASSWORD`. The
marketplace, booking, organizer portal and scanner stay open, because gating
those taxed the whole demo to protect a fraction of it.

`SITE_PASSWORD` is therefore **required** whenever
`DEMO_MODE_ALLOW_PRODUCTION=true` — the server refuses to boot on that
combination without it. The flag was once taken at its word and was wrong
(Vercel's free "Standard Protection" does not cover the production
`*.vercel.app` alias), so the acknowledgement now has to be backed by the
thing that enforces it.

Share the URL freely; share the password only with whoever needs the admin
portal.

## 5. Verify the deploy

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<domain>/ahmedabad   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://<domain>/admin       # 404 signed out
curl -sI https://<domain>/ | grep -i strict-transport                 # header present
```

`/admin` and `/organizer/dashboard` returning **404** signed out is correct,
not a bug — the portals never confirm a route exists to someone who cannot use
it.

Then sign in and click through all four surfaces. Credentials are printed by
`npm run db:seed`; the defaults are in `CLAUDE.md`.

---

## Background jobs

Nothing extra is needed today. Only `hold-release` exists and it has a
synchronous fallback, so a deployment with no worker is a supported
configuration.

That changes when the payout run and the reminder jobs land (Iteration 8).
At that point pick one:

- **Vercel Cron** hitting protected API routes. Enough for everything
  cron-shaped — the 02:00 IST payout run, T-24h/T-2h reminders, digests. No
  new host.
- **A background worker** (Render, Railway, Fly) running the same image with
  `RUN_WORKERS=true`. Worth it only for BullMQ's retry and backoff semantics,
  which matter for refund-retry and payout-retry, where giving up silently
  costs someone money.

## Map tiles

`NEXT_PUBLIC_MAP_TILE_URL` defaults to OpenStreetMap's public endpoint, which
is rate-limited and **not licensed for production traffic**. Point it at a paid
provider or your own proxy before launch, and update the attribution string to
whatever that provider requires. The attribution is a licence condition, not
decoration — the same is true of `/legal/image-credits` for the event
photography.

## Before real money

Everything above ships a demo. Taking a rupee needs all of:

1. **A real payments driver** — `PAYMENTS_DRIVER=razorpay` plus the three
   `RAZORPAY_*` keys, and the webhook endpoint registered at the gateway.
2. **The payout run** — approve and mark-paid exist and sweep the ledger
   correctly, but nothing creates the batches, so money would come in with no
   path out to organizers.
3. **Source-mode refunds** — refunds currently credit a non-withdrawable
   wallet. Refunding a card payment that way is not acceptable; this needs a
   gateway refund adapter.
4. **User-initiated cancellation** — `refundBooking` has exactly one caller,
   in the admin actions. Attendees cannot cancel their own booking.
5. **`DEMO_MODE=false`**, with a real SMS driver so OTP is not a fixed code.
6. **`STORAGE_DRIVER`** — until it exists, organizers cannot upload a cover
   image or KYC documents.

Items 2 and 4 are the next two iterations in the plan.

## Region — why `vercel.json` pins `bom1`

Production TTFB was **1.5–4.4s** while the same pages served locally in
**80–220ms**. The code was not the problem; the map was:

```
Ahmedabad user → Mumbai edge (bom1) → function in Washington DC (iad1)
                                    → database in Singapore (ap-southeast-1)
```

`x-vercel-id: bom1::iad1::…` shows it on every response — the request entered
Vercel's network in Mumbai and then executed half a world away. Vercel's default
function region is `iad1`, and Neon is in `ap-southeast-1`, so **every single
query crossed the Pacific and came back**. DC↔Singapore is roughly a 220ms round
trip; the city home page issues eight queries plus the shell's own, so even
fully parallelised that is seconds of pure distance.

`"regions": ["bom1"]` puts the function in Mumbai: ~60ms to the database instead
of ~220ms, and next to the people using it for the response leg.

**If you move the database, move this too.** The rule is that the function
belongs beside the *database*, not beside the user — a page makes many DB round
trips and exactly one response trip, so latency to Postgres is what multiplies.
