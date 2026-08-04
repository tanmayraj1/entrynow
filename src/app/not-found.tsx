import Link from "next/link";
import { Button, Logo } from "@/components/ui";
import { EmptyStateArt } from "@/components/brand/illustrations";

/** 404 / empty state. Never a dead end — always routes somewhere useful. */
export default function NotFound() {
  const city = process.env.NEXT_PUBLIC_DEFAULT_CITY ?? "ahmedabad";

  return (
    <div
      data-theme="market"
      className="min-h-screen bg-bg flex flex-col items-center justify-center px-6 py-16 text-center gap-4"
    >
      <Logo size="lg" />

      <EmptyStateArt className="mt-2" />

      <h1 className="text-[28px] tracking-[-0.6px] mt-2">
        This page has left the ground
      </h1>
      <p className="text-[14px] text-body-soft max-w-md leading-relaxed">
        The link may be old, or the event may have finished its run. The
        festival calendar is still very much on.
      </p>

      <div className="flex gap-2.5 flex-wrap justify-center mt-3">
        <Link href={`/${city}`}>
          <Button variant="primary">Back to home</Button>
        </Link>
        <Link href={`/${city}/events`}>
          <Button variant="outline">Browse events</Button>
        </Link>
        <Link href="/tickets">
          <Button variant="ghost">My tickets</Button>
        </Link>
      </div>
    </div>
  );
}
