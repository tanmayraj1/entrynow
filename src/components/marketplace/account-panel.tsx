import { EmptyStateArt, GlyphMedallion } from "@/components/brand/illustrations";
export function AccountPanel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface border border-border rounded-[18px] p-5 md:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h1 className="text-[20px] tracking-[-0.4px]">{title}</h1>
          {description && (
            <p className="text-[13px] text-ink-muted font-semibold mt-1 max-w-xl">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Consistent per-section empty state — never a blank panel. */
export function PanelEmpty({
  icon,
  title,
  body,
}: {
  /** A lucide icon. Omit for the default illustrated stub. */
  icon?: React.ComponentType<{
    size?: number;
    strokeWidth?: number;
    className?: string;
  }>;
  title: string;
  body?: string;
}) {
  return (
    <div className="py-9 text-center flex flex-col items-center gap-2.5">
      {icon ? (
        <GlyphMedallion icon={icon} size={54} />
      ) : (
        <EmptyStateArt className="w-[128px] h-[96px]" />
      )}
      <p className="text-[14px] font-extrabold">{title}</p>
      {body && (
        <p className="text-[12.5px] text-ink-muted font-semibold max-w-sm">
          {body}
        </p>
      )}
    </div>
  );
}
