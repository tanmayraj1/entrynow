import { describe, expect, it } from "vitest";
import {
  distanceKm,
  isNearCity,
  parseLatLng,
  MAX_VENUE_DISTANCE_KM,
} from "@/lib/venue-location";

const AHMEDABAD = { lat: 23.0225, lng: 72.5714 };

describe("parseLatLng", () => {
  it("reads a bare decimal pair", () => {
    expect(parseLatLng("23.0225, 72.5714")).toEqual(AHMEDABAD);
    expect(parseLatLng("23.0225,72.5714")).toEqual(AHMEDABAD);
  });

  it("reads the camera position from a Maps URL", () => {
    expect(parseLatLng("https://www.google.com/maps/@23.0225,72.5714,17z")).toEqual(
      AHMEDABAD,
    );
  });

  it("prefers the place's own coordinates over the camera", () => {
    // A real share URL carries both. `!3d!4d` is the place; `@` is wherever
    // the map happened to be pointing, which can be a block away.
    const url =
      "https://www.google.com/maps/place/GMDC+Ground/@23.0350,72.5500,17z/data=!3m1!4b1!4m6!3d23.0225!4d72.5714";
    expect(parseLatLng(url)).toEqual(AHMEDABAD);
  });

  it("reads an explicit q= point", () => {
    expect(parseLatLng("https://maps.google.com/?q=23.0225,72.5714")).toEqual(
      AHMEDABAD,
    );
  });

  it("rejects text that merely contains numbers", () => {
    expect(parseLatLng("Plot 23, Sector 72, Gandhinagar")).toBeNull();
    expect(parseLatLng("")).toBeNull();
    expect(parseLatLng("not a location")).toBeNull();
  });

  it("rejects out-of-range coordinates", () => {
    expect(parseLatLng("523.0, 72.5")).toBeNull();
    expect(parseLatLng("23.0, 372.5")).toBeNull();
  });
});

describe("isNearCity", () => {
  it("accepts a point in the city", () => {
    expect(isNearCity({ lat: 23.03, lng: 72.51 }, AHMEDABAD)).toBe(true);
  });

  it("rejects a transposed pair", () => {
    // The whole reason this guard exists: lat/lng the wrong way round is a
    // perfectly valid coordinate that lands in the Arabian Sea, so range
    // checking alone would let it through and put the pin in the water.
    expect(isNearCity({ lat: 72.5714, lng: 23.0225 }, AHMEDABAD)).toBe(false);
  });

  it("rejects another city", () => {
    const mumbai = { lat: 19.076, lng: 72.8777 };
    expect(isNearCity(mumbai, AHMEDABAD)).toBe(false);
    expect(distanceKm(mumbai, AHMEDABAD)).toBeGreaterThan(MAX_VENUE_DISTANCE_KM);
  });

  it("accepts an outskirts venue", () => {
    // Gandhinagar — a different city, but a real Ahmedabad-area venue location.
    expect(isNearCity({ lat: 23.2156, lng: 72.6369 }, AHMEDABAD)).toBe(true);
  });
});
