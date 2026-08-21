import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { organizerScope, type OrganizerId } from "@/lib/queries/organizer/scope";
import {
  listOwnVenues,
  listSelectableVenues,
} from "@/lib/queries/organizer/venues";

/**
 * Organizer-added venues stay private to the organizer who added them.
 *
 * Venues are the one catalogue an organizer can write into (D-040), which
 * makes them the one catalogue where a missing filter leaks across tenants.
 * The failure would be quiet: another organizer's private venue simply appears
 * in your dropdown, which looks like a longer list rather than like a bug.
 *
 * `organizerScope` is called directly, which A12 forbids inside `src/`. A12
 * scans `src/`; this is `tests/`, and a test that cannot construct the branded
 * type cannot test what the brand protects.
 */

let orgA: OrganizerId;
let orgB: OrganizerId;
let cityId: string;
const created: string[] = [];

beforeAll(async () => {
  const organizers = await db.organizerProfile.findMany({
    take: 2,
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (organizers.length < 2) {
    throw new Error("Venue tests need two organizers — run `npm run db:seed`.");
  }
  orgA = organizerScope(organizers[0].id);
  orgB = organizerScope(organizers[1].id);
  const city = await db.city.findFirstOrThrow({ select: { id: true } });
  cityId = city.id;
});

afterEach(async () => {
  if (created.length) {
    await db.venue.deleteMany({ where: { id: { in: created } } });
    created.length = 0;
  }
});

async function addVenue(owner: OrganizerId | null, name: string) {
  const v = await db.venue.create({
    data: {
      name,
      addressLine: "Off Sanand Road",
      cityId,
      lat: 23.0301,
      lng: 72.5075,
      createdByOrganizerId: owner,
    },
    select: { id: true },
  });
  created.push(v.id);
  return v.id;
}

describe("organizer venues", () => {
  it("shows an organizer their own venue", async () => {
    const id = await addVenue(orgA, "A's farmhouse");
    const seen = await listSelectableVenues(orgA, cityId);
    expect(seen.some((v) => v.id === id)).toBe(true);
  });

  it("hides one organizer's venue from another", async () => {
    const id = await addVenue(orgA, "A's private lawn");
    const seen = await listSelectableVenues(orgB, cityId);
    expect(seen.some((v) => v.id === id)).toBe(false);
  });

  it("shows the platform catalogue to everyone", async () => {
    const id = await addVenue(null, "Platform ground");
    for (const org of [orgA, orgB]) {
      const seen = await listSelectableVenues(org, cityId);
      expect(seen.some((v) => v.id === id)).toBe(true);
    }
  });

  it("drops a retired venue from the picker but keeps the row", async () => {
    const id = await addVenue(orgA, "A's retired hall");
    await db.venue.updateMany({
      where: { id, createdByOrganizerId: orgA },
      data: { isActive: false },
    });

    const seen = await listSelectableVenues(orgA, cityId);
    expect(seen.some((v) => v.id === id)).toBe(false);

    // Deactivate, never delete — live events reference it (spec G2).
    expect(await db.venue.count({ where: { id } })).toBe(1);
    // It still appears on the organizer's own management page, so it can be
    // restored; a retired venue that vanished entirely would be a delete.
    const own = await listOwnVenues(orgA);
    expect(own.some((v) => v.id === id)).toBe(true);
  });

  it("refuses an ownership-scoped write from the wrong organizer", async () => {
    const id = await addVenue(orgA, "A's hall");
    // The shape every venue mutation uses: `updateMany` with the owner in the
    // filter, asserting the count. The singular `update` needs a unique
    // where-clause and has nowhere to put this.
    const { count } = await db.venue.updateMany({
      where: { id, createdByOrganizerId: orgB },
      data: { name: "hijacked" },
    });
    expect(count).toBe(0);

    const row = await db.venue.findUniqueOrThrow({
      where: { id },
      select: { name: true },
    });
    expect(row.name).toBe("A's hall");
  });

  it("returns coordinates as numbers, not Prisma Decimals", async () => {
    // `Decimal.toJSON()` returns a string and runs before any replacer, so an
    // unconverted value crosses the RSC boundary as "23.0301" and every
    // arithmetic use silently concatenates (D-029).
    await addVenue(orgA, "A's numeric check");
    const own = await listOwnVenues(orgA);
    const v = own.find((x) => x.name === "A's numeric check")!;
    expect(typeof v.lat).toBe("number");
    expect(typeof v.lng).toBe("number");
    expect(v.lat).toBeCloseTo(23.0301, 4);
  });
});
