"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

/**
 * Search suggestions overlay. Wraps its own trigger so the header stays a
 * server component.
 *
 * Suggestions come from a debounced hit on /api/search; the ESC-to-close and
 * Cmd-K affordances match the prototype.
 */

interface Suggestion {
  kind: "Event" | "Category" | "Organizer" | "Near me";
  label: string;
  href: string;
  glyph: string;
}

export function SearchOverlayTrigger({
  citySlug,
  children,
}: {
  citySlug: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        aria-label="Search"
        onClick={() => setOpen(true)}
        className="cursor-pointer"
      >
        {children}
      </button>
      {open && (
        <SearchOverlay citySlug={citySlug} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function SearchOverlay({
  citySlug,
  onClose,
}: {
  citySlug: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const q = query.trim();
    const ac = new AbortController();
    // Everything, including the clear, happens inside the timeout — setting
    // state synchronously in an effect body triggers a cascading render.
    const t = setTimeout(async () => {
      if (q.length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(
          `/api/search?city=${citySlug}&q=${encodeURIComponent(q)}`,
          { signal: ac.signal },
        );
        if (res.ok) setResults((await res.json()).results ?? []);
      } catch {
        // Aborted by the next keystroke — not an error worth surfacing.
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [query, citySlug]);

  const trending = [
    { label: "Navratri 2026", href: `/${citySlug}/festivals/navratri-2026` },
    { label: "This weekend", href: `/${citySlug}/events?when=weekend` },
    { label: "Near me", href: `/${citySlug}/events?near=1` },
  ];

  /** Highlight the matched substring, as the prototype does. */
  function highlight(label: string) {
    const q = query.trim();
    const i = label.toLowerCase().indexOf(q.toLowerCase());
    if (q.length < 2 || i === -1) return label;
    return (
      <>
        {label.slice(0, i)}
        <b className="text-primary">{label.slice(i, i + q.length)}</b>
        {label.slice(i + q.length)}
      </>
    );
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-[100] bg-[rgba(14,26,56,.55)] flex items-start justify-center pt-[88px] md:pt-[100px] px-4"
    >
      <div className="bg-surface rounded-[20px] w-full max-w-[640px] overflow-hidden shadow-[var(--shadow-modal)]">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-divider">
          <Search size={18} strokeWidth={2.4} className="text-primary shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) {
                router.push(
                  `/${citySlug}/events?q=${encodeURIComponent(query.trim())}`,
                );
                onClose();
              }
            }}
            aria-label="Search events, artists, organizers and venues"
            placeholder="Event, artist, organizer or venue…"
            className="flex-1 border-none outline-none text-[16px] font-semibold text-ink bg-transparent placeholder:text-ink-muted"
          />
          {/* A real button, not a decorative <kbd>. The Escape KEY always
              worked (there is a window listener above) — but the badge that
              advertised it was inert, and on a phone there is no Escape key at
              all, so the overlay had no visible way out on the device most
              people use. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="shrink-0 flex items-center gap-1.5 text-ink-muted hover:text-ink cursor-pointer"
          >
            <span className="hidden sm:inline text-[10.5px] font-extrabold bg-bg border border-border rounded-[7px] px-2 py-1">
              ESC
            </span>
            <X size={20} strokeWidth={2.2} className="sm:hidden" />
          </button>
        </div>

        <div className="py-2 max-h-[46vh] overflow-y-auto">
          {results.map((s) => (
            <a
              key={`${s.kind}-${s.href}`}
              href={s.href}
              className="flex items-center gap-3.5 px-5 py-2.5 text-ink hover:bg-selected-bg"
            >
              <span className="size-[34px] shrink-0 rounded-[10px] bg-primary-tint text-primary-dark grid place-items-center text-[13px] font-extrabold">
                {s.glyph}
              </span>
              <span className="flex-1 text-[14px] font-semibold">
                {highlight(s.label)}
              </span>
              <span className="text-[10.5px] font-extrabold text-ink-muted bg-bg border border-border rounded-full px-2.5 py-1">
                {s.kind}
              </span>
            </a>
          ))}

          {query.trim().length >= 2 && !loading && results.length === 0 && (
            <p className="px-5 py-6 text-[13px] font-semibold text-ink-muted text-center">
              Nothing matches “{query.trim()}” yet. Try a category, or browse all
              events.
            </p>
          )}
          {query.trim().length < 2 && (
            <p className="px-5 py-6 text-[13px] font-semibold text-ink-muted text-center">
              Type at least two characters to search.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-3.5 border-t border-divider flex-wrap">
          <span className="text-[11px] font-extrabold text-ink-muted tracking-[0.06em]">
            TRENDING
          </span>
          {trending.map((t) => (
            <a
              key={t.href}
              href={t.href}
              className="text-[12px] font-bold bg-primary-tint text-primary-dark rounded-full px-3.5 py-1.5"
            >
              {t.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
