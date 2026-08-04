"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { LayoutGrid, List, Map } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ListingSort, ListingView } from "@/lib/queries/listing";

const VIEWS: { key: ListingView; label: string; Icon: typeof Map }[] = [
  { key: "grid", label: "Grid", Icon: LayoutGrid },
  { key: "list", label: "List", Icon: List },
  { key: "map", label: "Map", Icon: Map },
];

const SORTS: { key: ListingSort; label: string }[] = [
  { key: "trending", label: "Trending" },
  { key: "date", label: "Date" },
  { key: "price_asc", label: "Price: low to high" },
  { key: "price_desc", label: "Price: high to low" },
  { key: "rating", label: "Rating" },
];

export function ViewSwitcher({
  view,
  sort,
}: {
  view: ListingView;
  sort: ListingSort;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const set = (key: string, value: string, isDefault: boolean) => {
    const next = new URLSearchParams(params.toString());
    if (isDefault) next.delete(key); else next.set(key, value);
    startTransition(() =>
      router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, {
        scroll: false,
      }),
    );
  };

  return (
    <div className={cn("flex items-center gap-3", pending && "opacity-70")}>
      <label className="hidden sm:flex items-center gap-2 text-[12.5px] font-semibold text-ink-muted">
        Sort
        <select
          value={sort}
          onChange={(e) =>
            set("sort", e.target.value, e.target.value === "trending")
          }
          className="bg-surface border border-border rounded-[10px] px-2.5 py-1.5 text-[12.5px] font-bold text-ink cursor-pointer outline-none focus:border-primary"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <div
        className="flex bg-surface border border-border rounded-full p-1"
        role="group"
        aria-label="View"
      >
        {VIEWS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            title={label}
            onClick={() => set("view", key, key === "grid")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-bold cursor-pointer transition-colors",
              view === key
                ? "bg-primary text-white"
                : "text-ink-muted hover:text-primary",
            )}
          >
            <Icon size={14} strokeWidth={2.4} />
            <span className="hidden md:inline">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
