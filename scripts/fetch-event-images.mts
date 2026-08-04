/**
 * Source event hero images from Wikimedia Commons.
 *
 *   npx tsx scripts/fetch-event-images.mts
 *
 * Commons rather than a random-photo service: the images have to be ABOUT the
 * event. A stock landscape on a Garba night is worse than no photo, because it
 * tells the shopper the listing is filler. Commons is also the only keyless
 * source where the licence is machine-readable, which matters because most of
 * these are CC BY-SA — free to use, but only *with attribution*. The manifest
 * this writes is what makes that attribution possible; without it the images
 * would be unlicensed in practice (D-026).
 *
 * Re-runnable: files already on disk are skipped, so adding one category does
 * not re-download the other eleven.
 */

import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(process.cwd(), "public", "images", "events");
const MANIFEST = join(process.cwd(), "public", "images", "events", "credits.json");
const API = "https://commons.wikimedia.org/w/api.php";

/** Two or three queries per category, so events in one category differ. */
const QUERIES: Record<string, string[]> = {
  "garba-navratri": [
    "garba dance navratri gujarat",
    "dandiya raas navratri",
    "navratri celebration gujarat crowd",
  ],
  diwali: ["diwali diya lamps festival", "diwali fireworks india", "diwali lights decoration street"],
  concerts: ["concert crowd stage lights", "live music festival stage", "singer concert india"],
  "food-festivals": ["indian street food stall", "gujarati thali food", "food festival market india"],
  comedy: ["stand up comedy microphone stage", "comedy club audience"],
  theatre: ["theatre stage performance india", "drama theatre auditorium"],
  parties: ["dj console party night", "rooftop party night city", "disco ball dance floor"],
  sports: ["cricket stadium india crowd", "stadium floodlights match", "marathon runners india"],
  holi: ["holi festival colours india", "holi gulal crowd", "holi festival people colours"],
  uttarayan: ["kite festival gujarat uttarayan", "kites sky festival india"],
  exhibitions: ["art exhibition gallery visitors", "craft exhibition india handicraft"],
  workshops: ["pottery workshop hands", "art workshop class people"],
};

interface Credit {
  file: string;
  title: string;
  artist: string;
  licence: string;
  source: string;
}

const credits: Credit[] = existsSync(MANIFEST)
  ? JSON.parse(readFileSync(MANIFEST, "utf8"))
  : [];

/** Strip the HTML Commons puts in its metadata fields. */
function plain(html: string | undefined): string {
  if (!html) return "Unknown";
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

async function search(query: string) {
  const url = new URL(API);
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: "6",
    gsrlimit: "8",
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: "1600",
  }).toString();

  const res = await fetch(url, {
    headers: { "User-Agent": "EntryNow/1.0 (demo seed; contact: support@entrynow.in)" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    query?: { pages?: Record<string, {
      title: string;
      imageinfo: [{
        thumburl?: string; url: string; width: number; height: number;
        descriptionurl: string;
        extmetadata?: Record<string, { value?: string }>;
      }];
    }> };
  };
  return Object.values(data.query?.pages ?? {});
}

const FREE = /^(CC BY|CC BY-SA|CC0|Public domain|PD)/i;

async function fetchFor(slug: string, index: number, query: string) {
  const name = `${slug}-${index + 1}.jpg`;
  const path = join(OUT_DIR, name);
  if (existsSync(path)) {
    console.log(`  skip  ${name} (already downloaded)`);
    return;
  }

  const pages = await search(query);
  const usable = pages.find((p) => {
    const ii = p.imageinfo?.[0];
    if (!ii?.thumburl) return false;
    // Landscape only — a portrait photo letterboxes badly in a 16:9 hero.
    if (ii.width < ii.height * 1.2) return false;
    const licence = ii.extmetadata?.LicenseShortName?.value ?? "";
    return FREE.test(plain(licence));
  });

  if (!usable) {
    console.log(`  MISS  ${name} — no free landscape result for "${query}"`);
    return;
  }

  const ii = usable.imageinfo[0];
  // upload.wikimedia.org rate-limits scripted downloads hard. Back off and
  // retry rather than leaving gaps — a missing hero is the whole point of the
  // exercise, so failing quietly here defeats it.
  let bytes: ArrayBuffer | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const img = await fetch(ii.thumburl!, {
      headers: { "User-Agent": "EntryNow/1.0 (demo seed; support@entrynow.in)" },
    });
    if (img.ok) {
      bytes = await img.arrayBuffer();
      break;
    }
    if (img.status !== 429) {
      console.log(`  FAIL  ${name} — ${img.status}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
  }
  if (!bytes) {
    console.log(`  FAIL  ${name} — still rate-limited after 4 attempts`);
    return;
  }
  writeFileSync(path, Buffer.from(bytes));

  credits.push({
    file: `/images/events/${name}`,
    title: usable.title.replace(/^File:/, ""),
    artist: plain(ii.extmetadata?.Artist?.value),
    licence: plain(ii.extmetadata?.LicenseShortName?.value),
    source: ii.descriptionurl,
  });
  console.log(`  ok    ${name}  (${plain(ii.extmetadata?.LicenseShortName?.value)})`);
}

mkdirSync(OUT_DIR, { recursive: true });

for (const [slug, queries] of Object.entries(QUERIES)) {
  console.log(`\n${slug}`);
  for (const [i, q] of queries.entries()) {
    await fetchFor(slug, i, q);
    // Commons asks for serial, unhurried access from scripts.
    await new Promise((r) => setTimeout(r, 1_200));
  }
}

writeFileSync(MANIFEST, JSON.stringify(credits, null, 2) + "\n");
console.log(`\nWrote ${credits.length} credits to public/images/events/credits.json`);
