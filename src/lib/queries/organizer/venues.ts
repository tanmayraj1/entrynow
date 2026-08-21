import "server-only";

import { db } from "@/lib/db";
import type { OrganizerId } from "./scope";

/**
 * Venues an organizer may choose from, and the ones they own.
 *
 * A venue is not a tenant row in the way an event is — the platform curates a
 * shared catalogue that every organizer picks from. But an organizer holding a
 * night at a farmhouse nobody has listed cannot be blocked on the platform
 * adding it, so they can add their own, and those are private to them until an
 * admin promotes one (D-040).
 *
 * The visibility rule is one `OR` and it is the whole security model here:
 * **platform rows, plus mine, and nobody else's.** A venue created by another
 * organizer must never appear in this dropdown — it would leak that they are
 * running something, and it would let one organizer point an event at a
 * record another organizer can edit.
 */

/**
 * Everything this organizer may attach an event to.
 *
 * `cityId` is optional because the new-event wizard lets the city change while
 * the form is open, so it loads every city's venues once and filters on the
 * client. The ownership filter is NOT optional in either case.
 */
export async function listSelectableVenues(
  organizerId: OrganizerId,
  cityId?: string,
) {
  const rows = await db.venue.findMany({
    where: {
      ...(cityId ? { cityId } : {}),
      isActive: true,
      OR: [{ createdByOrganizerId: null }, { createdByOrganizerId: organizerId }],
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      cityId: true,
      addressLine: true,
      createdByOrganizerId: true,
      locality: { select: { name: true } },
    },
  });
  return rows.map((v) => ({
    id: v.id,
    name: v.name,
    cityId: v.cityId,
    addressLine: v.addressLine,
    localityName: v.locality?.name ?? null,
    /** Lets the UI mark which rows the organizer can edit. */
    isOwn: v.createdByOrganizerId !== null,
  }));
}

/**
 * The organizer's own venues, with the event count that decides whether one
 * can still be retired.
 */
export async function listOwnVenues(organizerId: OrganizerId) {
  const rows = await db.venue.findMany({
    where: { createdByOrganizerId: organizerId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      addressLine: true,
      pincode: true,
      lat: true,
      lng: true,
      mapUrl: true,
      isActive: true,
      city: { select: { id: true, name: true } },
      locality: { select: { id: true, name: true } },
      _count: { select: { events: true } },
    },
  });
  // Prisma `Decimal` does not cross the RSC boundary — its `toJSON` returns a
  // string and runs before any replacer, so it arrives as `"23.03"` rather
  // than a number and every arithmetic use silently concatenates (D-029).
  return rows.map((v) => ({
    ...v,
    lat: Number(v.lat),
    lng: Number(v.lng),
    eventCount: v._count.events,
  }));
}

/** One venue, only if this organizer owns it. */
export async function getOwnVenue(venueId: string, organizerId: OrganizerId) {
  const v = await db.venue.findFirst({
    where: { id: venueId, createdByOrganizerId: organizerId },
    select: {
      id: true,
      name: true,
      addressLine: true,
      pincode: true,
      lat: true,
      lng: true,
      mapUrl: true,
      isActive: true,
      cityId: true,
      localityId: true,
    },
  });
  if (!v) return null;
  return { ...v, lat: Number(v.lat), lng: Number(v.lng) };
}
