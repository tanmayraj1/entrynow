import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/rbac";
import { listConfig } from "@/lib/queries/admin/queries";
import { DEFAULT_BUSINESS_CONFIG } from "@/lib/config";
import { formatIstDate } from "@/lib/ist";
import { ConfigRow } from "./config-forms";

export const metadata: Metadata = { title: "Config" };

/**
 * Business constants (spec A3), editable without a deploy.
 *
 * The literals in `DEFAULT_BUSINESS_CONFIG` are the fallback, not the source of
 * truth — so this page lists every key the app *reads*, whether or not a row
 * exists for it. A key that only appeared once someone had overridden it would
 * hide exactly the settings nobody has looked at yet.
 */
export default async function AdminConfigPage() {
  await requireAdmin("SUPER");
  const stored = await listConfig();
  const byKey = new Map(stored.map((s) => [s.key, s]));

  const keys = Object.keys(DEFAULT_BUSINESS_CONFIG) as (keyof typeof DEFAULT_BUSINESS_CONFIG)[];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[20px] font-extrabold leading-tight">
          Business config
        </h1>
        <p className="text-[12.5px] font-semibold text-ink-muted mt-1">
          Money values are in <strong>paise</strong>, not rupees — 4999 rupees is
          499900. Percentages are plain numbers: 8 means 8%. Changes take effect
          on the next booking; anything already sold keeps the rate it was
          snapshotted with.
        </p>
      </div>

      <div className="bg-surface border border-border rounded-[var(--radius-card)] divide-y divide-divider">
        {keys.map((key) => {
          const row = byKey.get(key);
          return (
            <ConfigRow
              key={key}
              configKey={key}
              value={row ? JSON.stringify(row.value) : String(DEFAULT_BUSINESS_CONFIG[key])}
              isDefault={!row}
              updatedAt={row ? formatIstDate(row.updatedAt) : null}
            />
          );
        })}
      </div>
    </div>
  );
}
