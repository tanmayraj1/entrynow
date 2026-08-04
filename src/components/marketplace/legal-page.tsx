import Link from "next/link";

/** Shared reading layout for the legal pages. */
export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: { heading: string; body: React.ReactNode }[];
}) {
  return (
    <article className="px-4 md:px-6 lg:px-12 py-10 max-w-3xl mx-auto">
      <nav className="text-[12.5px] font-semibold text-ink-muted mb-4 flex gap-2">
        <Link href="/legal/terms">Terms</Link>
        <span aria-hidden>·</span>
        <Link href="/legal/refunds">Refunds</Link>
        <span aria-hidden>·</span>
        <Link href="/legal/privacy">Privacy</Link>
      </nav>

      <h1 className="text-[28px] tracking-[-0.6px]">{title}</h1>
      <p className="text-[12px] font-bold text-ink-muted tracking-[0.06em] mt-1.5">
        LAST UPDATED {updated.toUpperCase()}
      </p>
      <p className="text-[14px] text-body-soft leading-relaxed mt-4">{intro}</p>

      <div className="flex flex-col gap-6 mt-8">
        {sections.map((s) => (
          <section key={s.heading}>
            <h2 className="text-[17px] mb-2">{s.heading}</h2>
            <div className="text-[13.5px] text-body-soft leading-relaxed flex flex-col gap-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1 [&_b]:text-ink">
              {s.body}
            </div>
          </section>
        ))}
      </div>

      <p className="text-[12.5px] text-ink-muted font-semibold mt-10 border-t border-border pt-5">
        Questions about any of this? Write to{" "}
        <a href="mailto:support@entrynow.in">support@entrynow.in</a> or call
        1800-121-ENTRY.
      </p>
    </article>
  );
}
