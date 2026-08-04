/**
 * The root streaming fallback.
 *
 * Every page here is server-rendered against Postgres, so a cold serverless
 * invocation can spend a second on the query before any HTML exists. Without a
 * `loading.tsx` that second is a blank white tab and people press back.
 *
 * A skeleton rather than a spinner: it reserves roughly the shape that is
 * coming, so the content does not jump when it lands. Deliberately static —
 * no animation, because this renders during navigation under
 * `prefers-reduced-motion` too, and a pulsing block is the one thing that
 * setting is most often turned on for.
 */
export default function Loading() {
  return (
    <div
      data-theme="market"
      className="min-h-screen bg-bg px-4 md:px-6 lg:px-12 py-8"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>

      <div className="h-[38px] w-[240px] rounded-[12px] bg-divider" />
      <div className="h-[16px] w-[180px] rounded-[8px] bg-divider mt-3" />

      <div className="grid gap-4 mt-8 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
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
