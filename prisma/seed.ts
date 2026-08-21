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
  await db.category.createMany({ data: categoryData });
  const categories = await db.category.findMany();
  const cat = (slug: string) => categories.find((c) => c.slug === slug)!;

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
        name: "Diwali 2026",
        tagline: "Lights, melas and mithai",
        startsAt: ist(2026, 11, 7, 17, 0),
        endsAt: ist(2026, 11, 12, 23, 59),
        gradient: "diwali",
        sortOrder: 1,
      },
      {
        slug: "uttarayan-2027",
        name: "Uttarayan 2027",
        tagline: "Kite season over the old city",
        startsAt: ist(2027, 1, 14, 6, 0),
        endsAt: ist(2027, 1, 15, 21, 0),
        gradient: "concert",
        sortOrder: 2,
      },
      {
        slug: "holi-2027",
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

  const eventSpecs: EventSpec[] = [
    {
      slug: "rangilo-re-garba-mahotsav-2026",
      title: "Rangilo Re Garba Mahotsav 2026",
      shortCode: "GRB",
      organizer: "rangmanch-events",
      category: "garba-navratri",
      festival: "navratri-2026",
      venue: "GMDC Ground",
      status: "LIVE",
      size: "BIG",
      languages: ["Gujarati", "Hindi"],
      summary:
        "Nine nights of traditional raas and garba on Ahmedabad's largest ground, with live dhol and a 40-piece orchestra.",
      nights: { from: [2026, 10, 12], count: 9, start: [19, 30], end: [25, 0] },
      tiers: [
        { name: "Season Pass", price: 3999, total: 3000, sold: 2780, tag: "Best value", desc: "All 9 nights, priority lane", seasonPass: true, perUserLimit: 4 },
        { name: "Single Night", price: 499, total: 12000, sold: 8400, desc: "Any one night, general ring" },
        { name: "Couple Entry", price: 899, total: 4000, sold: 2600, desc: "Two entries, one night" },
        { name: "VIP Ring", price: 1499, total: 800, sold: 720, tag: "Filling fast", desc: "Inner ring, seating, separate gate" },
      ],
      gates: ["Gate 1 — Season & VIP", "Gate 2 — General & female ring", "Gate 3 — Couples"],
      rating: 4.8,
      ratingCount: 1240,
      views: 48200,
    },
    {
      slug: "khelaiya-nights-2026",
      title: "Khelaiya Nights 2026",
      shortCode: "KHN",
      organizer: "shree-events",
      category: "garba-navratri",
      festival: "navratri-2026",
      venue: "Karnavati Club Lawns",
      status: "LIVE",
      size: "BIG",
      languages: ["Gujarati"],
      summary:
        "A khelaiya-first ground — strict traditional dress code, live singers, and no film music.",
      nights: { from: [2026, 10, 12], count: 9, start: [20, 0], end: [25, 30] },
      tiers: [
        { name: "Season Pass", price: 4999, total: 1500, sold: 1310, seasonPass: true, perUserLimit: 4 },
        { name: "Single Night", price: 699, total: 6000, sold: 3900 },
        { name: "Female Entry", price: 399, total: 3000, sold: 2400, desc: "Women-only ring" },
      ],
      gates: ["Gate 1 — Main", "Gate 2 — Female ring"],
      rating: 4.6,
      ratingCount: 860,
      views: 21400,
    },
    {
      slug: "bopal-raas-garba-2026",
      title: "Bopal Raas Garba 2026",
      shortCode: "BRG",
      organizer: "garba-gujarat",
      category: "garba-navratri",
      festival: "navratri-2026",
      venue: "Bopal Party Plot",
      status: "LIVE",
      size: "MEDIUM",
      languages: ["Gujarati", "Hindi"],
      summary: "Neighbourhood garba with a family ring and a food street on the perimeter.",
      nights: { from: [2026, 10, 12], count: 9, start: [19, 0], end: [24, 30] },
      tiers: [
        { name: "Season Pass", price: 2499, total: 900, sold: 610, seasonPass: true },
        { name: "Single Night", price: 349, total: 4000, sold: 1850 },
        { name: "Family Pack (4)", price: 1199, total: 800, sold: 430, desc: "Four entries, one night" },
      ],
      gates: ["Gate 1 — Main", "Gate 2 — Family"],
      rating: 4.4,
      ratingCount: 412,
      views: 9800,
    },
    {
      slug: "sharad-purnima-garba-2026",
      title: "Sharad Purnima Garba 2026",
      shortCode: "SPG",
      organizer: "amdavad-nights",
      category: "garba-navratri",
      venue: "Thaltej Open Grounds",
      status: "LIVE",
      size: "MEDIUM",
      languages: ["Gujarati"],
      summary: "One full-moon night of garba with doodh-poha served at midnight.",
      single: { date: [2026, 10, 25], start: [20, 0], end: [25, 30] },
      tiers: [
        { name: "General", price: 599, total: 2000, sold: 1420 },
        { name: "Couple", price: 999, total: 600, sold: 480 },
      ],
      gates: ["Main Gate"],
      rating: 4.2,
      ratingCount: 233,
      views: 5100,
    },
    {
      slug: "diwali-mela-riverfront-2026",
      title: "Diwali Mela — Riverfront 2026",
      shortCode: "DML",
      organizer: "rangmanch-events",
      category: "diwali",
      festival: "diwali-2026",
      venue: "Maninagar Riverfront Lawn",
      status: "LIVE",
      size: "BIG",
      languages: ["Gujarati", "Hindi", "English"],
      summary:
        "Six evenings of stalls, rangoli competitions, folk stages and a nightly lamp float on the river.",
      nights: { from: [2026, 11, 7], count: 6, start: [17, 30], end: [23, 0] },
      tiers: [
        { name: "Entry Pass", price: 199, total: 15000, sold: 6200 },
        { name: "Family Pack (4)", price: 699, total: 3000, sold: 1100 },
        { name: "Premium Lawn", price: 899, total: 900, sold: 320, desc: "Reserved lawn seating, river view" },
      ],
      gates: ["North Gate", "South Gate"],
      rating: 4.5,
      ratingCount: 318,
      views: 14300,
    },
    {
      slug: "amdavad-food-fest-2026",
      title: "Amdavad Food Fest 2026",
      shortCode: "AFF",
      organizer: "shree-events",
      category: "food-festivals",
      venue: "Prahlad Nagar Garden Amphitheatre",
      status: "LIVE",
      size: "MEDIUM",
      languages: ["Gujarati", "Hindi", "English"],
      summary:
        "Sixty stalls from Manek Chowk to Law Garden, plus a Kathiyawadi thali pavilion.",
      nights: { from: [2026, 9, 18], count: 3, start: [17, 0], end: [23, 0] },
      tiers: [
        { name: "Entry", price: 149, total: 8000, sold: 5100 },
        { name: "Entry + ₹300 food credit", price: 399, total: 3000, sold: 2300, tag: "Popular" },
      ],
      gates: ["Main Gate"],
      rating: 4.3,
      ratingCount: 190,
      views: 8700,
    },
    {
      slug: "hasya-samrat-comedy-night",
      title: "Hasya Samrat — Gujarati Comedy Night",
      shortCode: "HSC",
      organizer: "amdavad-nights",
      category: "comedy",
      venue: "Town Hall",
      status: "LIVE",
      size: "SMALL",
      languages: ["Gujarati"],
      summary: "Three Gujarati stand-ups, ninety minutes, strictly no phones.",
      single: { date: [2026, 8, 29], start: [20, 0], end: [21, 45] },
      tiers: [
        { name: "Silver", price: 399, total: 300, sold: 280 },
        { name: "Gold", price: 799, total: 120, sold: 118, tag: "Almost gone" },
      ],
      gates: ["Main Gate"],
      rating: 4.7,
      ratingCount: 96,
      views: 3200,
    },
    {
      slug: "sufi-night-satellite",
      title: "Sufi Night — Satellite",
      shortCode: "SUF",
      organizer: "swara-productions",
      category: "concerts",
      venue: "Satellite Community Hall",
      status: "IN_REVIEW",
      size: "SMALL",
      languages: ["Hindi", "Urdu"],
      summary: "An intimate qawwali evening with a seven-piece ensemble.",
      single: { date: [2026, 9, 12], start: [19, 30], end: [22, 30] },
      tiers: [
        { name: "General", price: 799, total: 250 },
        { name: "Front Row", price: 1499, total: 50 },
      ],
      rating: 0,
      ratingCount: 0,
    },
    {
      slug: "uttarayan-kite-carnival-2027",
      title: "Uttarayan Kite Carnival 2027",
      shortCode: "UKC",
      organizer: "garba-gujarat",
      category: "uttarayan",
      festival: "uttarayan-2027",
      venue: "Bopal Party Plot",
      status: "LIVE",
      size: "MEDIUM",
      languages: ["Gujarati", "Hindi"],
      summary: "Terrace-style kite flying with undhiyu, jalebi and a night-kite finale.",
      nights: { from: [2027, 1, 14], count: 2, start: [7, 0], end: [21, 0] },
      tiers: [
        { name: "Day Pass", price: 449, total: 2500, sold: 380 },
        { name: "Day Pass + Kite Kit", price: 899, total: 1200, sold: 210 },
      ],
      gates: ["Main Gate"],
      views: 2100,
    },
    {
      slug: "holi-rangotsav-2027",
      title: "Holi Rangotsav 2027",
      shortCode: "HRG",
      organizer: "rangmanch-events",
      category: "holi",
      festival: "holi-2027",
      venue: "Thaltej Open Grounds",
      status: "LIVE",
      size: "BIG",
      languages: ["Gujarati", "Hindi", "English"],
      summary: "Organic colours, rain dance, dhol and a Punjabi live set.",
      single: { date: [2027, 3, 3], start: [10, 0], end: [17, 0] },
      tiers: [
        { name: "Early Bird", price: 699, total: 4000, sold: 900, tag: "Limited" },
        { name: "General", price: 999, total: 6000, sold: 400 },
        { name: "Couple", price: 1799, total: 1500, sold: 120 },
      ],
      gates: ["Gate 1", "Gate 2"],
      views: 4400,
    },
    {
      slug: "navratri-workshop-basics",
      title: "Garba Basics — 3-Day Workshop",
      shortCode: "GBW",
      organizer: "garba-gujarat",
      category: "workshops",
      venue: "Satellite Community Hall",
      status: "LIVE",
      size: "SMALL",
      languages: ["Gujarati", "English"],
      summary: "Learn taali, be-taali and hinch before the nine nights begin.",
      nights: { from: [2026, 10, 2], count: 3, start: [18, 30], end: [20, 30] },
      tiers: [{ name: "Full Workshop", price: 1200, total: 60, sold: 44, perUserLimit: 2 }],
      gates: ["Main Gate"],
      rating: 4.9,
      ratingCount: 31,
      views: 900,
    },
    {
      slug: "monsoon-unplugged-navrangpura",
      title: "Monsoon Unplugged",
      shortCode: "MSU",
      organizer: "amdavad-nights",
      category: "concerts",
      venue: "Town Hall",
      status: "DRAFT",
      size: "SMALL",
      languages: ["Hindi", "English"],
      summary: "An acoustic indie evening — line-up to be announced.",
      single: { date: [2026, 9, 5], start: [19, 0], end: [22, 0] },
      tiers: [{ name: "General", price: 599, total: 200 }],
    },
    {
      slug: "old-city-heritage-walk",
      title: "Old City Heritage Walk",
      shortCode: "OCH",
      organizer: "utsav-collective",
      category: "workshops",
      venue: "Town Hall",
      status: "PAUSED",
      size: "SMALL",
      languages: ["Gujarati", "English"],
      summary: "A dawn walk through the pols of the walled city.",
      single: { date: [2026, 9, 20], start: [6, 30], end: [9, 0] },
      tiers: [{ name: "Walk Pass", price: 299, total: 40, sold: 12 }],
      gates: ["Meeting Point"],
    },

    // -----------------------------------------------------------------------
    // Beyond the festival calendar — theatre, sports, nightlife, exhibitions.
    // The catalogue has to be wider than Navratri or the category rail leads
    // to eight empty pages for ten months of the year.
    // -----------------------------------------------------------------------
    {
      slug: "mareez-ni-gazal-natak",
      title: "Mareez Ni Gazal — Gujarati Natak",
      shortCode: "MNG",
      organizer: "rangmanch-events",
      category: "theatre",
      venue: "Natarani Amphitheatre",
      status: "LIVE",
      size: "MEDIUM",
      languages: ["Gujarati"],
      summary:
        "A two-act play on the poet Mareez, staged in the round with live sarangi. Winner of three Gujarat Sangeet Natak Akademi awards.",
      nights: { from: [2026, 8, 21], count: 3, start: [19, 30], end: [22, 0] },
      tiers: [
        { name: "Front Stalls", price: 899, total: 120, sold: 96, tag: "Filling fast", desc: "Rows A–D, centre block" },
        { name: "Rear Stalls", price: 549, total: 240, sold: 130 },
        { name: "Student", price: 249, total: 60, sold: 44, desc: "Valid college ID required at the gate" },
      ],
      gates: ["Main Entrance", "Stalls Left"],
      rating: 4.7,
      ratingCount: 318,
      views: 9400,
    },
    {
      slug: "the-improv-project-ahmedabad",
      title: "The Improv Project — Unscripted",
      shortCode: "TIP",
      organizer: "amdavad-nights",
      category: "theatre",
      venue: "Kanoria Arts Centre",
      status: "LIVE",
      size: "SMALL",
      languages: ["English", "Hindi"],
      summary:
        "Nothing is written down. Six performers, your suggestions, ninety minutes.",
      single: { date: [2026, 8, 16], start: [20, 0], end: [21, 30] },
      tiers: [
        { name: "General", price: 399, total: 90, sold: 61 },
        { name: "Front Row", price: 649, total: 20, sold: 18, tag: "Almost gone", desc: "You will be picked on" },
      ],
      gates: ["Studio Door"],
      rating: 4.5,
      ratingCount: 142,
      views: 5200,
    },
    {
      slug: "amdavad-premier-league-final-2026",
      title: "Amdavad Premier League — Final",
      shortCode: "APL",
      organizer: "shree-events",
      category: "sports",
      venue: "Sardar Patel Stadium Complex",
      status: "LIVE",
      size: "BIG",
      languages: ["Gujarati", "Hindi", "English"],
      summary:
        "The city's T20 club final under lights, with the trophy presentation on the ground at close of play.",
      single: { date: [2026, 8, 30], start: [18, 0], end: [22, 30] },
      tiers: [
        { name: "General Stand", price: 299, total: 8000, sold: 6200 },
        { name: "Covered Stand", price: 799, total: 2500, sold: 2180, tag: "Filling fast" },
        { name: "Pavilion", price: 2499, total: 400, sold: 388, tag: "Few left", desc: "Padded seating, dedicated entry, buffet" },
      ],
      gates: ["Gate A — General", "Gate B — Covered", "Gate C — Pavilion"],
      rating: 4.4,
      ratingCount: 512,
      views: 31800,
    },
    {
      slug: "riverfront-night-run-2026",
      title: "Riverfront Night Run 2026",
      shortCode: "RNR",
      organizer: "garba-gujarat",
      category: "sports",
      venue: "Vastrapur Lake Promenade",
      status: "LIVE",
      size: "MEDIUM",
      languages: ["Gujarati", "English"],
      summary:
        "10K, 5K and a 3K family walk, flagged off after sundown. Timing chip, tee and finisher medal included.",
      single: { date: [2026, 9, 13], start: [19, 0], end: [23, 0] },
      tiers: [
        { name: "10K Timed", price: 899, total: 1200, sold: 740, desc: "Chip-timed, cut-off 90 minutes" },
        { name: "5K Timed", price: 649, total: 1500, sold: 980 },
        { name: "3K Family Walk", price: 349, total: 800, sold: 410, desc: "Under-12s free with a paying adult" },
      ],
      gates: ["Start Arch", "Bib Collection"],
      rating: 4.6,
      ratingCount: 289,
      views: 14200,
    },
    {
      slug: "terrace-sundowner-sessions",
      title: "Terrace Sundowner Sessions",
      shortCode: "TSS",
      organizer: "amdavad-nights",
      category: "parties",
      venue: "The Terrace, Prahlad Nagar",
      status: "LIVE",
      size: "MEDIUM",
      languages: ["English", "Hindi"],
      summary:
        "Open-air house and disco from 6 PM, city skyline on three sides. Strictly 21+, valid ID at the door.",
      nights: { from: [2026, 8, 15], count: 4, start: [18, 0], end: [23, 30] },
      tiers: [
        { name: "Entry", price: 799, total: 500, sold: 340, desc: "Cover redeemable against the bar" },
        { name: "Couple Entry", price: 1299, total: 250, sold: 190 },
        { name: "Cabana", price: 6999, total: 12, sold: 11, tag: "Few left", desc: "Seats six, bottle service, reserved" },
      ],
      gates: ["Lift Lobby", "Cabana Deck"],
      rating: 4.3,
      ratingCount: 176,
      views: 18600,
    },
    {
      slug: "navratri-after-party-2026",
      title: "Navratri After-Party — Dhol to Deep House",
      shortCode: "NAP",
      organizer: "rangmanch-events",
      category: "parties",
      festival: "navratri-2026",
      venue: "The Terrace, Prahlad Nagar",
      status: "LIVE",
      size: "MEDIUM",
      languages: ["Gujarati", "Hindi", "English"],
      summary:
        "When the ground closes at 1 AM, this opens. Dhol players hand over to a deep-house set until sunrise.",
      nights: { from: [2026, 10, 16], count: 3, start: [25, 30], end: [29, 0] },
      tiers: [
        { name: "After-Party Entry", price: 999, total: 600, sold: 420 },
        { name: "Garba Ticket Holder", price: 599, total: 400, sold: 300, desc: "Show any Navratri ground ticket at the door" },
      ],
      gates: ["Lift Lobby"],
      rating: 4.2,
      ratingCount: 94,
      views: 12300,
    },
    {
      slug: "amdavad-design-biennale-2026",
      title: "Amdavad Design Biennale",
      shortCode: "ADB",
      organizer: "shree-events",
      category: "exhibitions",
      venue: "Kanoria Arts Centre",
      status: "LIVE",
      size: "MEDIUM",
      languages: ["English", "Gujarati"],
      summary:
        "Forty studios, one hall: textile, type, furniture and craft from across Gujarat. Guided walk-throughs every hour.",
      nights: { from: [2026, 9, 4], count: 5, start: [11, 0], end: [20, 0] },
      tiers: [
        { name: "Day Pass", price: 249, total: 2000, sold: 860 },
        { name: "Five-Day Pass", price: 799, total: 400, sold: 210, tag: "Best value", seasonPass: true, perUserLimit: 4 },
        { name: "Guided Walk-through", price: 599, total: 150, sold: 128, tag: "Filling fast", desc: "Curator-led, 45 minutes" },
      ],
      gates: ["Hall 1", "Hall 2"],
      rating: 4.5,
      ratingCount: 203,
      views: 8800,
    },

    // -----------------------------------------------------------------------
    // Booking-engine test matrix.
    //
    // Every category needs at least one event whose TIER SHAPE is distinct,
    // because the checkout behaves differently for each: a free tier skips the
    // gateway, a single-seat tier is the concurrency test, a stadium block has
    // a dozen tiers at once, a strict per-user cap exercises C4.2a, and a
    // timed sale window exercises the on-sale guard. One garba event does not
    // test any of that.
    // -----------------------------------------------------------------------
    {
      slug: "kankaria-carnival-free-entry-2026",
      title: "Kankaria Carnival — Free Entry Day",
      shortCode: "KCF",
      organizer: "garba-gujarat",
      category: "exhibitions",
      venue: "Vastrapur Lake Promenade",
      status: "LIVE",
      size: "MEDIUM",
      languages: ["Gujarati", "Hindi"],
      summary:
        "Open day at the carnival — free entry, registration required for crowd control. Tests the wallet-only/zero-value checkout path.",
      single: { date: [2026, 8, 24], start: [16, 0], end: [22, 0] },
      tiers: [
        // Zero-price: gatewayPayable is 0, so the gateway is skipped entirely
        // (spec C4.5).
        { name: "Free Entry", price: 0, total: 2000, sold: 640, desc: "No charge — register to reserve a slot", perUserLimit: 4 },
        { name: "Fast Lane", price: 199, total: 300, sold: 210, tag: "Skip the queue" },
      ],
      gates: ["Main Gate", "Fast Lane"],
      rating: 4.1,
      ratingCount: 88,
      views: 7400,
    },
    {
      slug: "the-last-seat-comedy-special",
      title: "The Last Seat — Stand-up Special",
      shortCode: "TLS",
      organizer: "amdavad-nights",
      category: "comedy",
      venue: "Kanoria Arts Centre",
      status: "LIVE",
      size: "SMALL",
      languages: ["Hindi", "English"],
      summary:
        "A deliberately tiny room. Forty seats, one show, no encore — the venue everyone finds sold out.",
      single: { date: [2026, 8, 28], start: [20, 30], end: [22, 0] },
      tiers: [
        // Deliberately near-exhausted: two seats left is the concurrency
        // scenario a demo can actually reproduce by opening two tabs.
        { name: "General", price: 799, total: 40, sold: 38, tag: "2 left", desc: "Unreserved seating", perUserLimit: 2 },
        { name: "Front Table", price: 1499, total: 8, sold: 8, desc: "Sold out — exercises the SOLD_OUT branch" },
      ],
      gates: ["Studio Door"],
      rating: 4.9,
      ratingCount: 61,
      views: 11200,
    },
    {
      slug: "gujarat-titans-warmup-fixture-2026",
      title: "Gujarat Warm-up Fixture — Full Stadium Tiering",
      shortCode: "GWF",
      organizer: "shree-events",
      category: "sports",
      venue: "Sardar Patel Stadium Complex",
      status: "LIVE",
      size: "BIG",
      languages: ["Gujarati", "Hindi", "English"],
      summary:
        "Eight stands, eight prices, one match. The widest tier spread in the catalogue — use this to test multi-tier orders and per-tier availability.",
      single: { date: [2026, 9, 27], start: [19, 0], end: [23, 0] },
      tiers: [
        { name: "Upper North", price: 199, total: 6000, sold: 3100 },
        { name: "Upper South", price: 199, total: 6000, sold: 2400 },
        { name: "Lower East", price: 499, total: 4000, sold: 3600, tag: "Filling fast" },
        { name: "Lower West", price: 499, total: 4000, sold: 1800 },
        { name: "Club Stand", price: 1299, total: 1200, sold: 1140, tag: "Few left" },
        { name: "Corporate Box (4)", price: 9999, total: 40, sold: 34, desc: "Seats four, catered", perUserLimit: 2 },
        { name: "Media Enclosure", price: 0, total: 120, sold: 96, desc: "Accredited press only", perUserLimit: 1 },
        { name: "Accessible Seating", price: 199, total: 60, sold: 22, desc: "Step-free access, companion seat included", perUserLimit: 2 },
      ],
      gates: ["Gate 1 — North", "Gate 2 — South", "Gate 3 — Club", "Gate 4 — Boxes"],
      rating: 4.5,
      ratingCount: 744,
      views: 52000,
    },
    {
      slug: "diwali-mela-early-bird-2026",
      title: "Diwali Mela — Early Bird Windows",
      shortCode: "DEB",
      organizer: "rangmanch-events",
      category: "diwali",
      festival: "diwali-2026",
      venue: "Maninagar Riverfront Lawn",
      status: "LIVE",
      size: "MEDIUM",
      languages: ["Gujarati", "Hindi"],
      summary:
        "Three price windows that open and close on a schedule — the event to test tier sale windows and the on-sale guard.",
      nights: { from: [2026, 11, 7], count: 3, start: [17, 0], end: [23, 0] },
      tiers: [
        { name: "Early Bird", price: 299, total: 500, sold: 500, desc: "Window closed — sold out" },
        { name: "Standard", price: 449, total: 1500, sold: 620 },
        { name: "Gate Price", price: 599, total: 800, sold: 0, desc: "On sale from the day of the mela" },
        { name: "Family Pack (4)", price: 1499, total: 200, sold: 88, tag: "Best value", perUserLimit: 1 },
      ],
      gates: ["Main Gate", "Family Gate"],
      rating: 4.3,
      ratingCount: 176,
      views: 13400,
    },
    {
      slug: "holi-rangotsav-strict-cap-2027",
      title: "Holi Rangotsav — Strict Entry Cap",
      shortCode: "HSC",
      organizer: "shree-events",
      category: "holi",
      festival: "holi-2027",
      venue: "Bopal Party Plot",
      status: "LIVE",
      size: "MEDIUM",
      languages: ["Gujarati", "Hindi"],
      summary:
        "Two tickets per person, no exceptions — the event to test the per-user limit across separate bookings (spec C4.2a).",
      single: { date: [2027, 3, 3], start: [9, 0], end: [15, 0] },
      tiers: [
        { name: "Entry + Colours", price: 699, total: 900, sold: 410, perUserLimit: 2, desc: "Organic colours and rain dance included" },
        { name: "Entry + Colours + Lunch", price: 1099, total: 400, sold: 260, perUserLimit: 2 },
      ],
      gates: ["Main Gate"],
      rating: 4.4,
      ratingCount: 212,
      views: 16800,
    },
    {
      slug: "chai-aur-charcha-workshop-series",
      title: "Chai aur Charcha — Weekly Workshop Series",
      shortCode: "CAC",
      organizer: "amdavad-nights",
      category: "workshops",
      venue: "Kanoria Arts Centre",
      status: "LIVE",
      size: "SMALL",
      languages: ["Gujarati", "English"],
      summary:
        "Six Saturdays, one craft each. Season pass or single session — the event to test season-pass ticketing against per-night entry.",
      nights: { from: [2026, 8, 22], count: 6, start: [10, 0], end: [13, 0] },
      tiers: [
        { name: "Series Pass", price: 2499, total: 60, sold: 41, tag: "Best value", desc: "All six Saturdays", seasonPass: true, perUserLimit: 2 },
        { name: "Single Session", price: 549, total: 240, sold: 128, desc: "Any one Saturday" },
      ],
      gates: ["Studio Door"],
      rating: 4.7,
      ratingCount: 96,
      views: 6300,
    },
    {
      slug: "uttarayan-terrace-passes-2027",
      title: "Uttarayan Terrace Passes",
      shortCode: "UTP",
      organizer: "garba-gujarat",
      category: "uttarayan",
      festival: "uttarayan-2027",
      venue: "The Terrace, Prahlad Nagar",
      status: "LIVE",
      size: "SMALL",
      languages: ["Gujarati", "Hindi"],
      summary:
        "Rooftop kite flying with breakfast, both days. Small inventory across two dates — good for testing session-scoped tickets.",
      nights: { from: [2027, 1, 14], count: 2, start: [7, 0], end: [18, 0] },
      tiers: [
        { name: "Terrace Pass", price: 1299, total: 120, sold: 74, desc: "Includes kites, firki and breakfast" },
        { name: "Terrace Pass + Dinner", price: 1899, total: 60, sold: 51, tag: "Filling fast" },
        { name: "Child (under 12)", price: 499, total: 60, sold: 18, perUserLimit: 4 },
      ],
      gates: ["Lift Lobby"],
      rating: 4.6,
      ratingCount: 134,
      views: 9200,
    },
    {
      slug: "street-food-crawl-old-city-2026",
      title: "Old City Street Food Crawl",
      shortCode: "SFC",
      organizer: "rangmanch-events",
      category: "food-festivals",
      venue: "Town Hall",
      status: "LIVE",
      size: "SMALL",
      languages: ["Gujarati", "Hindi", "English"],
      summary:
        "Eight stops, three hours, one very full stomach. Capped at twenty per walk so it stays a walk.",
      nights: { from: [2026, 8, 19], count: 4, start: [18, 30], end: [21, 30] },
      tiers: [
        { name: "Crawl Ticket", price: 899, total: 80, sold: 62, desc: "All eight tastings included", perUserLimit: 4 },
        { name: "Crawl + Recipe Booklet", price: 1099, total: 40, sold: 31 },
      ],
      gates: ["Meeting Point"],
      rating: 4.8,
      ratingCount: 158,
      views: 10400,
    },
    {
      slug: "sufi-night-tiered-seating-2026",
      title: "Sufi Night — Tiered Seating",
      shortCode: "SNT",
      organizer: "swara-productions",
      category: "concerts",
      venue: "Natarani Amphitheatre",
      status: "LIVE",
      size: "MEDIUM",
      languages: ["Hindi", "Urdu"],
      summary:
        "Qawwali under the open sky, seated in four rings. Every ring a different price and a different gate.",
      single: { date: [2026, 9, 19], start: [20, 0], end: [23, 30] },
      tiers: [
        { name: "Ring 1 — Floor Cushions", price: 2499, total: 80, sold: 76, tag: "Few left" },
        { name: "Ring 2 — Chairs", price: 1499, total: 200, sold: 142 },
        { name: "Ring 3 — Terrace", price: 899, total: 300, sold: 118 },
        { name: "Standing", price: 499, total: 400, sold: 96 },
      ],
      gates: ["Ring 1 & 2", "Ring 3 & Standing"],
      rating: 4.7,
      ratingCount: 268,
      views: 22400,
    },
    {
      slug: "midnight-mashup-two-rooms-2026",
      title: "Midnight Mashup — Two Rooms",
      shortCode: "MMR",
      organizer: "amdavad-nights",
      category: "parties",
      venue: "The Terrace, Prahlad Nagar",
      status: "LIVE",
      size: "MEDIUM",
      languages: ["Hindi", "English", "Punjabi"],
      summary:
        "Bollywood downstairs, techno upstairs, one wristband for both. Couples and stag priced separately, as every Indian club does.",
      nights: { from: [2026, 8, 21], count: 2, start: [22, 0], end: [27, 0] },
      tiers: [
        { name: "Stag (M)", price: 1499, total: 200, sold: 172, perUserLimit: 1 },
        { name: "Stag (F)", price: 499, total: 200, sold: 88, perUserLimit: 1 },
        { name: "Couple", price: 1799, total: 150, sold: 121, tag: "Filling fast" },
        { name: "Table for 6", price: 14999, total: 10, sold: 7, desc: "Includes two bottles", perUserLimit: 1 },
      ],
      gates: ["Lift Lobby", "Table Host"],
      rating: 4.0,
      ratingCount: 143,
      views: 19800,
    },
    {
      slug: "natak-matinee-school-rate-2026",
      title: "Natak Matinee — School Rate",
      shortCode: "NMS",
      organizer: "rangmanch-events",
      category: "theatre",
      venue: "Natarani Amphitheatre",
      status: "LIVE",
      size: "SMALL",
      languages: ["Gujarati"],
      summary:
        "A weekday matinee priced for school groups, with a bulk tier that only makes sense above ten seats.",
      single: { date: [2026, 8, 26], start: [11, 0], end: [13, 0] },
      tiers: [
        { name: "Student", price: 149, total: 300, sold: 186, desc: "ID required", perUserLimit: 10 },
        { name: "Teacher / Guardian", price: 299, total: 60, sold: 24, perUserLimit: 4 },
        { name: "General", price: 499, total: 100, sold: 31 },
      ],
      gates: ["Main Entrance"],
      rating: 4.6,
      ratingCount: 74,
      views: 4100,
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
        coverImageUrl: coverImageFor(spec.category),
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
    where: { slug: "rangilo-re-garba-mahotsav-2026" },
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
        subtitle: "Nine nights, twelve grounds, one ticket",
        gradient: "navratri",
        // Exercises the image slide on the homepage carousel; the gradient
        // stays as the fallback if the file ever disappears.
        imageUrl: "/images/events/garba-navratri-1.jpg",
        // Stored relative to the city; the page prefixes the current city so a
        // banner can never navigate a Surat visitor into Ahmedabad.
        href: "festivals/navratri-2026",
        status: "LIVE",
        startsAt: ist(2026, 8, 1),
        endsAt: ist(2026, 10, 20),
        sortOrder: 0,
      },
      // --- The generic set ------------------------------------------------
      //
      // `cityId: null` on purpose, and it is doing two jobs. It regression-
      // tests the "All cities" path `getActiveBanners` used to drop on the
      // floor, and it is what stops a second city from launching with a
      // one-slide carousel: these are category promotions, true anywhere, with
      // no date window to expire. Every `href` is stored city-relative, so the
      // same row sends a Surat visitor to Surat comedy and an Ahmedabad
      // visitor to Ahmedabad comedy.
      //
      // Photographs rather than gradients: a gradient slab reads as a
      // placeholder next to a photo slide, and the carousel is judged as one
      // strip. All of these are the same Wikimedia Commons files the events
      // use, so they are already covered by /legal/image-credits.
      {
        cityId: null,
        title: "Comedy nights every weekend",
        subtitle: "Stand-up, improv and open mics from ₹199",
        gradient: "comedy",
        imageUrl: "/images/events/comedy-1.jpg",
        href: "events?category=comedy",
        status: "LIVE",
        sortOrder: 1,
      },
      {
        cityId: null,
        title: "Live music, every scale",
        subtitle: "Sufi evenings to stadium tours",
        gradient: "concert",
        imageUrl: "/images/events/concerts-1.jpg",
        href: "events?category=concerts",
        status: "LIVE",
        sortOrder: 2,
      },
      {
        cityId: null,
        title: "Eat your way through the weekend",
        subtitle: "Street food fests, pop-ups and night markets",
        gradient: "food",
        imageUrl: "/images/events/food-festivals-1.jpg",
        href: "events?category=food-festivals",
        status: "LIVE",
        sortOrder: 3,
      },
      {
        cityId: null,
        title: "Under ₹500",
        subtitle: "Big nights that don't cost a big night out",
        gradient: "party",
        imageUrl: "/images/events/parties-1.jpg",
        href: "events?maxPrice=500",
        status: "LIVE",
        sortOrder: 4,
      },
      {
        cityId: null,
        title: "Match day",
        subtitle: "League fixtures, city runs and tournaments",
        gradient: "sports",
        imageUrl: "/images/events/sports-1.jpg",
        href: "events?category=sports",
        status: "LIVE",
        sortOrder: 5,
      },
      {
        cityId: ahmedabad.id,
        title: "Diwali melas open soon",
        subtitle: "Early-bird passes from ₹199",
        gradient: "diwali",
        status: "SCHEDULED",
        startsAt: ist(2026, 10, 21),
        endsAt: ist(2026, 11, 12),
        sortOrder: 6,
      },
      {
        cityId: ahmedabad.id,
        title: "Holi Rangotsav 2027",
        subtitle: "Draft — awaiting artwork",
        gradient: "holi",
        status: "DRAFT",
        sortOrder: 7,
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
