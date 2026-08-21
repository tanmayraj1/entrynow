import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { AuthForm } from "@/app/auth/auth-form";
import { signOut } from "@/app/auth/actions";

/**
 * The staff sign-in screen, shared by the organizer and admin doors.
 *
 * Why a separate page at all, when `/auth` already signs everyone in: an
 * organizer arriving to check last night's sales and an attendee arriving to
 * buy a ticket want different things from the same screen, and the consumer
 * one is written for the attendee — "Sign in to book", the terms line, the
 * marketplace header offering festivals and categories. Sending a business
 * user through it makes the portal feel like a page hidden behind the shop
 * rather than a product they were given.
 *
 * **This is presentation, not a security boundary.** The credential store is
 * the same one `/auth` uses and a staff account signs in fine from either
 * door; what actually keeps a stranger out of the portals is
 * `requireOrganizer` / `requireAdmin` on every route and every action. Nothing
 * here should ever be mistaken for the gate — see `src/lib/auth/rbac.ts`.
 *
 * Phone + OTP only. Every seeded organizer and admin is a phone account: the
 * email+password path exists so a demo reviewer can get in without an SMS
 * provider (D-025), and no staff row has a `passwordHash` at all. Offering an
 * email tab here would be offering a door that cannot open.
 */
export function StaffDoor({
  theme,
  eyebrow,
  heading,
  blurb,
  next,
  footnote,
  signedInAs,
}: {
  theme: "dash-organizer" | "dash-admin";
  /** Small label above the card — which portal this is. */
  eyebrow: string;
  heading: string;
  blurb: string;
  /** Where to land after a successful sign-in. */
  next: string;
  footnote?: React.ReactNode;
  /**
   * Someone is already signed in, and it is not an account this door admits.
   *
   * Offering a way out is not a nicety here, it is the difference between a
   * recoverable state and a dead end. `requireAdmin` answers a signed-in
   * non-admin with `notFound()` — deliberately, so the portal cannot be
   * enumerated — so all they see at /admin is the marketplace 404. If they
   * find their way to this door, it tells them their account has no admin
   * role and then offers nothing to do about it: the only sign-out control in
   * the whole app lives in /account, which is a consumer page they have no
   * reason to visit and no reason to guess at.
   */
  signedInAs?: { name: string | null } | null;
}) {
  return (
    <div
      data-theme={theme}
      className="min-h-[100svh] bg-bg text-ink flex flex-col items-center justify-center px-5 py-12 gap-6"
    >
      <div className="flex flex-col items-center gap-2.5">
        {/* Never `onDark` here. Only the admin portal's *sidebar* is navy; the
            page behind this card is the theme's light `bg`, so the white
            wordmark would be invisible on it. */}
        <Logo size="lg" />
        <span className="text-[11.5px] font-extrabold uppercase tracking-[0.14em] text-ink-muted">
          {eyebrow}
        </span>
      </div>

      <div className="w-full max-w-[400px] bg-surface border border-border rounded-[20px] p-6 md:p-8 shadow-[var(--shadow-e2)]">
        <AuthForm next={next} heading={heading} blurb={blurb} showTerms={false} />
      </div>

      {signedInAs && (
        <form
          action={signOut}
          className="flex flex-col items-center gap-1.5 text-center"
        >
          <p className="text-[12px] font-semibold text-ink-muted">
            Signed in as{" "}
            <span className="text-ink">{signedInAs.name ?? "another account"}</span>
            , which cannot open this portal.
          </p>
          <button
            type="submit"
            className="text-[12.5px] font-extrabold text-danger hover:text-danger-dark cursor-pointer"
          >
            Sign out and use a different number
          </button>
        </form>
      )}

      {footnote && (
        <p className="text-[12px] font-semibold text-ink-muted text-center max-w-[400px] leading-relaxed">
          {footnote}
        </p>
      )}

      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={14} strokeWidth={2.4} />
        Back to Entry Now
      </Link>
    </div>
  );
}
