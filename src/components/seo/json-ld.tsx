/**
 * A `<script type="application/ld+json">` block.
 *
 * `<` is escaped to `<` before the JSON reaches the DOM. That single
 * substitution is what stops an event title, a venue name or an organizer's
 * bio — all of them user-supplied through the portal — from closing the script
 * tag early and running as markup. `JSON.stringify` alone does not do it: it
 * escapes quotes and backslashes, not angle brackets, so `</script>` inside a
 * string survives intact.
 *
 * `dangerouslySetInnerHTML` is required rather than sloppy: React would
 * HTML-escape a text child, and `&quot;` inside a JSON-LD block is a parse
 * error, not a quote.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
