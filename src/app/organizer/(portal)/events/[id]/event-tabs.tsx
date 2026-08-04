import { Tabs } from "@/components/ui";

/** The four views of one event. A server component — the active tab is known
 *  at render time from the route, so there is nothing to hydrate. */
export function EventTabs({
  eventId,
  active,
}: {
  eventId: string;
  active: "details" | "bookings" | "live" | "staff";
}) {
  const base = `/organizer/events/${eventId}`;
  return (
    <Tabs
      ariaLabel="Event sections"
      items={[
        { href: base, label: "Details", active: active === "details" },
        {
          href: `${base}/bookings`,
          label: "Bookings",
          active: active === "bookings",
        },
        { href: `${base}/live`, label: "Live board", active: active === "live" },
        { href: `${base}/staff`, label: "Staff", active: active === "staff" },
      ]}
    />
  );
}
