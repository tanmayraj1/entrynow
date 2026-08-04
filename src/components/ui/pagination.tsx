import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Pagination over a server-rendered list.
 *
 * Takes the current `URLSearchParams` and rewrites only `page`, so every other
 * filter the user set — status tab, search term, date range — survives the
 * jump. Building `?page=2` from scratch is the classic bug here: it silently
 * resets the filters and the list appears to show the wrong rows.
 *
 * Renders nothing for a single page. A pager under a 3-row table is noise.
 */
export function Pagination({
  page,
  pageCount,
  basePath,
  params,
  total,
  className,
}: {
  /** 1-based. */
  page: number;
  pageCount: number;
  basePath: string;
  /** The current query string, minus `page` (it is overwritten). */
  params?: URLSearchParams | Record<string, string | undefined>;
  /** Row count, for the "1–20 of 148" summary. */
  total?: number;
  className?: string;
}) {
  if (pageCount <= 1) return null;

  const base = new URLSearchParams(
    params instanceof URLSearchParams
      ? params
      : Object.entries(params ?? {}).flatMap(([k, v]) =>
          v == null || v === "" ? [] : [[k, v] as [string, string]],
        ),
  );

  const href = (p: number) => {
    const sp = new URLSearchParams(base);
    if (p <= 1) sp.delete("page");
    else sp.set("page", String(p));
    const q = sp.toString();
    return q ? `${basePath}?${q}` : basePath;
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 pt-4",
        className,
      )}
    >
      <p className="text-[12px] font-semibold text-ink-muted tabular">
        Page {page} of {pageCount}
        {total !== undefined && ` · ${total.toLocaleString("en-IN")} rows`}
      </p>
      <div className="flex items-center gap-1.5">
        <PageLink href={href(page - 1)} disabled={page <= 1} label="Previous">
          <ChevronLeft size={15} strokeWidth={2.6} />
          <span className="hidden sm:inline">Previous</span>
        </PageLink>
        {windowOf(page, pageCount).map((p, i) =>
          p === null ? (
            <span
              key={`gap-${i}`}
              aria-hidden
              className="px-1 text-[13px] font-bold text-ink-muted"
            >
              …
            </span>
          ) : (
            <Link
              key={p}
              href={href(p)}
              aria-current={p === page ? "page" : undefined}
              aria-label={`Page ${p}`}
              className={cn(
                "min-w-[32px] h-8 grid place-items-center rounded-[9px] px-2",
                "text-[12.5px] font-extrabold tabular transition-colors",
                p === page
                  ? "bg-primary text-white"
                  : "text-body-soft hover:bg-divider",
              )}
            >
              {p}
            </Link>
          ),
        )}
        <PageLink
          href={href(page + 1)}
          disabled={page >= pageCount}
          label="Next"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight size={15} strokeWidth={2.6} />
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const cls = cn(
    "inline-flex items-center gap-1 h-8 px-2.5 rounded-[9px]",
    "text-[12.5px] font-bold border border-border transition-colors",
  );
  // A disabled link is a `<span>`, not an `<a aria-disabled>`. An anchor with
  // an href stays keyboard-focusable and clickable whatever ARIA claims, and
  // "Previous" on page 1 would navigate to page 0.
  if (disabled) {
    return (
      <span aria-hidden className={cn(cls, "text-ink-muted opacity-45")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={cn(cls, "hover:bg-divider")}>
      {children}
    </Link>
  );
}

/**
 * Page numbers to render: always first and last, always the current page's
 * neighbours, `null` for an elided run.
 */
function windowOf(page: number, pageCount: number): (number | null)[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const out: (number | null)[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pageCount - 1, page + 1);
  if (from > 2) out.push(null);
  for (let p = from; p <= to; p++) out.push(p);
  if (to < pageCount - 1) out.push(null);
  out.push(pageCount);
  return out;
}
