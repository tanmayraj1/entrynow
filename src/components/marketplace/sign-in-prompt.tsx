import Link from "next/link";
import { Button } from "@/components/ui";
import { EmptyStateArt, GlyphMedallion } from "@/components/brand/illustrations";

/**
 * Signed-out state for a gated page.
 *
 * Deliberately not a redirect: the page still explains what lives here and
 * carries the user back after sign-in, rather than bouncing them to a login
 * screen with no context for why.
 */
export function SignInPrompt({
  title,
  body,
  next,
  icon,
}: {
  title: string;
  body: string;
  next: string;
  /** A lucide icon. Omit for the default illustrated stub. */
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
}) {
  return (
    <div className="px-4 py-14 flex flex-col items-center text-center gap-3">
      {icon ? <GlyphMedallion icon={icon} /> : <EmptyStateArt />}
      <h1 className="text-[22px] tracking-[-0.4px]">{title}</h1>
      <p className="text-[13.5px] text-body-soft max-w-md leading-relaxed">
        {body}
      </p>
      <Link href={`/auth?next=${encodeURIComponent(next)}`} className="mt-2">
        <Button size="lg">Sign in with your phone</Button>
      </Link>
    </div>
  );
}
