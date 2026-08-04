import { inr } from "@/lib/money";

/**
 * Garba zone plan — concentric rings, transcribed from the Event prototype.
 *
 * Purely illustrative and explicitly "not to scale": it explains what a tier
 * buys you spatially, which a seat map cannot for a dance ground where nobody
 * sits. Rendered only for events that actually have rings; anything else gets
 * the tier list alone.
 */
export function ZonePlan({
  venueName,
  tiers,
}: {
  venueName: string;
  tiers: { name: string; pricePaise: number }[];
}) {
  const priceOf = (match: string) =>
    tiers.find((t) => t.name.toLowerCase().includes(match))?.pricePaise ?? null;

  const femalePrice = priceOf("female");
  const generalPrice = priceOf("single") ?? priceOf("general");
  const vipPrice = priceOf("vip");

  const legend = [
    { color: "#F5B301", label: "Mandap · aarti" },
    { color: "#CDE9E0", label: "Dance arena — all tiers" },
    ...(femalePrice
      ? [{ color: "#F6D9EF", label: `Female ring — ${inr(femalePrice)}` }]
      : []),
    ...(generalPrice
      ? [{ color: "#EDE9FE", label: `General ring — ${inr(generalPrice)}` }]
      : []),
    ...(vipPrice
      ? [{ color: "#FBD0EC", label: `VIP lounge — ${inr(vipPrice)}` }]
      : []),
    { color: "#EDF1EF", label: "Food court" },
  ];

  return (
    <section className="bg-surface border border-border rounded-[20px] p-5 md:p-6">
      <div className="flex justify-between items-center mb-3.5 gap-3">
        <h2 className="text-[17px]">Zone plan</h2>
        <span className="text-[11px] font-bold text-ink-muted text-right">
          {venueName} · not to scale
        </span>
      </div>

      <div className="relative h-[250px] bg-bg border border-border rounded-[14px] overflow-hidden">
        {/* Rings, outermost first */}
        {[
          { size: 216, bg: "#EDE9FE", border: "#C4B5FD" },
          { size: 158, bg: "#F6D9EF", border: "#E9A8D8" },
          { size: 104, bg: "#CDE9E0", border: "#7FC6B2" },
        ].map((r) => (
          <span
            key={r.size}
            aria-hidden
            className="absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: r.size,
              height: r.size,
              background: r.bg,
              border: `1.5px solid ${r.border}`,
            }}
          />
        ))}

        <span
          aria-hidden
          className="absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 size-11 rounded-full bg-gold border-2 border-white grid place-items-center text-[8.5px] font-extrabold text-ink text-center leading-tight"
        >
          MANDAP
        </span>

        <span className="absolute left-1/2 top-[52%] translate-x-[-50%] translate-y-[-136px] text-[9px] font-extrabold text-[#6D28D9] tracking-[0.04em]">
          GENERAL RING
        </span>
        <span className="absolute left-1/2 top-[52%] translate-x-[-50%] translate-y-[-106px] text-[9px] font-extrabold text-[#BE3B99]">
          FEMALE-ENTRY RING
        </span>
        <span className="absolute left-1/2 top-[52%] translate-x-[-50%] translate-y-[-76px] text-[9px] font-extrabold text-[#0A6B59]">
          DANCE ARENA
        </span>

        <span className="absolute right-2.5 top-2.5 w-24 h-[52px] rounded-[10px] bg-[#FBD0EC] border-[1.5px] border-[#E9358F] grid place-items-center text-[9.5px] font-extrabold text-[#BE3B99] text-center leading-tight px-1">
          VIP LOUNGE
        </span>
        <span className="absolute left-2.5 bottom-2.5 w-24 h-[52px] rounded-[10px] bg-[#DCE9F8] border-[1.5px] border-[#7FA8D9] grid place-items-center text-[9.5px] font-extrabold text-[#2B5797] text-center leading-tight px-1">
          FAMILY ZONE
        </span>
        <span className="absolute left-2.5 top-2.5 w-24 h-9 rounded-[10px] bg-divider border-[1.5px] border-dashed border-[#9AA7A3] grid place-items-center text-[9.5px] font-extrabold text-ink-muted">
          FOOD COURT
        </span>

        <span className="absolute inset-x-0 bottom-1.5 text-center text-[9.5px] font-extrabold text-ink-muted tracking-[0.12em]">
          ▲ GATE 1 · GATE 2 · GATE 3 ▲
        </span>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-3">
        {legend.map((l) => (
          <li
            key={l.label}
            className="flex items-center gap-2 text-[11px] font-bold text-body-soft"
          >
            <span
              aria-hidden
              className="size-[11px] rounded-[4px] shrink-0"
              style={{ background: l.color }}
            />
            {l.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
