"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { DashNav, type DashNavGroup } from "./dash-nav";
import { cn } from "@/lib/cn";

/**
 * The portal rail, in both its forms.
 *
 * Desktop: a fixed 232px column. Mobile: the same content in a slide-in drawer
 * behind a hamburger, because the portal's twelve destinations will not fit a
 * bottom tab bar the way the marketplace's five do.
 *
 * The hamburger belongs in the topbar, which is server-rendered content passed
 * in as `children` — so the open state lives in a context rather than being
 * lifted. `DashChrome` provides it, `DashMenuButton` consumes it, and the
 * server component between them never becomes a client component.
 *
 * The drawer closes on `pathname` change rather than in the link's `onClick`.
 * A click handler fires before the navigation resolves, so a slow route
 * transition would leave the user looking at a closed drawer and an unchanged
 * page, unsure whether the tap registered.
 */

/** `{ open, at }` — see the derivation note in `DashChrome`. */
type DrawerState = { open: boolean; at: string };

const DrawerCtx = React.createContext<{
  open: boolean;
  setDrawer: React.Dispatch<React.SetStateAction<DrawerState>>;
} | null>(null);

export function DashChrome({
  groups,
  onDark,
  footer,
  children,
}: {
  groups: DashNavGroup[];
  onDark: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Derived, not synchronised. The state records *which route* the drawer was
  // opened on, and it counts as open only while that is still the current
  // route — so a navigation closes it during render, with no effect, no
  // cascading re-render, and no frame in which the new page sits behind an
  // open drawer. `setDrawer` is a `useState` setter, so it is referentially
  // stable and never has to appear in a dependency list.
  const [drawer, setDrawer] = React.useState<DrawerState>({
    open: false,
    at: "",
  });
  const open = drawer.open && drawer.at === pathname;
  const close = () => setDrawer({ open: false, at: "" });

  // A drawer that scrolls the page behind it reads as broken.
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer({ open: false, at: "" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const ctx = React.useMemo(() => ({ open, setDrawer }), [open]);

  const rail = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-5">
        <Link href="/" aria-label="Entry Now — home">
          <Logo size="sm" onDark={onDark} />
        </Link>
      </div>
      <div className="px-3 grow overflow-y-auto">
        <DashNav groups={groups} onDark={onDark} />
      </div>
      {footer && (
        <div
          className={cn(
            "px-4 py-4 border-t",
            onDark ? "border-white/10" : "border-border",
          )}
        >
          {footer}
        </div>
      )}
    </div>
  );

  return (
    <DrawerCtx.Provider value={ctx}>
      <div className="flex grow min-h-0">
        <aside
          className={cn(
            "hidden lg:flex flex-col w-[232px] shrink-0 sticky top-0 h-screen",
            "bg-sidebar text-sidebar-ink",
            onDark ? "border-r border-white/10" : "border-r border-border",
          )}
        >
          {rail}
        </aside>
        {children}
      </div>

      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Close menu"
            onClick={close}
            className="absolute inset-0 bg-[rgba(10,18,38,.5)] cursor-default"
          />
          <div
            className={cn(
              "relative w-[264px] max-w-[82vw] h-full",
              "bg-sidebar text-sidebar-ink shadow-[var(--shadow-e4)]",
            )}
          >
            <button
              type="button"
              data-hit
              onClick={close}
              aria-label="Close menu"
              className={cn(
                "absolute top-4 right-3 z-10 cursor-pointer",
                onDark ? "text-white/70" : "text-ink-muted",
              )}
            >
              <X size={18} strokeWidth={2.4} />
            </button>
            {rail}
          </div>
        </div>
      )}
    </DrawerCtx.Provider>
  );
}

export function DashMenuButton() {
  const ctx = React.useContext(DrawerCtx);
  // Its own `usePathname`, called before any early return so the hook order is
  // unconditional. The value is the same one `DashChrome` derives against.
  const pathname = usePathname();
  if (!ctx) return null;
  return (
    <button
      type="button"
      data-hit
      onClick={() => ctx.setDrawer({ open: true, at: pathname })}
      aria-label="Open menu"
      aria-expanded={ctx.open}
      className={cn(
        "lg:hidden inline-grid place-items-center size-9 shrink-0",
        "rounded-[10px] border border-border text-ink cursor-pointer",
        "hover:bg-divider transition-colors",
      )}
    >
      <Menu size={17} strokeWidth={2.4} />
    </button>
  );
}
