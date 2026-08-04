import "server-only";

import { notFound, redirect } from "next/navigation";
import type { AdminPermission, OrganizerStatus, PlanTier } from "@/generated/prisma";
import { db } from "@/lib/db";
import { organizerScope, type OrganizerId } from "@/lib/queries/organizer/scope";
import { getSessionUser } from "./session";

/**
 * Access control for the two portals (spec G3, A1.4, A1.5).
 *
 * Three rules this file exists to enforce, all of which have burned real
 * products:
 *
 * 1. **A signed-in caller who lacks the role gets `notFound()`, never a
 *    redirect.** A redirect confirms the route exists and that the caller
 *    merely lacks access, which is a free map of the admin surface for anyone
 *    probing. A 404 says nothing.
 *
 *    A caller with **no session at all** is the one exception, and it costs
 *    nothing: they are sent to that portal's own sign-in page, which is public
 *    and linked from the footer, so the redirect reveals only what anybody
 *    could already see. Without it a staff member whose session simply expired
 *    gets a bare 404 on a portal they use every day, with no way back in
 *    (D-035). The enumeration argument still holds for the case it was written
 *    about — an authenticated attacker probing for surfaces — and that case
 *    still 404s.
 *
 * 2. **Call it in the server ACTION too, not just the page.** A page-level
 *    check protects the render; it does nothing about a crafted POST straight
 *    to the action endpoint. Every mutation re-derives identity here.
 *
 * 3. **Identity comes from the session, never from the request.** Nothing in
 *    this file accepts an organizer id or a role from a URL, body or form
 *    field — that is the whole tenant-isolation guarantee, and
 *    `scripts/audit.ts` check A12 fails the build if a query forgets it.
 */

export interface OrganizerContext {
  userId: string;
  /**
   * Branded, and minted only here from the session. The scoped query layer in
   * `src/lib/queries/organizer/` accepts nothing else, so an id that arrived
   * in a URL or a form field cannot reach a database call.
   */
  organizerId: OrganizerId;
  status: OrganizerStatus;
  plan: PlanTier | null;
  commissionPctOverride: number | null;
  /** SUSPENDED organizers keep read access; every mutation must check this. */
  readOnly: boolean;
}

/**
 * The signed-in organizer, or a 404.
 *
 * By default only a VERIFIED profile may enter the portal — an organizer still
 * in KYC has nothing to manage yet and is sent to the public onboarding page.
 * `allowUnverified` opens it for the settings/onboarding routes, which are
 * exactly where an unverified organizer needs to be.
 *
 * SUSPENDED is deliberately NOT rejected: spec B5 says a suspended organizer
 * keeps a read-only login, so they can still see their events and money while
 * an investigation runs. `readOnly` carries that to the caller.
 */
export async function requireOrganizer(
  opts: { allowUnverified?: boolean } = {},
): Promise<OrganizerContext> {
  const user = await getSessionUser();
  if (!user) redirect("/organizer/login");
  if (!user.organizer) notFound();

  const { status } = user.organizer;
  const usable =
    status === "VERIFIED" ||
    status === "SUSPENDED" ||
    Boolean(opts.allowUnverified);
  if (!usable) notFound();

  // The session carries id and status only; the portal also needs the plan and
  // the commission override, and those change rarely enough that a small
  // second read is better than bloating every session lookup with them.
  const profile = await db.organizerProfile.findUnique({
    where: { id: user.organizer.id },
    select: { plan: true, commissionPctOverride: true },
  });

  return {
    userId: user.id,
    organizerId: organizerScope(user.organizer.id),
    status,
    plan: profile?.plan ?? null,
    commissionPctOverride: profile?.commissionPctOverride
      ? Number(profile.commissionPctOverride)
      : null,
    readOnly: status === "SUSPENDED",
  };
}

/**
 * Refuse a mutation from a suspended organizer.
 *
 * Separate from `requireOrganizer` because the read/write split is per-action,
 * not per-route: the same page renders for a suspended organizer, its buttons
 * just do not work.
 */
export function assertWritable(ctx: OrganizerContext): void {
  if (ctx.readOnly) {
    throw new Error(
      "This organizer account is suspended. Contact support — your existing " +
        "events and tickets are unaffected.",
    );
  }
}

export interface AdminContext {
  userId: string;
  permissions: AdminPermission[];
  isSuper: boolean;
}

/**
 * The signed-in admin holding `permission`, or a 404.
 *
 * `SUPER` satisfies every permission — otherwise the super admin would need
 * every flag listed explicitly and a new permission added later would silently
 * lock them out of the screen that manages it.
 */
export async function requireAdmin(
  permission: AdminPermission,
): Promise<AdminContext> {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!user.isAdmin) notFound();

  const permissions = user.adminPermissions;
  const isSuper = permissions.includes("SUPER");
  if (!isSuper && !permissions.includes(permission)) notFound();

  return { userId: user.id, permissions, isSuper };
}

/**
 * Non-throwing variant, for rendering navigation.
 *
 * A sidebar should not link to a screen that will 404. This decides what to
 * SHOW; it is never the thing that decides what is ALLOWED — every route and
 * action still calls `requireAdmin` regardless of what the nav rendered.
 */
export function hasPermission(
  permissions: AdminPermission[],
  permission: AdminPermission,
): boolean {
  return permissions.includes("SUPER") || permissions.includes(permission);
}

// ---------------------------------------------------------------------------
// Action guards — for server actions, which must not throw
// ---------------------------------------------------------------------------

/**
 * Why these exist separately from `requireOrganizer` / `requireAdmin`.
 *
 * Next implements `notFound()` and `redirect()` by **throwing** a special
 * error that the framework catches. A server action written in the house style
 * (`src/app/auth/actions.ts`) wraps its work in `try/catch` and returns a typed
 * result — which would swallow that control-flow throw and turn a 404 into a
 * generic "something went wrong", or worse, into a caught error that the action
 * then continues past.
 *
 * So: pages get the throwing guards, actions get these. Same underlying checks,
 * a returned discriminated union instead of an exception.
 */
export type Authorized<T> =
  | { ok: true; ctx: T }
  | { ok: false; error: string };

export async function authorizeOrganizer(
  opts: { writable?: boolean; allowUnverified?: boolean } = {},
): Promise<Authorized<OrganizerContext>> {
  const user = await getSessionUser();
  if (!user?.organizer) {
    return { ok: false, error: "Sign in with your organizer account." };
  }

  const { status } = user.organizer;
  const usable =
    status === "VERIFIED" ||
    status === "SUSPENDED" ||
    Boolean(opts.allowUnverified);
  if (!usable) {
    return { ok: false, error: "Finish onboarding before managing events." };
  }

  const profile = await db.organizerProfile.findUnique({
    where: { id: user.organizer.id },
    select: { plan: true, commissionPctOverride: true },
  });

  const ctx: OrganizerContext = {
    userId: user.id,
    organizerId: organizerScope(user.organizer.id),
    status,
    plan: profile?.plan ?? null,
    commissionPctOverride: profile?.commissionPctOverride
      ? Number(profile.commissionPctOverride)
      : null,
    readOnly: status === "SUSPENDED",
  };

  // One flag, checked once here, rather than a suspension check duplicated
  // across every mutating action and forgotten in one of them.
  if (opts.writable && ctx.readOnly) {
    return {
      ok: false,
      error:
        "This account is suspended, so it is read-only. Your existing events " +
        "and tickets are unaffected — contact support.",
    };
  }

  return { ok: true, ctx };
}

export async function authorizeAdmin(
  permission: AdminPermission,
): Promise<Authorized<AdminContext>> {
  const user = await getSessionUser();
  if (!user?.isAdmin) return { ok: false, error: "Not permitted." };

  const permissions = user.adminPermissions;
  const isSuper = permissions.includes("SUPER");
  if (!isSuper && !permissions.includes(permission)) {
    // Deliberately the same message as "not an admin at all" — a distinct
    // message tells a lower-privileged admin exactly which permission to
    // target for escalation.
    return { ok: false, error: "Not permitted." };
  }

  return { ok: true, ctx: { userId: user.id, permissions, isSuper } };
}
