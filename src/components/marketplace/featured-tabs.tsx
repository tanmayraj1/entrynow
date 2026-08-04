"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/cn";
import type { FeaturedTab } from "@/lib/queries/marketplace";

/**
 * All / This weekend / Big / Intimate.
 *
 * Tab state lives in the URL so the view is shareable and the server component
 * re-renders with the right filter — the same principle the listing page's
 * facets use.
 */
export function FeaturedTabs({
  tabs,
  active,
  citySlug,
}: {
  tabs: { key: FeaturedTab; label: string }[];
  active: FeaturedTab;
  citySlug: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div
      className={cn("flex gap-2 flex-wrap", pending && "opacity-60")}
      role="tablist"
    >
      {tabs.map((t) => {
        const selected = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() =>
              startTransition(() =>
                router.replace(
                  t.key === "all"
                    ? `/${citySlug}`
                    : `/${citySlug}?tab=${t.key}`,
                  { scroll: false },
                ),
              )
            }
            className={cn(
              "text-[13.5px] font-bold px-4 py-2 rounded-full cursor-pointer",
              "border-[1.5px] transition-colors",
              selected
                ? "bg-primary border-primary text-white"
                : "bg-surface border-border text-ink hover:border-primary hover:text-primary",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
