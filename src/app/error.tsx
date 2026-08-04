"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, Logo } from "@/components/ui";
import { EmptyStateArt } from "@/components/brand/illustrations";

/**
 * The route-level error boundary.
 *
 * Without this file, an unhandled server error shows Next's default page — a
 * bare stack trace in development and an unbranded "Application error" in
 * production, either of which reads as "this site is broken" rather than "that
 * page is broken".
 *
 * `digest` is deliberately shown. It is the only handle a user has on their
 * own failure: it matches the server log line exactly, and it lets support
 * find the incident without the user describing symptoms. It is a hash — it
 * leaks nothing about the error itself.
 *
 * Nothing here reads the database or the session. An error boundary that can
 * itself throw is not a boundary.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The seam an error reporter (Sentry et al.) attaches to in Iteration 9.
    // Until then this is the one place a client-visible failure is recorded.
    console.error("[error-boundary]", error.digest ?? "", error.message);
  }, [error]);

  const city = process.env.NEXT_PUBLIC_DEFAULT_CITY ?? "ahmedabad";

  return (
    <div
      data-theme="market"
      className="min-h-screen bg-bg flex flex-col items-center justify-center px-6 py-16 text-center gap-4"
    >
      <Logo size="lg" />

      <EmptyStateArt className="mt-2" />

      <h1 className="text-[28px] tracking-[-0.6px] mt-2">
        Something went wrong at our end
      </h1>
      <p className="text-[14px] text-body-soft max-w-md leading-relaxed">
        This one is us, not you. Nothing you had in progress was charged — a
        booking is only confirmed once payment is captured.
      </p>

      <div className="flex gap-2.5 flex-wrap justify-center mt-3">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <Link href={`/${city}`}>
          <Button variant="outline">Back to home</Button>
        </Link>
        <Link href="/tickets">
          <Button variant="ghost">My tickets</Button>
        </Link>
      </div>

      {error.digest && (
        <p className="text-[11.5px] font-semibold text-ink-muted mt-4 tabular">
          Reference {error.digest}
        </p>
      )}
    </div>
  );
}
