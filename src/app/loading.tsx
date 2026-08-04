import { TicketTear } from "@/components/brand/ticket-tear";

/**
 * The root streaming fallback.
 *
 * Every page here is server-rendered against Postgres, so a cold serverless
 * invocation can spend a second on the query before any HTML exists. Without a
 * `loading.tsx` that second is a blank white tab and people press back.
 *
 * The ticket tearing is the one gesture this product is about, so it does the
 * waiting rather than a spinner. Underneath it sits a card skeleton that
 * reserves roughly the shape of what is coming, so the content does not jump
 * when it lands.
 */
export default function Loading() {
  return (
    <div
      data-theme="market"
      className="min-h-screen bg-bg px-4 md:px-6 lg:px-12 py-10"
      aria-busy="true"
    >
      <div className="flex justify-center py-6">
        <TicketTear label="Finding tonight's events" />
      </div>

      <div className="grid gap-4 mt-6 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="rounded-[var(--radius-card)] border border-border bg-surface overflow-hidden"
          >
            <div className="aspect-[16/10] bg-divider" />
            <div className="p-4 flex flex-col gap-2">
              <div className="h-[13px] w-4/5 rounded-[6px] bg-divider" />
              <div className="h-[11px] w-3/5 rounded-[6px] bg-divider" />
              <div className="h-[11px] w-2/5 rounded-[6px] bg-divider mt-1" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
