import Link from "next/link";
import { Logo } from "@/components/ui";

export function SiteFooter({ citySlug }: { citySlug: string }) {
  const columns = [
    {
      title: "Discover",
      links: [
        { href: `/${citySlug}/events`, label: "All events" },
        { href: `/${citySlug}/festivals/navratri-2026`, label: "Navratri 2026" },
        { href: `/${citySlug}/events?category=garba-navratri`, label: "Garba" },
        { href: `/${citySlug}/events?near=1`, label: "Near me" },
      ],
    },
    {
      title: "For organizers",
      links: [
        { href: "/organizer/onboarding", label: "List your event" },
        { href: "/organizer", label: "Organizer portal" },
        { href: "/organizer/pricing", label: "Plans & commission" },
      ],
    },
    {
      title: "Support",
      links: [
        { href: "/account/help", label: "Help centre" },
        { href: "/tickets", label: "My tickets" },
        { href: "/legal/refunds", label: "Refund policy" },
        { href: "/legal/terms", label: "Terms of use" },
        { href: "/legal/image-credits", label: "Image credits" },
      ],
    },
  ];

  return (
    <footer className="bg-ink text-white mt-10">
      <div className="px-4 md:px-6 lg:px-12 py-12 grid gap-10 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3">
          {/* The navy half of the lockup must go white on this ground; the
              gradient half stays as it is, which is the whole point of it. */}
          <Logo size="md" onDark />
          <p className="text-[13px] text-white/70 max-w-xs leading-relaxed">
            Communal and cultural events across India — Garba nights, Diwali
            melas, concerts and more. Book digital tickets, scan and enter.
          </p>
          <p className="text-[12.5px] text-white/60 mt-2">
            support@entrynow.in · 1800-121-ENTRY
          </p>
        </div>

        {columns.map((col) => (
          <div key={col.title} className="flex flex-col gap-2.5">
            <p className="text-[12px] font-extrabold tracking-[0.08em] text-white/60">
              {col.title.toUpperCase()}
            </p>
            {col.links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-[13.5px] font-semibold text-white/85 hover:text-white"
              >
                {l.label}
              </Link>
            ))}
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 px-4 md:px-6 lg:px-12 py-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-white/60">
          © {new Date().getFullYear()} Entry Now. Made in Ahmedabad by{" "}
          {/* External link: `rel="noreferrer noopener"` is not optional on a
              `target="_blank"` — without `noopener` the opened page gets a
              `window.opener` handle back into this one. */}
          <a
            href="https://rytfulmedia.in/"
            target="_blank"
            rel="noreferrer noopener"
            className="text-white/85 font-semibold hover:text-white underline underline-offset-2"
          >
            Rytful Media
          </a>
          .
        </p>
        {/* Language switching arrives with i18n. Until then this is a link to
            the policies rather than a decorative row of language names. */}
        <Link
          href="/legal/privacy"
          className="text-[12.5px] text-white/60 hover:text-white"
        >
          Privacy
        </Link>
      </div>
    </footer>
  );
}
