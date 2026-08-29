import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { db } from "@/lib/db";
import { isIndexable } from "@/lib/site";

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
 * Indexing is forced ON for the duration. Left alone, `isIndexable()` returns
 * false off Vercel, the sitemap comes back empty, and every assertion below
 * passes by having nothing to check — a suite that cannot fail, which is worse
 * than no suite at all.
 */

const ORIGINAL_INDEXING = process.env.SEARCH_INDEXING;
const restoreIndexing = () => {
  if (ORIGINAL_INDEXING === undefined) delete process.env.SEARCH_INDEXING;
  else process.env.SEARCH_INDEXING = ORIGINAL_INDEXING;
};
beforeAll(() => {
  process.env.SEARCH_INDEXING = "on";
});
afterAll(restoreIndexing);

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

/**
 * The switch that silently delisted the launch.
 *
 * Indexing rode on `DEMO_MODE`, which production needs on for the test-card
 * payment screen. The result was `Disallow: /`, `noindex` on every page and an
 * empty sitemap on a site that was meant to be findable — and the only symptom
 * was a Google result reading "No information is available for this page".
 *
 * These pin the three-valued override in both directions, because getting it
 * wrong either way is expensive and neither way is visible from inside the app.
 */
describe("indexing switch", () => {
  const ORIGINAL_VERCEL_ENV = process.env.VERCEL_ENV;
  /**
   * Restore the suite fixture, NOT the process's original value.
   *
   * Restoring the original left `SEARCH_INDEXING` unset for whatever ran next,
   * `isIndexable()` went false off Vercel, and every later sitemap came back
   * empty — two coverage tests failed on an assertion about a sitemap that had
   * nothing to do with them. The failure was loud here only because those
   * tests assert on presence; a suite written the other way round would have
   * gone green on an empty list.
   */
  afterEach(() => {
    process.env.SEARCH_INDEXING = "on";
    if (ORIGINAL_VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = ORIGINAL_VERCEL_ENV;
  });

  it("indexes the production deployment with nothing configured", () => {
    delete process.env.SEARCH_INDEXING;
    process.env.DEMO_MODE = "true"; // production runs this on, permanently
    process.env.VERCEL_ENV = "production";
    expect(isIndexable()).toBe(true);
  });

  it("never indexes a preview deployment", () => {
    delete process.env.SEARCH_INDEXING;
    process.env.VERCEL_ENV = "preview";
    expect(isIndexable()).toBe(false);
  });

  it("never indexes off-Vercel, where there is no production alias", () => {
    delete process.env.SEARCH_INDEXING;
    delete process.env.VERCEL_ENV;
    expect(isIndexable()).toBe(false);
  });

  it("indexes when SEARCH_INDEXING=on, wherever it is running", () => {
    delete process.env.VERCEL_ENV;
    process.env.SEARCH_INDEXING = "on";
    expect(isIndexable()).toBe(true);
  });

  it("refuses when SEARCH_INDEXING=off, even in production", () => {
    process.env.VERCEL_ENV = "production";
    process.env.SEARCH_INDEXING = "off";
    expect(isIndexable()).toBe(false);
  });

  it("blocks everything in robots.txt when not indexable, and allows when it is", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.SEARCH_INDEXING = "off";
    expect(robots().rules).toEqual([{ userAgent: "*", disallow: "/" }]);

    process.env.SEARCH_INDEXING = "on";
    const allowed = robots();
    const rule = Array.isArray(allowed.rules) ? allowed.rules[0] : allowed.rules;
    expect(rule.allow).toBe("/");
    // The private surfaces stay out whichever way the switch is thrown.
    expect(rule.disallow).toContain("/scan");
    expect(rule.disallow).toContain("/admin");
    expect(allowed.sitemap).toMatch(/\/sitemap\.xml$/);
  });
});

/**
 * The comprehensive half. A sitemap that lists only what links already reach
 * is not worth submitting — most of a marketplace is behind a filter.
 */
describe("sitemap coverage", () => {
  it("lists a filtered listing for every category that has events", async () => {
    const entries = await sitemap();
    const pairs = await db.event.findMany({
      where: { status: "LIVE" },
      select: {
        city: { select: { slug: true } },
        category: { select: { slug: true } },
      },
      distinct: ["cityId", "categoryId"],
    });
    expect(pairs.length).toBeGreaterThan(0);

    const listed = new Set(
      entries
        .map((e) => new URL(e.url))
        .filter((u) => u.searchParams.has("category"))
        .map((u) => `${u.pathname}?category=${u.searchParams.get("category")}`),
    );
    for (const p of pairs) {
      expect(listed).toContain(
        `/${p.city.slug}/events?category=${p.category.slug}`,
      );
    }
    expect(listed.size).toBe(pairs.length);
  });

  it("never lists a category with nothing in it", async () => {
    const entries = await sitemap();
    const listed = entries
      .map((e) => new URL(e.url))
      .filter((u) => u.searchParams.has("category"))
      .map((u) => u.searchParams.get("category")!);

    const active = await db.category.count({ where: { isActive: true } });
    // The fixture is only meaningful while some active category is empty.
    expect(active).toBeGreaterThan(new Set(listed).size);

    for (const slug of new Set(listed)) {
      const live = await db.event.count({
        where: { status: "LIVE", category: { slug } },
      });
      expect(live, `${slug} is in the sitemap with no live events`).toBeGreaterThan(0);
    }
  });

  it("attaches the poster to every event that has one", async () => {
    const entries = await sitemap();
    const withCover = await db.event.count({
      where: { status: "LIVE", coverImageUrl: { not: null } },
    });
    expect(withCover).toBeGreaterThan(0);

    const eventEntries = entries.filter((e) =>
      new URL(e.url).pathname.includes("/events/"),
    );
    const withImages = eventEntries.filter((e) => (e.images?.length ?? 0) > 0);
    expect(withImages.length).toBe(withCover);
    // Relative cover paths must come out absolute, or Google drops the node.
    for (const e of withImages) {
      for (const img of e.images!) expect(img).toMatch(/^https?:\/\//);
    }
  });

  it("does not list the root, which redirects to a city", async () => {
    const entries = await sitemap();
    const roots = entries.filter((e) => new URL(e.url).pathname === "/");
    expect(roots).toEqual([]);
  });

  it("never lists a page behind a login", async () => {
    const entries = await sitemap();
    const priv = ["/account", "/tickets", "/booking", "/scan", "/admin", "/auth"];
    for (const e of entries) {
      const path = new URL(e.url).pathname;
      for (const p of priv) {
        expect(path.startsWith(p), `${path} is behind a login`).toBe(false);
      }
    }
  });
});
