import { TicketTearScreen } from "@/components/brand/ticket-tear";

/** Admin portal fallback — the platform aggregates it waits on are the
 *  slowest queries in the app, so this is the one people see most. */
export default function Loading() {
  return <TicketTearScreen label="Loading the platform" />;
}
