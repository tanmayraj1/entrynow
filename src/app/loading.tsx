import { TicketTearScreen } from "@/components/brand/ticket-tear";

/**
 * The root streaming fallback.
 *
 * Every page here is server-rendered against Postgres, so a cold serverless
 * invocation can spend a second on the query before any HTML exists. Without a
 * `loading.tsx` that second is a blank white tab and people press back.
 *
 * This one covers a hard navigation, before any surface's own layout has
 * streamed — so there is no header to sit under, and `chrome` stays 0. It is
 * the same ticket every other surface shows, deliberately: a reader who lands
 * on `/ahmedabad` cold and then clicks through should not see the waiting
 * state change shape underneath them.
 */
export default function Loading() {
  return (
    <div data-theme="market" className="bg-bg" aria-busy="true">
      <TicketTearScreen label="Finding tonight's events" />
    </div>
  );
}
