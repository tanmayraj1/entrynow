"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { FilterSidebar } from "./filter-sidebar";
import type { ListingResult } from "@/lib/queries/listing";

/** Below the lg breakpoint the facet sidebar becomes a bottom sheet. */
export function MobileFilterDrawer({
  facets,
  total,
}: {
  facets: ListingResult["facets"];
  total: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lg:hidden flex items-center gap-2 bg-surface border border-border rounded-full px-3.5 py-2 text-[12.5px] font-bold cursor-pointer"
      >
        <SlidersHorizontal size={14} strokeWidth={2.4} />
        Filters
      </button>

      {open && (
        <div
          className="lg:hidden fixed inset-0 z-[90] bg-[rgba(22,48,43,.45)] flex items-end"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-h-[88vh] overflow-y-auto rounded-t-[22px] bg-bg p-3">
            <FilterSidebar
              facets={facets}
              total={total}
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
