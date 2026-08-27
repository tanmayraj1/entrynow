/**
 * Seed data.
 *
 * Content follows the design handoff's rules: Indian communal events, real
 * Ahmedabad localities, plausible Gujarati titles, prices in ₹.
 *
 * Run with `npm run db:seed`. Destructive — it truncates and rebuilds.
 */

import "dotenv/config";
import { hashPassword } from "../src/lib/auth/password";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  type EventStatus,
  type OrganizerStatus,
} from "../src/generated/prisma/client";
import { DEFAULT_BUSINESS_CONFIG } from "../src/lib/config";
import { toPaise } from "../src/lib/money";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** IST is UTC+5:30; the seed states wall-clock IST and converts to UTC. */
function ist(y: number, m: number, d: number, hh = 0, mm = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - 5.5 * 3600 * 1000);
}

async function truncateAll() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  if (list) {
    await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }
}


/**
 * Hero image for an event, from the Commons set fetched by
 * `scripts/fetch-event-images.mts`.
 *
 * Cycled per category so two Garba nights do not show the same photo, and
 * `null` when a category has no image on disk — the event card's navy poster
 * plate is a deliberate fallback, not a broken state.
 */
const IMAGE_COUNTS: Record<string, number> = (() => {
  const dir = join(process.cwd(), "public", "images", "events");
  if (!existsSync(dir)) return {};
  const counts: Record<string, number> = {};
  for (const f of readdirSync(dir)) {
    const m = /^(.+)-(\d+)\.jpg$/.exec(f);
    if (m) counts[m[1]] = Math.max(counts[m[1]] ?? 0, Number(m[2]));
  }
  return counts;
})();

const categoryUse: Record<string, number> = {};
function coverImageFor(categorySlug: string): string | null {
  const count = IMAGE_COUNTS[categorySlug];
  if (!count) return null;
  const n = (categoryUse[categorySlug] = (categoryUse[categorySlug] ?? 0) + 1);
  return `/images/events/${categorySlug}-${((n - 1) % count) + 1}.jpg`;
}

async function main() {
  console.log("Clearing…");
  await truncateAll();

  // -------------------------------------------------------------------------
  // Config (spec A3) — persisted so admins can edit without a deploy
  // -------------------------------------------------------------------------
  console.log("Config…");
  await db.configSetting.createMany({
    data: Object.entries(DEFAULT_BUSINESS_CONFIG).map(([key, value]) => ({
      key,
      value: value as never,
      description: `Spec A3 default for ${key}`,
    })),
  });

  // -------------------------------------------------------------------------
  // Cities & localities
  // -------------------------------------------------------------------------
  console.log("Cities…");
  const ahmedabad = await db.city.create({
    data: {
      slug: "ahmedabad",
      name: "Ahmedabad",
      state: "Gujarat",
      lat: 23.0225,
      lng: 72.5714,
      sortOrder: 0,
    },
  });
  await db.city.createMany({
    data: [
      { slug: "surat", name: "Surat", state: "Gujarat", lat: 21.1702, lng: 72.8311, sortOrder: 1 },
      { slug: "vadodara", name: "Vadodara", state: "Gujarat", lat: 22.3072, lng: 73.1812, sortOrder: 2 },
      { slug: "rajkot", name: "Rajkot", state: "Gujarat", lat: 22.3039, lng: 70.8022, sortOrder: 3 },
      { slug: "mumbai", name: "Mumbai", state: "Maharashtra", lat: 19.076, lng: 72.8777, sortOrder: 4 },
    ],
  });

  const localityData = [
    { slug: "vastrapur", name: "Vastrapur", lat: 23.0395, lng: 72.5289 },
    { slug: "bopal", name: "Bopal", lat: 23.0333, lng: 72.4667 },
    { slug: "thaltej", name: "Thaltej", lat: 23.0469, lng: 72.5083 },
    { slug: "sg-highway", name: "SG Highway", lat: 23.0301, lng: 72.5075 },
    { slug: "navrangpura", name: "Navrangpura", lat: 23.0365, lng: 72.5611 },
    { slug: "maninagar", name: "Maninagar", lat: 22.9962, lng: 72.6003 },
    { slug: "satellite", name: "Satellite", lat: 23.0293, lng: 72.5119 },
    { slug: "prahlad-nagar", name: "Prahlad Nagar", lat: 23.0121, lng: 72.5079 },
  ];
  await db.locality.createMany({
    data: localityData.map((l) => ({ ...l, cityId: ahmedabad.id })),
  });
  const localities = await db.locality.findMany({ where: { cityId: ahmedabad.id } });
  const loc = (slug: string) => localities.find((l) => l.slug === slug)!;

  // -------------------------------------------------------------------------
  // Categories & festivals
  // -------------------------------------------------------------------------
  console.log("Categories & festivals…");
  const categoryData = [
    { slug: "garba-navratri", name: "Garba & Navratri", gradient: "navratri", sortOrder: 0 },
    { slug: "diwali", name: "Diwali & melas", gradient: "diwali", sortOrder: 1 },
    { slug: "concerts", name: "Concerts", gradient: "concert", sortOrder: 2 },
    { slug: "food-festivals", name: "Food festivals", gradient: "food", sortOrder: 3 },
    { slug: "comedy", name: "Comedy", gradient: "comedy", sortOrder: 4 },
    { slug: "theatre", name: "Theatre", gradient: "theatre", sortOrder: 5 },
    { slug: "parties", name: "Parties & nightlife", gradient: "party", sortOrder: 6 },
    { slug: "sports", name: "Sports", gradient: "sports", sortOrder: 7 },
    { slug: "holi", name: "Holi", gradient: "holi", sortOrder: 8 },
    { slug: "uttarayan", name: "Uttarayan", gradient: "uttarayan", sortOrder: 9 },
    { slug: "exhibitions", name: "Exhibitions", gradient: "exhibition", sortOrder: 10 },
    { slug: "workshops", name: "Workshops", gradient: "workshop", sortOrder: 11 },
  ];
  // All twelve are active, including the eleven with nothing in them yet.
  //
  // An earlier pass deactivated everything but Garba on the grounds that a
  // tile leading to an empty listing is thin content. That reasoning is right
  // for the *sitemap*, which is a submission to a crawler, and wrong for the
  // *category rail*, which is how a visitor — and an organizer filling in the
  // event wizard — learns what this marketplace is for. A one-category rail
  // reads as a Garba-only site, not as a marketplace whose first season is
  // Garba. Empty categories stay visible and their listings say so.
  //
  // Deactivation stays available: `toggleCatalogActive` in the admin CMS is
  // the way a category is retired, and rows deactivate rather than delete
  // (spec G2). Nothing here should switch one off on its own.
  await db.category.createMany({ data: categoryData });
  const categories = await db.category.findMany();
  const cat = (slug: string) => categories.find((c) => c.slug === slug)!;

  // Navratri is the only one with events; the rest stay in the catalogue,
  // inactive, ready to be switched on.
  await db.festival.createMany({
    data: [
      {
        slug: "navratri-2026",
        name: "Navratri 2026",
        tagline: "Nine nights of garba in Ahmedabad",
        description:
          "Ahmedabad's biggest nine nights. Traditional raas, live dhol, and grounds that hold thousands.",
        startsAt: ist(2026, 10, 12, 18, 0),
        endsAt: ist(2026, 10, 20, 23, 59),
        gradient: "navratri",
        sortOrder: 0,
      },
      {
        slug: "diwali-2026",
        isActive: false,
        name: "Diwali 2026",
        tagline: "Lights, melas and mithai",
        startsAt: ist(2026, 11, 7, 17, 0),
        endsAt: ist(2026, 11, 12, 23, 59),
        gradient: "diwali",
        sortOrder: 1,
      },
      {
        slug: "uttarayan-2027",
        isActive: false,
        name: "Uttarayan 2027",
        tagline: "Kite season over the old city",
        startsAt: ist(2027, 1, 14, 6, 0),
        endsAt: ist(2027, 1, 15, 21, 0),
        gradient: "concert",
        sortOrder: 2,
      },
      {
        slug: "holi-2027",
        isActive: false,
        name: "Holi 2027",
        tagline: "Colour, water and dhol",
        startsAt: ist(2027, 3, 3, 9, 0),
        endsAt: ist(2027, 3, 4, 22, 0),
        gradient: "holi",
        sortOrder: 3,
      },
    ],
  });
  const festivals = await db.festival.findMany();
  const fest = (slug: string) => festivals.find((f) => f.slug === slug)!;

  // -------------------------------------------------------------------------
  // Venues
  // -------------------------------------------------------------------------
  console.log("Venues…");
  const venueData = [
    { name: "GMDC Ground", locality: "vastrapur", addressLine: "GMDC Ground, University Road, Vastrapur", lat: 23.0378, lng: 72.5432 },
    { name: "Karnavati Club Lawns", locality: "sg-highway", addressLine: "Karnavati Club, SG Highway", lat: 23.0261, lng: 72.5069 },
    { name: "Bopal Party Plot", locality: "bopal", addressLine: "Ambli-Bopal Road, Bopal", lat: 23.0341, lng: 72.4702 },
    { name: "Thaltej Open Grounds", locality: "thaltej", addressLine: "Thaltej Cross Road, Thaltej", lat: 23.0471, lng: 72.5061 },
    { name: "Town Hall", locality: "navrangpura", addressLine: "Town Hall, Ashram Road, Navrangpura", lat: 23.0339, lng: 72.5652 },
    { name: "Maninagar Riverfront Lawn", locality: "maninagar", addressLine: "Riverfront East, Maninagar", lat: 22.9981, lng: 72.6011 },
    { name: "Prahlad Nagar Garden Amphitheatre", locality: "prahlad-nagar", addressLine: "Prahlad Nagar Garden", lat: 23.0129, lng: 72.5081 },
    { name: "Satellite Community Hall", locality: "satellite", addressLine: "Jodhpur Cross Road, Satellite", lat: 23.0281, lng: 72.5142 },
    // Added with the theatre / sports / nightlife / exhibition categories, so
    // every category on the rail leads somewhere real.
    { name: "Natarani Amphitheatre", locality: "navrangpura", addressLine: "Natarani, Usmanpura Riverfront", lat: 23.0459, lng: 72.5665 },
    { name: "Sardar Patel Stadium Complex", locality: "maninagar", addressLine: "Motera Road Sports Complex", lat: 23.0919, lng: 72.5972 },
    { name: "The Terrace, Prahlad Nagar", locality: "prahlad-nagar", addressLine: "Corporate Road, Prahlad Nagar", lat: 23.0102, lng: 72.5062 },
    { name: "Kanoria Arts Centre", locality: "navrangpura", addressLine: "Kanoria Centre for Arts, Navrangpura", lat: 23.0378, lng: 72.5501 },
    { name: "Vastrapur Lake Promenade", locality: "vastrapur", addressLine: "Vastrapur Lake, Vastrapur", lat: 23.0369, lng: 72.5273 },
    // Named on the supplied Garba posters, so the listing and the artwork
    // agree about where the event actually is.
    { name: "YMCA Club Ground", locality: "sg-highway", addressLine: "YMCA Club, S.G. Road", lat: 23.0284, lng: 72.5074 },
    { name: "The Grand Bhagwati Lawns", locality: "bopal", addressLine: "The Grand Bhagwati, Bodakdev", lat: 23.0405, lng: 72.5089 },
    { name: "Riverfront Event Centre", locality: "navrangpura", addressLine: "Sabarmati Riverfront West, Ahmedabad", lat: 23.0402, lng: 72.5762 },
  ];
  for (const v of venueData) {
    await db.venue.create({
      data: {
        name: v.name,
        cityId: ahmedabad.id,
        localityId: loc(v.locality).id,
        addressLine: v.addressLine,
        pincode: "380015",
        lat: v.lat,
        lng: v.lng,
        directions: {
          car: "Parking available on-site; arrive before 7 PM on weekends.",
          metro: "Nearest metro: Gyanjivan Vidyalaya, 1.2 km.",
          bus: "BRTS corridor stop within 600 m.",
          auto: "Autos queue at the main gate until 1 AM.",
        },
      },
    });
  }
  const venues = await db.venue.findMany();
  const venue = (name: string) => venues.find((v) => v.name === name)!;

  // -------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------
  console.log("Users…");
  const superAdmin = await db.user.create({
    data: {
      phone: "919000000001",
      phoneVerifiedAt: new Date(),
      email: "admin@entrynow.in",
      name: "Platform Admin",
      cityId: ahmedabad.id,
      adminRole: { create: { permissions: ["SUPER"] } },
    },
  });
  await db.user.create({
    data: {
      phone: "919000000002",
      phoneVerifiedAt: new Date(),
      email: "approvals@entrynow.in",
      name: "Approvals Desk",
      cityId: ahmedabad.id,
      adminRole: { create: { permissions: ["APPROVALS", "CONTENT"] } },
    },
  });
  await db.user.create({
    data: {
      phone: "919000000003",
      phoneVerifiedAt: new Date(),
      email: "finance@entrynow.in",
      name: "Finance Desk",
      cityId: ahmedabad.id,
      adminRole: { create: { permissions: ["FINANCE", "SUPPORT"] } },
    },
  });

  // Every shopper gets BOTH sign-in methods in the demo build, so a reviewer
  // can use whichever is convenient: phone + the fixed OTP, or email +
  // `demo1234`. The password is seeded through the same scrypt helper the
  // login uses — a seed that writes a plaintext or differently-hashed value
  // produces accounts that cannot actually sign in (D-025).
  const DEMO_PASSWORD = "demo1234";
  const demoHash = await hashPassword(DEMO_PASSWORD);

  const shoppers = await Promise.all(
    [
      { phone: "919812345001", email: "meera@demo.entrynow.in", name: "Meera Patel", wallet: toPaise(250) },
      { phone: "919812345002", email: "anand@demo.entrynow.in", name: "Anand Shah", wallet: 0 },
      { phone: "919812345003", email: "krishna@demo.entrynow.in", name: "Krishna Desai", wallet: toPaise(100) },
      { phone: "919812345004", email: "nidhi@demo.entrynow.in", name: "Nidhi Trivedi", wallet: 0 },
    ].map((u) =>
      db.user.create({
        data: {
          phone: u.phone,
          phoneVerifiedAt: new Date(),
          email: u.email,
          passwordHash: demoHash,
          name: u.name,
          cityId: ahmedabad.id,
          walletBalancePaise: u.wallet,
          locale: "en",
        },
      }),
    ),
  );

  // -------------------------------------------------------------------------
  // Organizers — a spread of B5 states so the admin queues have real content
  // -------------------------------------------------------------------------
  console.log("Organizers…");
  const organizerSpecs: {
    slug: string;
    name: string;
    phone: string;
    status: OrganizerStatus;
    plan?: "BASIC" | "PRO";
    verified: boolean;
    rating: number;
    ratingCount: number;
    followers: number;
    commissionOverride?: number;
  }[] = [
    { slug: "rangmanch-events", name: "Rangmanch Events", phone: "919900000001", status: "VERIFIED", plan: "PRO", verified: true, rating: 4.8, ratingCount: 1240, followers: 48200, commissionOverride: 6 },
    { slug: "shree-events", name: "Shree Events", phone: "919900000002", status: "VERIFIED", plan: "PRO", verified: true, rating: 4.6, ratingCount: 860, followers: 21400, commissionOverride: 6 },
    { slug: "garba-gujarat", name: "Garba Gujarat", phone: "919900000003", status: "VERIFIED", plan: "BASIC", verified: true, rating: 4.4, ratingCount: 412, followers: 9800 },
    { slug: "amdavad-nights", name: "Amdavad Nights", phone: "919900000004", status: "VERIFIED", plan: "BASIC", verified: true, rating: 4.2, ratingCount: 233, followers: 5100 },
    { slug: "swara-productions", name: "Swara Productions", phone: "919900000005", status: "KYC_IN_REVIEW", verified: false, rating: 0, ratingCount: 0, followers: 320 },
    { slug: "utsav-collective", name: "Utsav Collective", phone: "919900000006", status: "SUSPENDED", plan: "BASIC", verified: true, rating: 3.4, ratingCount: 88, followers: 1400 },
  ];

  const organizers: Record<string, { id: string; commissionPct: number }> = {};
  for (const o of organizerSpecs) {
    const user = await db.user.create({
      data: {
        phone: o.phone,
        phoneVerifiedAt: new Date(),
        email: `${o.slug}@example.in`,
        name: o.name,
        cityId: ahmedabad.id,
      },
    });
    const profile = await db.organizerProfile.create({
      data: {
        userId: user.id,
        slug: o.slug,
        name: o.name,
        status: o.status,
        verified: o.verified,
        cityId: ahmedabad.id,
        bio: `${o.name} has been producing communal events across Ahmedabad since 2018.`,
        legalName: `${o.name} Pvt Ltd`,
        businessType: "Private Limited",
        addressLine: "Ahmedabad, Gujarat",
        pincode: "380015",
        contactPhone: o.phone,
        contactEmail: `${o.slug}@example.in`,
        panNumber: "ABCDE1234F",
        gstNumber: o.plan === "PRO" ? "24ABCDE1234F1Z5" : null,
        bankAccountName: `${o.name} Pvt Ltd`,
        bankIfsc: "HDFC0001234",
        bankAccountNumber: "50100xxxxxx",
        bankVerifiedAt: o.status === "VERIFIED" ? new Date() : null,
        kycSubmittedAt: new Date(),
        kycReviewedAt: o.status === "VERIFIED" ? new Date() : null,
        plan: o.plan ?? null,
        onboardingFeePaidAt: o.plan ? new Date() : null,
        planExpiresAt: o.plan ? ist(2027, 3, 31) : null,
        // Pro assignment writes the 6% override — this is how the design's
        // "Pro 6% / Basic 8%" promise is delivered (D-007).
        commissionPctOverride: o.commissionOverride ?? null,
        ratingAvg: o.rating,
        ratingCount: o.ratingCount,
        followerCount: o.followers,
        suspendedAt: o.status === "SUSPENDED" ? new Date() : null,
        suspendedReason:
          o.status === "SUSPENDED" ? "Repeated unresolved attendee disputes" : null,
      },
    });
    organizers[o.slug] = {
      id: profile.id,
      commissionPct:
        o.commissionOverride ?? DEFAULT_BUSINESS_CONFIG.platformCommissionPct,
    };
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------
  console.log("Events…");

  type TierSpec = {
    name: string;
    price: number;
    total: number;
    sold?: number;
    tag?: string;
    desc?: string;
    seasonPass?: boolean;
    perUserLimit?: number;
  };
  type EventSpec = {
    slug: string;
    title: string;
    shortCode: string;
    /** Supplied artwork under /images/posters. Overrides `coverImageFor`. */
    poster?: string;
    organizer: string;
    category: string;
    festival?: string;
    venue: string;
    status: EventStatus;
    size: "SMALL" | "MEDIUM" | "BIG";
    languages: string[];
    summary: string;
    nights?: { from: [number, number, number]; count: number; start: [number, number]; end: [number, number] };
    single?: { date: [number, number, number]; start: [number, number]; end: [number, number] };
    tiers: TierSpec[];
    gates?: string[];
    rating?: number;
    ratingCount?: number;
    views?: number;
  };

  /**
   * Garba and Navratri only, for now.
   *
   * The catalogue was a wide sample across twelve categories, which was the
   * right shape for exercising the code and the wrong shape for showing the
   * product: a cricket fixture and a heritage walk beside four Garba nights
   * reads as a directory rather than as a Navratri marketplace.
   *
   * The first four carry supplied artwork, and their title, venue, dates and
   * lead price are transcribed FROM that artwork — a poster that advertises
   * "TICKETS STARTING FROM Rs 349 at The Grand Bhagwati Lawns" against a
   * listing that says something else is worse than no poster at all.
   *
   * The posters read 2025; these are dated 2026 so the events are actually
   * upcoming. Regenerate the artwork with 2026 to close the gap.
   */
  const eventSpecs: EventSpec[] = [
    {
      slug: "navratri-utsav-garba-mahotsav-2026",
      title: "Navratri Utsav — Garba Mahotsav",
      shortCode: "NVU",
      poster: "/images/posters/navratri-utsav.jpg",
      organizer: "rangmanch-events",
      category: "garba-navratri",
      festival: "navratri-2026",
      venue: "Riverfront Event Centre",
      status: "LIVE",
      size: "BIG",
      languages: ["Gujarati", "Hindi"],
      summary:
        "Four nights of garba on the riverfront with a live orchestra, a kids' zone and a full food street.",
      nights: { from: [2026, 10, 9], count: 4, start: [19, 0], end: [25, 0] },
      tiers: [
        { name: "Season Pass", price: 799, total: 2500, sold: 2180, tag: "Best value", desc: "All four nights, priority lane", seasonPass: true, perUserLimit: 4 },
        { name: "Single Night", price: 249, total: 9000, sold: 6100, desc: "Any one night, general ring" },
        { name: "Couple Entry", price: 449, total: 3000, sold: 1900, desc: "Two entries, one night" },
        { name: "VIP Ring", price: 999, total: 600, sold: 540, tag: "Filling fast", desc: "Inner ring, seating, separate gate" },
      ],
      gates: ["Gate 1 — Season & VIP", "Gate 2 — General", "Gate 3 — Couples"],
      rating: 4.8,
      ratingCount: 1240,
      views: 48200,
    },
    {
      slug: "dandiya-dhamaka-garba-night-2026",
      title: "Dandiya Dhamaka — Garba Night",
      shortCode: "DDH",
      poster: "/images/posters/dandiya-dhamaka.jpg",
      organizer: "amdavad-nights",
      category: "garba-navratri",
      festival: "navratri-2026",
      venue: "The Grand Bhagwati Lawns",
      status: "LIVE",
      size: "MEDIUM",
      languages: ["Gujarati", "Hindi"],
      summary:
        "One big night at Bodakdev with DJ Hari and MC Ketan, dandiya through to closing, food and games.",
      single: { date: [2026, 10, 10], start: [19, 0], end: [25, 30] },
      tiers: [
        { name: "Early Bird", price: 349, total: 1200, sold: 1150, tag: "Few left", desc: "Limited release" },
        { name: "General", price: 499, total: 2500, sold: 1400, desc: "Full access to the ground" },
        { name: "Couple Entry", price: 899, total: 900, sold: 520, desc: "Two entries" },
        { name: "VIP Lounge", price: 1499, total: 200, sold: 160, tag: "Filling fast", desc: "Raised deck, seating, own bar" },
      ],
      gates: ["Main Gate", "VIP Gate"],
      rating: 4.6,
      ratingCount: 612,
      views: 21400,
    },
    {
      slug: "garba-under-the-stars-2026",
      title: "Garba Under The Stars",
      shortCode: "GUS",
      poster: "/images/posters/garba-under-the-stars.jpg",
      organizer: "garba-gujarat",
      category: "garba-navratri",
      festival: "navratri-2026",
      venue: "Karnavati Club Lawns",
      status: "LIVE",
      size: "MEDIUM",
      languages: ["Gujarati"],
      summary:
        "Open-air garba on the Karnavati lawns with a live band, dandiya and food stalls until late.",
      single: { date: [2026, 10, 11], start: [18, 30], end: [24, 30] },
      tiers: [
        { name: "General", price: 299, total: 2000, sold: 1240, desc: "Full access to the lawns" },
        { name: "Couple Entry", price: 549, total: 800, sold: 430, desc: "Two entries" },
        { name: "Front Circle", price: 899, total: 300, sold: 240, tag: "Filling fast", desc: "Nearest the band, seating" },
      ],
      gates: ["Lawn Gate", "Members Gate"],
      rating: 4.5,
      ratingCount: 388,
      views: 15600,
    },
    {
      slug: "raas-rang-garba-night-2026",
      title: "Raas Rang — Garba Night",
      shortCode: "RRG",
      poster: "/images/posters/raas-rang-garba-night.jpg",
      organizer: "shree-events",
      category: "garba-navratri",
      festival: "navratri-2026",
      venue: "YMCA Club Ground",
      status: "LIVE",
      size: "MEDIUM",
      languages: ["Gujarati", "Hindi"],
      summary:
        "Tradition, rhythm, togetherness — a full night of raas on S.G. Road with a live DJ, rain dance and food court.",
      single: { date: [2026, 10, 12], start: [18, 0], end: [24, 30] },
      tiers: [
        { name: "General", price: 299, total: 2200, sold: 980, desc: "Full access to the ground" },
        { name: "Couple Entry", price: 549, total: 900, sold: 360, desc: "Two entries" },
        { name: "Rain Dance Zone", price: 699, total: 500, sold: 310, desc: "Separate arena, changing rooms" },
        { name: "VIP Ring", price: 1199, total: 250, sold: 190, tag: "Filling fast", desc: "Inner ring, seating" },
      ],
      gates: ["Gate A — General", "Gate B — VIP & Couples"],
      rating: 4.4,
      ratingCount: 233,
      views: 9800,
    },
    {
      // No supplied artwork, so this one falls back to the licensed Wikimedia
      // photography and keeps a second organizer visible in the listings.
      slug: "sharad-purnima-garba-2026",
      title: "Sharad Purnima Garba 2026",
      shortCode: "SPG",
      organizer: "garba-gujarat",
      category: "garba-navratri",
      festival: "navratri-2026",
      venue: "Thaltej Open Grounds",
      status: "LIVE",
      size: "SMALL",
      languages: ["Gujarati"],
      summary:
        "The full-moon night that closes the season — traditional raas, no DJ, dinner included.",
      single: { date: [2026, 10, 25], start: [20, 0], end: [26, 0] },
      tiers: [
        { name: "Entry + Dinner", price: 649, total: 700, sold: 410, desc: "Includes the community dinner" },
        { name: "Entry Only", price: 349, total: 900, sold: 500, desc: "Garba access" },
      ],
      gates: ["Main Gate"],
      rating: 4.7,
      ratingCount: 156,
      views: 6400,
    },
    {
      // One draft, so the organizer portal has something in every status.
      slug: "khelaiya-nights-2027",
      title: "Khelaiya Nights 2027",
      shortCode: "KHN",
      organizer: "rangmanch-events",
      category: "garba-navratri",
      venue: "Bopal Party Plot",
      status: "DRAFT",
      size: "MEDIUM",
      languages: ["Gujarati"],
      summary: "Next season's headline night. Not yet announced.",
      single: { date: [2027, 10, 2], start: [19, 30], end: [25, 0] },
      tiers: [
        { name: "General", price: 399, total: 1500, sold: 0, desc: "Full access" },
      ],
    },
  ];

  for (const spec of eventSpecs) {
    const org = organizers[spec.organizer];
    const isLive = spec.status === "LIVE";

    const event = await db.event.create({
      data: {
        slug: spec.slug,
        title: spec.title,
        shortCode: spec.shortCode,
        status: spec.status,
        organizerId: org.id,
        categoryId: cat(spec.category).id,
        festivalId: spec.festival ? fest(spec.festival).id : null,
        cityId: ahmedabad.id,
        venueId: venue(spec.venue).id,
        summary: spec.summary,
        coverImageUrl: spec.poster ?? coverImageFor(spec.category),
        description: `${spec.summary}\n\nGates open 45 minutes before start. Entry is by QR only — please carry a screenshot in case of poor network at the venue.`,
        size: spec.size,
        languages: spec.languages,
        refundPolicy: "FLEXIBLE_72H",
        transfersAllowed: true,
        partialCancellationAllowed: spec.size !== "BIG",
        ratingAvg: spec.rating ?? 0,
        ratingCount: spec.ratingCount ?? 0,
        viewCount: spec.views ?? 0,
        submittedAt: spec.status === "DRAFT" ? null : new Date(),
        approvedAt: isLive || spec.status === "PAUSED" ? new Date() : null,
        publishedAt: isLive ? new Date() : null,
        pausedAt: spec.status === "PAUSED" ? new Date() : null,
        faqs: {
          create: [
            { question: "Is there parking?", answer: "Yes, on-site parking is free but fills up by 8 PM on weekends.", sortOrder: 0 },
            { question: "Can I re-enter?", answer: "No. Each QR admits once; re-entry needs a wristband from the help desk.", sortOrder: 1 },
            { question: "Is outside food allowed?", answer: "No outside food or drink. Stalls operate until close.", sortOrder: 2 },
          ],
        },
        schedule: {
          create: [
            { timeLabel: "6:30 – 7:30 PM", what: "Gates open, seating and check-in", sortOrder: 0 },
            { timeLabel: "7:30 – 8:00 PM", what: "Aarti", sortOrder: 1 },
            { timeLabel: "8:00 – 11:00 PM", what: "Main performance", sortOrder: 2 },
            { timeLabel: "11:00 PM – close", what: "Open floor", sortOrder: 3 },
          ],
        },
      },
    });

    // Sessions
    if (spec.nights) {
      const [y, m, d] = spec.nights.from;
      for (let i = 0; i < spec.nights.count; i++) {
        const startHour = spec.nights.start[0];
        const endHour = spec.nights.end[0];
        // An end hour >= 24 means the session runs past midnight (spec I8).
        const startsAt = ist(y, m, d + i, startHour, spec.nights.start[1]);
        const endsAt = ist(y, m, d + i + (endHour >= 24 ? 1 : 0), endHour % 24, spec.nights.end[1]);
        await db.eventSession.create({
          data: {
            eventId: event.id,
            sequence: i + 1,
            name: `Night ${i + 1}`,
            startsAt,
            endsAt,
            gatesOpenAt: new Date(startsAt.getTime() - 45 * 60_000),
          },
        });
      }
    } else if (spec.single) {
      const [y, m, d] = spec.single.date;
      const startsAt = ist(y, m, d, spec.single.start[0], spec.single.start[1]);
      const endHour = spec.single.end[0];
      const endsAt = ist(y, m, d + (endHour >= 24 ? 1 : 0), endHour % 24, spec.single.end[1]);
      await db.eventSession.create({
        data: {
          eventId: event.id,
          sequence: 1,
          startsAt,
          endsAt,
          gatesOpenAt: new Date(startsAt.getTime() - 45 * 60_000),
        },
      });
    }

    // Tiers
    for (const [i, t] of spec.tiers.entries()) {
      await db.ticketTier.create({
        data: {
          eventId: event.id,
          name: t.name,
          description: t.desc,
          tag: t.tag,
          pricePaise: toPaise(t.price),
          quantityTotal: t.total,
          quantitySold: t.sold ?? 0,
          quantityHeld: 0,
          perUserLimit: t.perUserLimit ?? 10,
          isSeasonPass: t.seasonPass ?? false,
          saleEndsAt: null,
          sortOrder: i,
        },
      });
    }

    // Gates
    for (const [i, g] of (spec.gates ?? []).entries()) {
      await db.gate.create({
        data: { eventId: event.id, name: g, code: `G${i + 1}` },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Promos — RAAS26 survives from the design as seed data (D-007)
  // -------------------------------------------------------------------------
  console.log("Promos…");
  const garba = await db.event.findUniqueOrThrow({
    where: { slug: "navratri-utsav-garba-mahotsav-2026" },
  });
  await db.promo.createMany({
    data: [
      {
        code: "RAAS26",
        description: "₹250 off Navratri bookings over ₹999",
        discountFlatPaise: toPaise(250),
        minAmountPaise: toPaise(999),
        usageLimit: 5000,
        perUserLimit: 1,
        startsAt: ist(2026, 8, 1),
        endsAt: ist(2026, 10, 20, 23, 59),
      },
      {
        code: "FIRSTUTSAV",
        description: "₹50 off your first booking",
        discountFlatPaise: toPaise(50),
        minAmountPaise: toPaise(199),
        usageLimit: 20000,
        perUserLimit: 1,
      },
      {
        code: "GARBA10",
        description: "10% off, max ₹300 — Rangilo Re only",
        discountPct: 10,
        maxDiscountPaise: toPaise(300),
        minAmountPaise: toPaise(499),
        eventId: garba.id,
        usageLimit: 1000,
        perUserLimit: 2,
      },
      {
        code: "EXPIRED25",
        description: "Lapsed code, kept to exercise the expiry path",
        discountFlatPaise: toPaise(100),
        startsAt: ist(2025, 10, 1),
        endsAt: ist(2025, 10, 20),
        isActive: false,
      },
    ],
  });

  // -------------------------------------------------------------------------
  // Homepage CMS
  // -------------------------------------------------------------------------
  console.log("CMS…");
  await db.banner.createMany({
    data: [
      {
        cityId: ahmedabad.id,
        title: "Navratri 2026 is live",
        subtitle: "Nine nights, four grounds, one ticket",
        gradient: "navratri",
        imageUrl: "/images/banners/dandiya.jpg",
        // Stored relative to the city; the page prefixes the current city so a
        // banner can never navigate a Surat visitor into Ahmedabad.
        href: "festivals/navratri-2026",
        status: "LIVE",
        startsAt: ist(2026, 8, 1),
        endsAt: ist(2026, 10, 30),
        sortOrder: 0,
      },
      {
        cityId: null,
        title: "Garba, every night of the season",
        subtitle: "Raas, dandiya and live orchestras from ₹249",
        gradient: "navratri",
        imageUrl: "/images/banners/garba-night.jpg",
        href: "events?category=garba-navratri",
        status: "LIVE",
        sortOrder: 1,
      },
    ],
  });

  const liveEvents = await db.event.findMany({
    where: { status: "LIVE" },
    orderBy: { viewCount: "desc" },
    take: 6,
  });
  await db.featuredSlot.createMany({
    data: liveEvents.map((e, i) => ({
      cityId: ahmedabad.id,
      eventId: e.id,
      position: i,
      pinned: i === 0,
    })),
  });

  // -------------------------------------------------------------------------
  // Engagement
  // -------------------------------------------------------------------------
  console.log("Engagement…");
  await db.follow.createMany({
    data: shoppers.slice(0, 3).map((u) => ({
      userId: u.id,
      organizerId: organizers["rangmanch-events"].id,
    })),
  });
  await db.wishlistItem.createMany({
    data: [
      { userId: shoppers[0].id, eventId: liveEvents[1]?.id ?? garba.id },
      { userId: shoppers[0].id, eventId: liveEvents[2]?.id ?? garba.id },
      { userId: shoppers[1].id, eventId: garba.id },
    ],
  });

  const counts = {
    cities: await db.city.count(),
    localities: await db.locality.count(),
    categories: await db.category.count(),
    festivals: await db.festival.count(),
    venues: await db.venue.count(),
    organizers: await db.organizerProfile.count(),
    events: await db.event.count(),
    liveEvents: await db.event.count({ where: { status: "LIVE" } }),
    sessions: await db.eventSession.count(),
    tiers: await db.ticketTier.count(),
    gates: await db.gate.count(),
    promos: await db.promo.count(),
    users: await db.user.count(),
    config: await db.configSetting.count(),
  };
  console.log("\nSeeded:");
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(12)} ${v}`);
  }
  console.log(
    [
      "",
      "Demo sign-in — either method works:",
      `  Phone  ${shoppers[0].phone}   OTP ${process.env.SANDBOX_OTP_CODE ?? "123456"}  (any seeded number works)`,
      `  Email  ${shoppers[0].email}   password ${DEMO_PASSWORD}`,
      `  Admin  ${superAdmin.phone}   OTP ${process.env.SANDBOX_OTP_CODE ?? "123456"}`,
      "",
      "Demo payment — test cards are listed on the payment screen:",
      "  4111 1111 1111 1111  succeeds     4000 0000 0000 0002  declines",
      "  success@upi          succeeds     failure@upi          declines",
    ].join("\n"),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
