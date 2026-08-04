import { TicketTearScreen } from "@/components/brand/ticket-tear";

/**
 * Fallback for navigation *within* a city — home → events → an event page.
 *
 * It has to live here rather than only at the group root. `(marketplace)` is a
 * route group with no layout of its own, so a `loading.tsx` there sits *above*
 * `[city]/layout.tsx`: it replaces the header, the footer and the mobile dock
 * for as long as it shows. That is right for a cold arrival, when none of that
 * chrome is on screen yet, and wrong for every click after — the nav should not
 * vanish because a listing is being fetched.
 *
 * Being inside the shell, this one inherits `--tear-chrome` and centres in the
 * space between the header and the dock instead of the whole viewport.
 */
export default function Loading() {
  return <TicketTearScreen label="Finding tonight's events" />;
}
