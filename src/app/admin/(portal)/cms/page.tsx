import type { Metadata } from "next";
import { StatusPill, Table, Td, Th, Tr } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/rbac";
import { listCmsContent } from "@/lib/queries/admin/queries";
import { db } from "@/lib/db";
import { formatIstDate } from "@/lib/ist";
import { BannerForm, CatalogToggle } from "./cms-forms";

export const metadata: Metadata = { title: "Content" };

export default async function AdminCmsPage() {
  await requireAdmin("CONTENT");
  const [{ banners, cities, categories, festivals }, cityOptions] =
    await Promise.all([
      listCmsContent(),
      db.city.findMany({
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      }),
    ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[20px] font-extrabold leading-tight">Content</h1>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          Catalog rows deactivate; they are never deleted. Events carry a
          foreign key to each one, so a delete would either fail or orphan them
          (spec G2).
        </p>
      </div>

      <section className="bg-surface border border-border rounded-[var(--radius-card)] overflow-hidden">
        <h2 className="text-[14px] font-extrabold px-4 py-3 border-b border-border">
          Banners
        </h2>
        {banners.length === 0 ? (
          <p className="px-4 py-6 text-[12.5px] font-semibold text-ink-muted">
            None yet.
          </p>
        ) : (
          <Table>
            <thead>
              <Tr>
                <Th>Title</Th>
                <Th>City</Th>
                <Th>Status</Th>
                <Th>Window</Th>
              </Tr>
            </thead>
            <tbody>
              {banners.map((b) => (
                <Tr key={b.id}>
                  <Td className="max-w-[260px]">
                    <span className="font-extrabold block truncate">
                      {b.title}
                    </span>
                    {b.subtitle && (
                      <span className="text-[11.5px] font-semibold text-ink-muted block truncate">
                        {b.subtitle}
                      </span>
                    )}
                  </Td>
                  <Td>{b.city?.name ?? "All cities"}</Td>
                  <Td>
                    <StatusPill
                      tone={
                        b.status === "LIVE"
                          ? "success"
                          : b.status === "SCHEDULED"
                            ? "pending"
                            : "cancelled"
                      }
                      label={b.status}
                    />
                  </Td>
                  <Td className="whitespace-nowrap text-ink-muted">
                    {b.startsAt ? formatIstDate(b.startsAt) : "—"}
                    {b.endsAt ? ` – ${formatIstDate(b.endsAt)}` : ""}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <div className="p-4 border-t border-border">
          <p className="text-[12.5px] font-extrabold mb-3">Add a banner</p>
          <BannerForm cities={cityOptions} />
        </div>
      </section>

      <div className="grid lg:grid-cols-3 gap-4">
        <CatalogPanel
          title="Cities"
          kind="city"
          rows={cities.map((c) => ({
            id: c.id,
            name: c.name,
            isActive: c.isActive,
            count: c._count.events,
            meta: c.state,
          }))}
        />
        <CatalogPanel
          title="Categories"
          kind="category"
          rows={categories.map((c) => ({
            id: c.id,
            name: c.name,
            isActive: c.isActive,
            count: c._count.events,
          }))}
        />
        <CatalogPanel
          title="Festivals"
          kind="festival"
          rows={festivals.map((f) => ({
            id: f.id,
            name: f.name,
            isActive: f.isActive,
            count: f._count.events,
            meta: f.startsAt ? formatIstDate(f.startsAt) : undefined,
          }))}
        />
      </div>
    </div>
  );
}

function CatalogPanel({
  title,
  kind,
  rows,
}: {
  title: string;
  kind: "city" | "category" | "festival";
  rows: {
    id: string;
    name: string;
    isActive: boolean;
    count: number;
    meta?: string;
  }[];
}) {
  return (
    <section className="bg-surface border border-border rounded-[var(--radius-card)] p-4">
      <h2 className="text-[14px] font-extrabold mb-3">{title}</h2>
      <ul className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-3 border-b border-divider last:border-0 pb-2.5 last:pb-0"
          >
            <span className="min-w-0">
              <span
                className={
                  r.isActive
                    ? "text-[13px] font-bold block truncate"
                    : "text-[13px] font-bold block truncate text-ink-muted line-through"
                }
              >
                {r.name}
              </span>
              <span className="text-[11px] font-semibold text-ink-muted">
                {r.count} event{r.count === 1 ? "" : "s"}
                {r.meta && ` · ${r.meta}`}
              </span>
            </span>
            <CatalogToggle
              kind={kind}
              id={r.id}
              name={r.name}
              isActive={r.isActive}
              eventCount={r.count}
            />
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-[12.5px] font-semibold text-ink-muted">None.</li>
        )}
      </ul>
    </section>
  );
}
