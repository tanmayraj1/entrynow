import { TicketTearScreen } from "@/components/brand/ticket-tear";

/** Organizer portal fallback — renders inside DashShell, so it is already
 *  themed `dash-organizer` and keeps the sidebar visible while it waits. */
export default function Loading() {
  return <TicketTearScreen label="Loading your events" />;
}
