import { afterEach, describe, expect, it } from "vitest";
import {
  getPhoneVerifier,
  sameNumber,
} from "@/lib/auth/phone-verification";

/**
 * The phone-verification seam, and the two checks that carry the security of
 * the Firebase driver.
 *
 * Firebase is a phone-ownership oracle here, not an identity provider (D-041).
 * Everything that makes that safe lives in `verify()`: the token has to come
 * from *our* project, it has to have been earned by proving a *phone*, and it
 * has to name the *same* phone the caller is asking to become.
 */

const ORIGINAL = process.env.PHONE_VERIFY_DRIVER;
const ORIGINAL_PROJECT = process.env.FIREBASE_PROJECT_ID;

afterEach(() => {
  process.env.PHONE_VERIFY_DRIVER = ORIGINAL;
  process.env.FIREBASE_PROJECT_ID = ORIGINAL_PROJECT;
});

describe("driver selection", () => {
  it("defaults to server-issued OTP", () => {
    delete process.env.PHONE_VERIFY_DRIVER;
    const v = getPhoneVerifier();
    expect(v.name).toBe("otp");
    // The spec's A3 limits only hold on this path, so the default matters.
    expect(v.clientDriven).toBe(false);
  });

  it("falls back to OTP for an unknown driver rather than failing open", () => {
    process.env.PHONE_VERIFY_DRIVER = "twilio-typo";
    expect(getPhoneVerifier().name).toBe("otp");
  });

  it("selects Firebase only when named exactly", () => {
    process.env.PHONE_VERIFY_DRIVER = "firebase";
    const v = getPhoneVerifier();
    expect(v.name).toBe("firebase");
    expect(v.clientDriven).toBe(true);
  });
});

describe("sameNumber", () => {
  it("matches E.164 against the stored form", () => {
    expect(sameNumber("+919876543210", "919876543210")).toBe(true);
    expect(sameNumber("+91 98765 43210", "919876543210")).toBe(true);
  });

  it("rejects a different number", () => {
    // The attack this prevents: verify a number you own, then submit someone
    // else's in the form field and be handed their account.
    expect(sameNumber("+919876543210", "919999999999")).toBe(false);
  });

  it("rejects a missing or non-string claim", () => {
    // A token with no phone_number at all must not compare equal to anything.
    expect(sameNumber(undefined, "919876543210")).toBe(false);
    expect(sameNumber(null, "919876543210")).toBe(false);
    expect(sameNumber(12345, "919876543210")).toBe(false);
  });

  it("does not treat a suffix as a match", () => {
    expect(sameNumber("+9876543210", "919876543210")).toBe(false);
  });
});

describe("firebase driver without configuration", () => {
  it("refuses to start rather than pretending a code was sent", async () => {
    process.env.PHONE_VERIFY_DRIVER = "firebase";
    delete process.env.FIREBASE_PROJECT_ID;
    const r = await getPhoneVerifier().start("919876543210");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("UNAVAILABLE");
  });

  it("refuses to verify without a project id", async () => {
    process.env.PHONE_VERIFY_DRIVER = "firebase";
    delete process.env.FIREBASE_PROJECT_ID;
    const r = await getPhoneVerifier().verify("919876543210", "any.token.here");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("UNAVAILABLE");
  });

  it("rejects a malformed token without throwing", async () => {
    process.env.PHONE_VERIFY_DRIVER = "firebase";
    process.env.FIREBASE_PROJECT_ID = "entrynow-test";
    // Never reaches the network: jose rejects the shape before fetching keys.
    const r = await getPhoneVerifier().verify("919876543210", "not-a-jwt");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("WRONG");
  });
});
