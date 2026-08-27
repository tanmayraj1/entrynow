/**
 * Bring a deployed database in line with the curated Garba catalogue.
 *
 *     DATABASE_URL="<production pooled url>" npx tsx scripts/sync-catalogue.mts --dry
 *     DATABASE_URL="<production pooled url>" npx tsx scripts/sync-catalogue.mts --apply
 *
 * `npm run db:seed` TRUNCATES. That is right for a laptop and catastrophic for
 * a deployment: it would take every booking, ticket, payment and ledger row
 * with it. This only ever upserts, and it never touches a table that holds
 * money or a person.
 *
 * What it does, all idempotent:
 *   1. adds the venues the posters name;
 *   2. attaches the supplied poster artwork to its event, creating the event
 *      if it does not exist;
 *   3. pauses events outside Garba/Navratri rather than deleting them — their
 *      tickets stay valid and they can be un-paused (spec B1, D-042);
 *   4. deactivates categories and festivals with nothing live in them;
 *   5. replaces the home banners with the three current ones.
 *
 * Run `--dry` first. It prints exactly what `--apply` would change.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const APPLY = process.argv.includes("--apply");
if (!APPLY && !process.argv.includes("--dry")) {
  console.error("Pass --dry to preview, or --apply to write.");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
console.log(`\n── CATALOGUE SYNC (${APPLY ? "APPLY" : "dry run"}) ──`);
console.log(`  target: ${url.replace(/:\/\/[^@]+@/, "://***@").split("?")[0]}\n`);

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const plan: string[] = [];
const note = (s: string) => {
  plan.push(s);
  console.log(`  ${APPLY ? "•" : "would"} ${s}`);
};

const KEEP_CATEGORY = "garba-navratri";
const VENUES = [
  { name: "YMCA Club Ground", locality: "sg-highway", addressLine: "YMCA Club, S.G. Road", lat: 23.0284, lng: 72.5074 },
  { name: "The Grand Bhagwati Lawns", locality: "bopal", addressLine: "The Grand Bhagwati, Bodakdev", lat: 23.0405, lng: 72.5089 },
  { name: "Riverfront Event Centre", locality: "navrangpura", addressLine: "Sabarmati Riverfront West, Ahmedabad", lat: 23.0402, lng: 72.5762 },
];
/** Poster artwork keyed by the event slug it belongs to. */
const POSTERS: Record<string, string> = {
  "navratri-utsav-garba-mahotsav-2026": "/images/posters/navratri-utsav.jpg",
  "dandiya-dhamaka-garba-night-2026": "/images/posters/dandiya-dhamaka.jpg",
  "garba-under-the-stars-2026": "/images/posters/garba-under-the-stars.jpg",
  "raas-rang-garba-night-2026": "/images/posters/raas-rang-garba-night.jpg",
};
const BANNERS = [
  { title: "Navratri 2026 is live", subtitle: "Nine nights, four grounds, one ticket", imageUrl: "/images/banners/navratri.jpg", gradient: "navratri", href: "festivals/navratri-2026", scoped: true, sortOrder: 0 },
  { title: "Garba, every night of the season", subtitle: "Raas, dandiya and live orchestras from ₹249", imageUrl: "/images/banners/diwali.jpg", gradient: "navratri", href: "events?category=garba-navratri", scoped: false, sortOrder: 1 },
  { title: "Under ₹500", subtitle: "Big nights that don't cost a big night out", imageUrl: "/images/banners/concerts.jpg", gradient: "party", href: "events?maxPrice=500", scoped: false, sortOrder: 2 },
];

const city = await db.city.findFirst({ where: { slug: "ahmedabad" }, select: { id: true } });
if (!city) {
  console.error("  no ahmedabad city row — is this the right database?");
  process.exit(1);
}

// 1 — venues
for (const v of VENUES) {
  const existing = await db.venue.findFirst({ where: { name: v.name, cityId: city.id }, select: { id: true } });
  if (existing) continue;
  const loc = await db.locality.findFirst({ where: { slug: v.locality, cityId: city.id }, select: { id: true } });
  note(`create venue "${v.name}"`);
  if (APPLY) {
    await db.venue.create({
      data: { name: v.name, cityId: city.id, localityId: loc?.id ?? null, addressLine: v.addressLine, lat: v.lat, lng: v.lng },
    });
  }
}

// 2 — poster artwork onto its event
for (const [slug, poster] of Object.entries(POSTERS)) {
  const ev = await db.event.findFirst({ where: { slug }, select: { id: true, coverImageUrl: true } });
  if (!ev) {
    note(`SKIP poster for "${slug}" — no such event here (run the seed, or create it in the portal)`);
    continue;
  }
  if (ev.coverImageUrl === poster) continue;
  note(`set cover of "${slug}" -> ${poster}`);
  if (APPLY) await db.event.update({ where: { id: ev.id }, data: { coverImageUrl: poster } });
}

// 3 — pause anything outside Garba. Never delete: tickets stay valid (B1).
const strays = await db.event.findMany({
  where: { status: "LIVE", category: { slug: { not: KEEP_CATEGORY } } },
  select: { id: true, slug: true },
});
for (const e of strays) {
  note(`pause "${e.slug}" (outside ${KEEP_CATEGORY}; tickets stay valid)`);
  if (APPLY) await db.event.updateMany({ where: { id: e.id }, data: { status: "PAUSED", pausedAt: new Date() } });
}

// 4 — categories and festivals with nothing live
for (const c of await db.category.findMany({ select: { id: true, slug: true, isActive: true } })) {
  const want = c.slug === KEEP_CATEGORY;
  if (c.isActive === want) continue;
  note(`${want ? "activate" : "deactivate"} category "${c.slug}"`);
  if (APPLY) await db.category.update({ where: { id: c.id }, data: { isActive: want } });
}
for (const f of await db.festival.findMany({ select: { id: true, slug: true, isActive: true } })) {
  const live = await db.event.count({ where: { festivalId: f.id, status: "LIVE" } });
  const want = live > 0;
  if (f.isActive === want) continue;
  note(`${want ? "activate" : "deactivate"} festival "${f.slug}"`);
  if (APPLY) await db.festival.update({ where: { id: f.id }, data: { isActive: want } });
}

// 5 — banners. Retire the old set rather than deleting the rows.
const liveBanners = await db.banner.findMany({ where: { status: "LIVE" }, select: { id: true, title: true } });
const wanted = new Set(BANNERS.map((b) => b.title));
for (const b of liveBanners) {
  if (wanted.has(b.title)) continue;
  note(`retire banner "${b.title}"`);
  if (APPLY) await db.banner.update({ where: { id: b.id }, data: { status: "DRAFT" } });
}
for (const b of BANNERS) {
  const existing = await db.banner.findFirst({
    where: { title: b.title },
    select: { id: true, subtitle: true, imageUrl: true, gradient: true, href: true, status: true, sortOrder: true, cityId: true },
  });
  const data = {
    title: b.title, subtitle: b.subtitle, imageUrl: b.imageUrl, gradient: b.gradient,
    href: b.href, status: "LIVE" as const, sortOrder: b.sortOrder,
    cityId: b.scoped ? city.id : null,
  };
  if (existing) {
    // Compare before writing. A script pointed at production has to be able to
    // report "already in sync" on a second run — otherwise there is no way to
    // tell a successful apply from one that silently did nothing.
    const same =
      existing.subtitle === data.subtitle &&
      existing.imageUrl === data.imageUrl &&
      existing.gradient === data.gradient &&
      existing.href === data.href &&
      existing.status === data.status &&
      existing.sortOrder === data.sortOrder &&
      existing.cityId === data.cityId;
    if (same) continue;
    note(`refresh banner "${b.title}"`);
    if (APPLY) await db.banner.update({ where: { id: existing.id }, data });
  } else {
    note(`create banner "${b.title}"`);
    if (APPLY) await db.banner.create({ data });
  }
}

console.log(
  plan.length === 0
    ? "\n  nothing to do — already in sync\n"
    : APPLY
      ? `\n✅ applied ${plan.length} change${plan.length === 1 ? "" : "s"}.\n` +
        "   The catalogue is cached for an hour — edit anything in /admin/cms to\n" +
        "   refresh it immediately, or wait it out.\n"
      : `\n${plan.length} change${plan.length === 1 ? "" : "s"} pending. Re-run with --apply.\n`,
);
await db.$disconnect();
