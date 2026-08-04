"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Compass, Home, LayoutGrid, Ticket, User, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  CategoryGlyph,
  categoryAccent,
} from "@/components/brand/category-glyph";

/**
 * The mobile dock — the primary tab bar, with categories behind a button.
 *
 * An earlier version pinned a horizontally-scrolling category rail above the
 * tabs. It was wrong: a 12-item scroller in 54px of viewport shows three
 * truncated chips, hides the rest behind a gesture nobody discovers, and eats
 * a fifth of a phone screen on every page to do it. A button that opens a
 * sheet shows all twelve at once and costs nothing until it is asked for.
 */

const TAB_HEIGHT = 56;

export interface DockCategory {
  slug: string;
  name: string;
}

export function MobileDock({
  citySlug,
  categories,
}: {
  citySlug: string;
  categories: DockCategory[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeCategory = searchParams.get("category");
  const [sheetOpen, setSheetOpen] = useState(false);

  // Any navigation closes the sheet — otherwise tapping a category leaves it
  // covering the results it just filtered.
  //
  // Derived during render rather than in an effect: an effect would paint one
  // frame of the sheet sitting over the new page before closing it.
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [seenRoute, setSeenRoute] = useState(routeKey);
  if (seenRoute !== routeKey) {
    setSeenRoute(routeKey);
    if (sheetOpen) setSheetOpen(false);
  }

  // A sheet that scrolls the page behind it feels broken on iOS.
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheetOpen]);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const tabs = [
    { href: `/${citySlug}`, label: "Home", Icon: Home, exact: true },
    { href: `/${citySlug}/events`, label: "Explore", Icon: Compass },
    { href: "/tickets", label: "Tickets", Icon: Ticket },
    { href: "/account", label: "Profile", Icon: User },
  ];

  return (
    <>
      {sheetOpen && (
        <CategorySheet
          citySlug={citySlug}
          categories={categories}
          activeCategory={activeCategory}
          onClose={() => setSheetOpen(false)}
        />
      )}

      <nav
        aria-label="Primary"
        className="lg:hidden sticky bottom-0 z-40 bg-surface border-t border-border flex"
        style={{
          height: TAB_HEIGHT,
          // Clear of the iOS home indicator.
          paddingBottom: "env(safe-area-inset-bottom)",
          boxSizing: "content-box",
        }}
      >
        {tabs.slice(0, 2).map((t) => (
          <Tab key={t.href} {...t} pathname={pathname} />
        ))}

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-expanded={sheetOpen}
          aria-haspopup="dialog"
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 cursor-pointer",
            activeCategory || sheetOpen
              ? "text-primary"
              : "text-ink-muted hover:text-ink",
          )}
        >
          <LayoutGrid size={19} strokeWidth={activeCategory || sheetOpen ? 2.4 : 2} />
          <span className="text-[9.5px] font-extrabold">Categories</span>
        </button>

        {tabs.slice(2).map((t) => (
          <Tab key={t.href} {...t} pathname={pathname} />
        ))}
      </nav>
    </>
  );
}

function Tab({
  href,
  label,
  Icon,
  exact,
  pathname,
}: {
  href: string;
  label: string;
  Icon: typeof Home;
  exact?: boolean;
  pathname: string;
}) {
  const active = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex-1 flex flex-col items-center justify-center gap-1",
        active ? "text-primary" : "text-ink-muted hover:text-ink",
      )}
    >
      <Icon size={19} strokeWidth={active ? 2.4 : 2} />
      <span className="text-[9.5px] font-extrabold">{label}</span>
    </Link>
  );
}

/** All twelve categories at once, as a grid, above the dock. */
function CategorySheet({
  citySlug,
  categories,
  activeCategory,
  onClose,
}: {
  citySlug: string;
  categories: DockCategory[];
  activeCategory: string | null;
  onClose: () => void;
}) {
  return (
    <div className="lg:hidden fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close categories"
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(14,26,56,.5)] cursor-pointer"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Browse by category"
        className="absolute inset-x-0 bottom-0 bg-surface rounded-t-[22px] max-h-[78vh] overflow-y-auto"
        style={{
          boxShadow: "var(--shadow-4)",
          paddingBottom: `calc(${TAB_HEIGHT}px + env(safe-area-inset-bottom) + 12px)`,
        }}
      >
        <div className="sticky top-0 bg-surface px-4 pt-3 pb-2.5 flex items-center justify-between border-b border-divider">
          <span aria-hidden className="absolute left-1/2 -translate-x-1/2 top-1.5 h-1 w-9 rounded-full bg-border-strong" />
          <h2 className="text-[16px] mt-1.5">Browse by category</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="size-8 grid place-items-center rounded-full text-ink-muted hover:bg-bg cursor-pointer mt-1"
          >
            <X size={17} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2.5 p-4">
          <SheetTile
            href={`/${citySlug}/events`}
            label="All events"
            active={!activeCategory}
          />
          {categories.map((c) => (
            <SheetTile
              key={c.slug}
              href={`/${citySlug}/events?category=${c.slug}`}
              label={c.name}
              active={activeCategory === c.slug}
              accent={categoryAccent(c.slug)}
              glyph={<CategoryGlyph slug={c.slug} size={26} strokeWidth={2.2} />}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SheetTile({
  href,
  label,
  active,
  accent,
  glyph,
}: {
  href: string;
  label: string;
  active: boolean;
  accent?: string;
  glyph?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-[16px] border p-3 flex flex-col items-center justify-center gap-2 text-center min-h-[92px]",
        active
          ? "text-white border-transparent"
          : "bg-bg border-border text-ink hover:text-ink",
      )}
      style={
        active
          ? { background: accent ?? "var(--color-primary)" }
          : undefined
      }
    >
      <span style={active ? undefined : { color: accent }}>
        {glyph ?? <LayoutGrid size={26} strokeWidth={2.2} />}
      </span>
      <span className="text-[11.5px] font-bold leading-tight">{label}</span>
    </Link>
  );
}

/** Height the dock occupies, for the page padding that keeps content clear. */
export const DOCK_HEIGHT_PX = TAB_HEIGHT;
