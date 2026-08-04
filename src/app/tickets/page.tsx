import Link from "next/link";
import type { Metadata } from "next";
import { Button, Money, StatusPill } from "@/components/ui";
import { SignInPrompt } from "@/components/marketplace/sign-in-prompt";
import { getSessionUser } from "@/lib/auth/session";
import { getPreferredCitySlug } from "@/lib/city-context";
import { db } from "@/lib/db";
import { formatIstDate, formatIstTime } from "@/lib/ist";
import { cn } from "@/lib/cn";
import { TicketStub } from "@/components/brand/ticket-stub";
import { CategoryGlyph } from "@/components/brand/category-glyph";
import { EmptyStateArt } from "@/components/brand/illustrations";

export const metadata: Metadata = { title: "My tickets" };

type Tab = "upcoming" | "past" | "cancelled";

const TABS: { key: Tab; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
];

export default async function TicketsPage({
  searchParams,
}: PageProps<"/tickets">) {
  const user = await getSessionUser();
  if (!user) {
    return (
      <SignInPrompt
        title="Your tickets live here"
        body="Sign in with the number you booked on and every QR, past and upcoming, is right here — no email digging."
        next="/tickets"
      />
    );
  }

  const sp = await searchParams;
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: Tab = TABS.some((t) => t.key === raw) ? (raw as Tab) : "upcoming";
  const citySlug = await getPreferredCitySlug();

  const where =
    tab === "cancelled"
      ? { userId: user.id, status: { in: ["CANCELLED" as const] } }
      : tab === "past"
        ? {
            userId: user.id,
            status: { in: ["SCANNED" as const, "EXPIRED" as const] },
          }
        : {
            userId: user.id,
            status: { in: ["ACTIVE" as const, "TRANSFERRED" as const] },
          };

  const tickets = await db.ticket.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      event: {
        select: {
          title: true,
          slug: true,
          city: { select: { slug: true } },
          category: { select: { gradient: true, slug: true } },
          venue: { select: { name: true, locality: { select: { name: true } } } },
        },
      },
      tier: { select: { name: true } },
      session: { select: { startsAt: true, endsAt: true } },
      booking: { select: { bookingNumber: true, totalPaise: true } },
    },
  });

  const counts = await db.ticket.groupBy({
    by: ["status"],
    where: { userId: user.id },
    _count: { _all: true },
  });
  const countFor = (t: Tab) => {
    const map: Record<Tab, string[]> = {
      upcoming: ["ACTIVE", "TRANSFERRED"],
      past: ["SCANNED", "EXPIRED"],
      cancelled: ["CANCELLED"],
    };
    return counts
      .filter((c) => map[t].includes(c.status))
      .reduce((s, c) => s + c._count._all, 0);
  };

  return (
    <div className="px-4 md:px-6 lg:px-12 py-8">
      <h1 className="text-[24px] tracking-[-0.5px]">My tickets</h1>

      <div className="flex gap-2 mt-4 mb-6 flex-wrap" role="tablist">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "upcoming" ? "/tickets" : `/tickets?tab=${t.key}`}
            role="tab"
            aria-selected={t.key === tab}
            className={cn(
              "text-[13px] font-bold px-4 py-2 rounded-full border-[1.5px] transition-colors",
              t.key === tab
                ? "bg-primary border-primary text-white hover:text-white"
                : "bg-surface border-border text-ink hover:border-primary",
            )}
          >
            {t.label} ({countFor(t.key)})
          </Link>
        ))}
      </div>

      {tickets.length === 0 ? (
        <div className="bg-surface border border-border rounded-[18px] px-6 py-12 text-center flex flex-col items-center gap-3">
          <EmptyStateArt />
          <h2 className="text-[18px]">
            {tab === "upcoming"
              ? "No upcoming tickets"
              : tab === "past"
                ? "Nothing in your history yet"
                : "No cancelled tickets"}
          </h2>
          <p className="text-[13.5px] text-ink-muted font-semibold max-w-md">
            {tab === "upcoming"
              ? "Navratri runs nine nights and the good grounds sell out early."
              : "Tickets move here once the event has finished."}
          </p>
          <Link href={`/${citySlug}/events`} className="mt-2">
            <Button>Find something to go to</Button>
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {tickets.map((t) => {
            const start = t.session?.startsAt ?? null;
            return (
              <li key={t.id}>
                <Link
                  href={`/tickets/${t.ticketNumber}`}
                  className="block text-ink hover:text-ink transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <TicketStub
                    stub={
                      <div className="w-[86px] h-full flex flex-col items-center justify-center gap-1.5 px-2 py-4 text-center">
                        <span
                          aria-hidden
                          className="size-9 rounded-[10px] grid place-items-center text-white"
                          style={{
                            background: `var(--gradient-${t.event.category.gradient})`,
                          }}
                        >
                          <CategoryGlyph slug={t.event.category.slug} size={22} />
                        </span>
                        <span className="text-[10px] font-extrabold tracking-[0.06em] text-ink-muted">
                          ADMITS 1
                        </span>
                      </div>
                    }
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="text-[15.5px] truncate">{t.event.title}</h2>
                        <StatusPill status={t.status} />
                      </div>
                      <p className="text-[12.5px] text-ink-muted font-semibold mt-1">
                        {t.tier.name} ·{" "}
                        {t.event.venue.locality?.name ?? t.event.venue.name}
                      </p>
                      {start && (
                        <p className="text-[12.5px] font-bold mt-1">
                          {formatIstDate(start)} · {formatIstTime(start)}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-divider">
                        <span className="text-[11.5px] text-ink-muted font-semibold tabular">
                          {t.ticketNumber}
                        </span>
                        <Money
                          paise={t.booking.totalPaise}
                          className="text-[13px] font-extrabold"
                        />
                      </div>
                    </div>
                  </TicketStub>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
