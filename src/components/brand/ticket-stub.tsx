import { cn } from "@/lib/cn";

/**
 * The ticket stub — Entry Now's most important object, so it is built rather
 * than styled as a rectangle.
 *
 * Depth comes from five stacked cues, in order of how much they matter:
 *
 *   1. the notch, punched by a radial-gradient mask on both edges, so the
 *      silhouette itself is a ticket rather than a card with a dashed line;
 *   2. a real perforation between the body and the stub;
 *   3. a foil band in the brand gradient down the leading edge;
 *   4. a layered shadow (`--shadow-ticket`) with an inset highlight, which is
 *      what makes it read as printed stock rather than a flat surface;
 *   5. paper grain at 3% — invisible named, but the difference between "screen"
 *      and "printed".
 *
 * The notch is a mask, not two absolutely-positioned circles: circles have to
 * match the page background, so they break the moment the stub is dropped on a
 * gradient, an image, or the scanner's navy.
 */

export function TicketStub({
  children,
  stub,
  tone = "light",
  className,
}: {
  /** The body — event, date, seat. */
  children: React.ReactNode;
  /** The tear-off: QR, ticket number, a status. Omit for a single-panel stub. */
  stub?: React.ReactNode;
  tone?: "light" | "navy";
  className?: string;
}) {
  const navy = tone === "navy";

  return (
    <div
      className={cn(
        "relative isolate flex overflow-hidden",
        "rounded-[18px]",
        navy ? "text-white" : "text-ink",
        className,
      )}
      style={{
        // The notch. Two radial gradients punch transparent half-circles out
        // of the ticket's own background at the tear line's height.
        WebkitMaskImage: NOTCH_MASK,
        maskImage: NOTCH_MASK,
        WebkitMaskComposite: "source-in",
        maskComposite: "intersect",
        background: navy
          ? "linear-gradient(160deg,#16264c,#0e1a38)"
          : "var(--color-surface)",
        boxShadow: "var(--shadow-ticket)",
      }}
    >
      {/* Foil edge — the gradient from the logo's torn half. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[6px] z-10"
        style={{ background: "var(--brand-gradient)" }}
      />

      {/* Paper grain. Deliberately faint: at 3% it is felt, not seen. */}
      <span
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.035] mix-blend-multiply"
        style={{ backgroundImage: GRAIN, backgroundSize: "128px 128px" }}
      />

      {/* Hairline border, drawn inside the mask so the notch stays clean. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 rounded-[18px] pointer-events-none",
          navy ? "ring-1 ring-inset ring-white/10" : "ring-1 ring-inset ring-border",
        )}
      />

      <div className="relative flex-1 min-w-0 pl-[18px]">{children}</div>

      {stub && (
        <>
          {/* Perforation — sits exactly between the two notches. */}
          <span
            aria-hidden
            className={cn(
              "relative w-px shrink-0 my-4",
              navy ? "bg-white/25" : "bg-border-strong",
            )}
            style={{
              maskImage:
                "repeating-linear-gradient(to bottom, #000 0 5px, transparent 5px 10px)",
              WebkitMaskImage:
                "repeating-linear-gradient(to bottom, #000 0 5px, transparent 5px 10px)",
            }}
          />
          <div className="relative shrink-0">{stub}</div>
        </>
      )}
    </div>
  );
}

/**
 * A stub with no tear-off, for list rows. Same silhouette and shadow, one
 * panel — so a ticket in a list and a ticket on its own page are recognisably
 * the same object.
 */
export function TicketRow({
  children,
  className,
  tone = "light",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "light" | "navy";
}) {
  return (
    <TicketStub tone={tone} className={className}>
      {children}
    </TicketStub>
  );
}

/** Notches at 50% height, 11px radius, punched from both edges. */
const NOTCH_MASK = [
  "radial-gradient(circle 11px at 0% 50%, transparent 99%, #000 100%)",
  "radial-gradient(circle 11px at 100% 50%, transparent 99%, #000 100%)",
].join(",");

/** Feature-size noise as an inline SVG turbulence — no asset request. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='128' height='128' filter='url(%23n)'/%3E%3C/svg%3E\")";
