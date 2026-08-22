import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { db } from "@/lib/db";

/**
 * The sitemap must only offer Google pages that have something on them.
 *
 * The first version enumerated the route table — every city, and every
 * festival in every city — which meant 28 of 74 URLs were blank pages for
 * cities with no events. That is thin content submitted on purpose: it spends
 * crawl budget on pages that cannot rank and drags down the ones that could.
 *
 * These run against the seeded database, where every event is in Ahmedabad,
 * so the empty cities are a real fixture rather than a contrived one.
 *
 * `DEMO_MODE` is forced off for the duration. Left alone, `isIndexable()`
 * returns false against the repo's own `.env`, the sitemap comes back empty,
 * and all four assertions pass by having nothing to check — a suite that
 * cannot fail, which is worse than no suite at all.
 */

const ORIGINAL_DEMO = process.env.DEMO_MODE;
beforeAll(() => {
  process.env.DEMO_MODE = "false";
});
afterAll(() => {
  process.env.DEMO_MODE = ORIGINAL_DEMO;
});

describe("sitemap", () => {
  it("omits cities that have no live events", async () => {
    const entries = await sitemap();
    expect(entries.length).toBeGreaterThan(0);

    const withEvents = new Set(
      (
        await db.event.findMany({
          where: { status: "LIVE" },
          select: { city: { select: { slug: true } } },
          distinct: ["cityId"],
        })
      ).map((e) => e.city.slug),
    );
    const allCities = await db.city.findMany({ select: { slug: true } });
    const empty = allCities.map((c) => c.slug).filter((s) => !withEvents.has(s));

    expect(empty.length).toBeGreaterThan(0); // the fixture is meaningful
    for (const slug of empty) {
      const leaked = entries.filter((e) =>
        new URL(e.url).pathname.startsWith(`/${slug}`),
      );
      expect(leaked, `${slug} has no live events but appears in the sitemap`).toEqual([]);
    }
  });

  it("omits festivals in cities where they are not running", async () => {
    const entries = await sitemap();
    expect(entries.length).toBeGreaterThan(0);

    const real = new Set(
      (
        await db.event.findMany({
          where: { status: "LIVE", festivalId: { not: null } },
          select: {
            city: { select: { slug: true } },
            festival: { select: { slug: true } },
          },
          distinct: ["cityId", "festivalId"],
        })
      ).map((p) => `/${p.city.slug}/festivals/${p.festival!.slug}`),
    );

    const listed = entries
      .map((e) => new URL(e.url).pathname)
      .filter((p) => p.includes("/festivals/"));

    expect(listed.length).toBe(real.size);
    for (const p of listed) expect(real.has(p)).toBe(true);
  });

  it("omits verified organizers with nothing on sale", async () => {
    const entries = await sitemap();
    expect(entries.length).toBeGreaterThan(0);

    const listed = entries
      .map((e) => new URL(e.url).pathname)
      .filter((p) => p.includes("/organizers/"));

    for (const p of listed) {
      const slug = p.split("/organizers/")[1];
      const live = await db.event.count({
        where: { organizer: { slug }, status: "LIVE" },
      });
      expect(live, `${slug} is in the sitemap with no live events`).toBeGreaterThan(0);
    }
  });

  it("lists every live event exactly once", async () => {
    const entries = await sitemap();
    expect(entries.length).toBeGreaterThan(0);

    const live = await db.event.count({ where: { status: "LIVE" } });
    const paths = entries
      .map((e) => new URL(e.url).pathname)
      .filter((p) => p.includes("/events/"));

    expect(paths.length).toBe(live);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
