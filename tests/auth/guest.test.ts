import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resolveGuestUser, claimUserSessions } from "@/lib/auth/guest";

/**
 * Guest checkout, tested for the thing that could actually hurt someone.
 *
 * The feature is small and the happy path is obvious. What is not obvious is
 * that "find or create a user by phone" is one line away from being an account
 * takeover: `User.phone` is unique, so a naive version hands the buyer whatever
 * account already holds the number they typed. These tests exist to make that
 * failure loud if anyone ever simplifies the check away (D-036).
 */

const created: string[] = [];

async function guest(phone: string, email: string) {
  const r = await resolveGuestUser({ name: "Test Guest", phone, email });
  if (r.ok) created.push(r.userId);
  return r;
}

afterEach(async () => {
  if (created.length) {
    await db.session.deleteMany({ where: { userId: { in: created } } });
    await db.user.deleteMany({ where: { id: { in: created } } });
    created.length = 0;
  }
});

describe("guest checkout", () => {
  it("creates an unclaimed user with the three mandatory fields", async () => {
    const phone = `9${Date.now().toString().slice(-9)}`;
    const r = await guest(phone, `g${Date.now()}@example.com`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const user = await db.user.findUniqueOrThrow({ where: { id: r.userId } });
    expect(user.name).toBe("Test Guest");
    expect(user.email).toBeTruthy();
    // The whole point: typing a number is not proof of holding it.
    expect(user.phoneVerifiedAt).toBeNull();
  });

  it("refuses a number that belongs to a verified account", async () => {
    const claimedUser = await db.user.findFirstOrThrow({
      where: { phoneVerifiedAt: { not: null }, phone: { not: null } },
    });

    const r = await resolveGuestUser({
      name: "Impostor",
      phone: claimedUser.phone!,
      email: "impostor@example.com",
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.field).toBe("phone");
    // And the account is untouched — no name overwrite on the way out.
    const after = await db.user.findUniqueOrThrow({ where: { id: claimedUser.id } });
    expect(after.name).toBe(claimedUser.name);
    expect(after.email).toBe(claimedUser.email);
  });

  it("refuses an email that belongs to someone else", async () => {
    const owner = await db.user.findFirstOrThrow({ where: { email: { not: null } } });
    const r = await resolveGuestUser({
      name: "Impostor",
      phone: `9${Date.now().toString().slice(-9)}`,
      email: owner.email!,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe("email");
  });

  it("reuses its own unclaimed row so a returning guest keeps one history", async () => {
    const phone = `9${Date.now().toString().slice(-9)}`;
    const first = await guest(phone, `a${Date.now()}@example.com`);
    const second = await guest(phone, `b${Date.now()}@example.com`);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.userId).toBe(first.userId);
  });

  it("revokes guest sessions the moment the number is claimed for real", async () => {
    const phone = `9${Date.now().toString().slice(-9)}`;
    const r = await guest(phone, `c${Date.now()}@example.com`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    await db.session.create({
      data: {
        userId: r.userId,
        tokenHash: `test-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    // Without this, guest checkout is a way to plant a session on a stranger's
    // number and inherit the account the day they verify it.
    await claimUserSessions(r.userId);

    const live = await db.session.count({
      where: { userId: r.userId, revokedAt: null },
    });
    expect(live).toBe(0);
  });

  it("rejects a malformed phone or email before touching the database", async () => {
    expect((await resolveGuestUser({ name: "A", phone: "12345", email: "a@b.co" })).ok).toBe(false);
    expect((await resolveGuestUser({ name: "A B", phone: "9876543210", email: "nope" })).ok).toBe(false);
    expect((await resolveGuestUser({ name: "", phone: "9876543210", email: "a@b.co" })).ok).toBe(false);
  });
});
