import type { Metadata } from "next";
import { Tag } from "lucide-react";
import { EmptyState, StatusPill, Table, Td, Th, Tr } from "@/components/ui";
import { requireOrganizer } from "@/lib/auth/rbac";
import { listOrganizerPromos } from "@/lib/queries/organizer/finance";
import { listOrganizerEvents } from "@/lib/queries/organizer/events";
import { formatIstDate } from "@/lib/ist";
import { inr } from "@/lib/money";
import { PromoForm, PromoToggle } from "./promo-forms";

export const metadata: Metadata = { title: "Promo codes" };

export default async function OrganizerPromosPage() {
  const ctx = await requireOrganizer({ allowUnverified: true });

  const [promos, events] = await Promise.all([
    listOrganizerPromos(ctx.organizerId),
    listOrganizerEvents(ctx.organizerId, { perPage: 100 }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[20px] font-extrabold leading-tight">Promo codes</h1>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          Discounts come out of your revenue, not the platform&apos;s
          commission — commission is charged on the discounted subtotal.
        </p>
      </div>

      <div className="bg-surface border border-border rounded-[var(--radius-card)] overflow-hidden">
        {promos.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="No promo codes yet"
            body="Create one below. Codes can apply to everything you run, or to a single event."
          />
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Code</Th>
                <Th>Scope</Th>
                <Th numeric>Discount</Th>
                <Th numeric>Used</Th>
                <Th>Window</Th>
                <Th>Status</Th>
                <Th />
              </Tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <Tr key={p.id}>
                  <Td className="tabular font-extrabold">{p.code}</Td>
                  <Td className="max-w-[200px] truncate">
                    {p.event?.title ?? "All your events"}
                  </Td>
                  <Td numeric>
                    {p.discountPct
                      ? `${Number(p.discountPct)}%`
                      : inr(p.discountFlatPaise ?? 0)}
                  </Td>
                  <Td numeric>
                    {p.usedCount}
                    {p.usageLimit ? (
                      <span className="text-ink-muted">/{p.usageLimit}</span>
                    ) : null}
                    {p.reservedCount > 0 && (
                      <span className="block text-[10.5px] font-bold text-ink-muted">
                        {p.reservedCount} in checkout
                      </span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-ink-muted">
                    {p.endsAt ? `to ${formatIstDate(p.endsAt)}` : "Open-ended"}
                  </Td>
                  <Td>
                    <StatusPill
                      tone={p.isActive ? "success" : "cancelled"}
                      label={p.isActive ? "Active" : "Paused"}
                    />
                  </Td>
                  <Td className="text-right">
                    <PromoToggle
                      promoId={p.id}
                      isActive={p.isActive}
                      code={p.code}
                      readOnly={ctx.readOnly}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <section className="bg-surface border border-border rounded-[var(--radius-card)] p-4 lg:p-5">
        <h2 className="text-[14.5px] font-extrabold">New promo code</h2>
        <p className="text-[11.5px] font-semibold text-ink-muted mt-0.5 mb-3.5">
          A usage limit is held at checkout and consumed at payment, so two
          people cannot both take the last one.
        </p>
        <PromoForm
          events={events.rows.map((e) => ({ id: e.id, title: e.title }))}
          readOnly={ctx.readOnly}
        />
      </section>
    </div>
  );
}
