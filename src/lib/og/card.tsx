import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { headers } from "next/headers";
import { siteUrl } from "@/lib/site";

/**
 * The share card, rendered by Satori for every `opengraph-image` route.
 *
 * This is the image WhatsApp, iMessage, Slack, Discord, X and LinkedIn show
 * when someone pastes an Entry Now link. Before it existed those previews were
 * a line of grey text, which reads as a link someone is not sure about — the
 * single highest-leverage thing on a page nobody has visited yet.
 *
 * Satori is not a browser. It implements flexbox and a subset of CSS: no
 * `grid`, no `inset` shorthand, no React fragments, and every element with more
 * than one child needs an explicit `display: flex`. So the brand's real
 * `<Logo>` cannot be reused here — its mark is an SVG with `<defs>`, a gradient
 * `url(#id)` fill and a `<text>` node, none of which survive the translation.
 * The mark is therefore pre-rasterised (see `MARK`) and the wordmark is set as
 * type, which is the one part Satori does faithfully.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/**
 * Response headers for a generated card. Pass to `new ImageResponse(…, { headers })`.
 *
 * Reading `headers()` to resolve the cover photo's origin makes these routes
 * fully dynamic, so Next will not cache them — and the default that ships is
 * `must-revalidate`, meaning every crawler that touches a link re-renders the
 * card from scratch. The event card is 1.2MB and took ~4s cold; a scraper with
 * a short fuse gets nothing, and the sender sees a bare link.
 *
 * `max-age=0` keeps browsers honest while `s-maxage` lets the CDN answer, which
 * is the layer that matters: one render per event per day, and every share
 * after the first is served from the edge. `stale-while-revalidate` means a
 * card whose price has moved is refreshed in the background rather than making
 * someone wait for it.
 */
export const OG_CACHE_HEADERS = {
  "cache-control":
    "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
};

const BRAND_GRADIENT =
  "linear-gradient(100deg, #ff7a1f 0%, #f2454e 52%, #ed2c63 100%)";
const NAVY_DEEP = "#0e1a38";
const GOLD = "#f5b301";

/**
 * A full-bleed overlay layer.
 *
 * Spelled out rather than `inset: 0`, because Satori does not implement the
 * `inset` shorthand. A div positioned with it collapses to zero size and its
 * background paints nothing — which is invisible in every sense: the card
 * still renders, the build still passes, and the only symptom is that the
 * brand wash and the photo scrims are simply not there.
 */
const FILL = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  display: "flex",
} as const;

/**
 * Read at module scope, exactly as the Next docs prescribe.
 *
 * The literal `join(process.cwd(), …)` is the form Next's file tracer
 * recognises, so the two `.ttf` files are copied into the serverless bundle. A
 * computed path traces to nothing and fails only in production, where the
 * fallback is tofu boxes in a card nobody can re-render.
 *
 * The Latin subset is 63KB a weight against Satori's 500KB budget, and it was
 * checked for the glyphs this project actually renders — `₹` above all, plus
 * the en dash, em dash and curly apostrophe the copy is full of.
 */
const [semiBold, extraBold, markPng] = await Promise.all([
  readFile(join(process.cwd(), "src/lib/og/fonts/PlusJakartaSans-SemiBold.ttf")),
  readFile(join(process.cwd(), "src/lib/og/fonts/PlusJakartaSans-ExtraBold.ttf")),
  readFile(join(process.cwd(), "src/lib/og/mark.png")),
]);

/**
 * The ticket mark, pre-rasterised.
 *
 * The first version rebuilt the lockup out of flex boxes because Satori cannot
 * render the real `<Logo>` — its mark is an SVG with `<defs>`, a `url(#id)`
 * gradient fill and a `<text>` node, none of which survive the translation.
 * The boxes were a decent likeness and still the wrong answer: the share card
 * is the brand's most-seen surface, and it was showing an approximation of the
 * logo rather than the logo.
 *
 * A PNG sidesteps Satori entirely — it is drawn once from the same geometry as
 * `app/icon.svg` and simply placed. 11KB, well inside the budget.
 */
const MARK = `data:image/png;base64,${markPng.toString("base64")}`;

export const ogFonts = [
  {
    name: "Plus Jakarta Sans",
    data: semiBold as unknown as ArrayBuffer,
    weight: 600 as const,
    style: "normal" as const,
  },
  {
    name: "Plus Jakarta Sans",
    data: extraBold as unknown as ArrayBuffer,
    weight: 800 as const,
    style: "normal" as const,
  },
];

/**
 * Truncation happens here, in JS, not in CSS.
 *
 * Satori's `-webkit-line-clamp` support is partial and silently varies with
 * the element tree, and an overflowing title does not clip — it pushes the
 * rest of the card off the bottom edge. A hard character budget is ugly in
 * principle and correct in practice.
 */
function clamp(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function Lockup() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MARK} alt="" width={68} height={68} />
      <div
        style={{ display: "flex", fontSize: 40, fontWeight: 800, letterSpacing: -1.4 }}
      >
        <span style={{ color: "#ffffff" }}>entry</span>
        {/* Gradient text. Satori honours background-clip: text, and the
            transparent colour is what makes the clip visible — the same
            technique as the real wordmark. */}
        <span
          style={{
            backgroundImage: BRAND_GRADIENT,
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          now
        </span>
      </div>
    </div>
  );
}

export interface OgCardInput {
  /** Small gold line above the title — a city, a category, a date. */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Short strings rendered as pills along the bottom: date, venue, price. */
  meta?: string[];
  /**
   * Absolute URL of a background photograph. Anything that is not reachable
   * is skipped — see `fetchImage`.
   */
  image?: string;
}

/**
 * Absolute URL for one of *our own* static files, from the live request.
 *
 * `siteUrl()` is the wrong tool here and the failure is silent. It answers
 * "what is our public address" — the right answer for a canonical tag, and the
 * wrong one for a fetch the server makes to itself. The two differ whenever
 * the process is not reachable at its advertised address: a preview
 * deployment, a container behind a proxy, `next start -p 3111` while
 * `NEXT_PUBLIC_APP_URL` still says `:3000`. Each of those loses the cover photo
 * and falls back to the gradient card, with no error anywhere.
 *
 * The request's own `host` header cannot be wrong about where the request
 * arrived, so it wins; `siteUrl()` stays as the fallback for a context with no
 * request at all.
 */
async function selfUrl(path: string): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto =
        h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}${path}`;
    }
  } catch {
    // No request scope — a build-time render. Fall through.
  }
  return `${siteUrl()}${path}`;
}

/**
 * A ceiling on the cover photo, in bytes before base64.
 *
 * Generous, because these routes run on the Node runtime where the 500KB
 * figure in Satori's docs — an *edge bundle* limit — does not apply to an
 * image fetched at request time. It is still bounded: the whole card has to be
 * built, encoded and streamed inside a crawler's patience.
 */
const MAX_IMAGE_BYTES = 1_200_000;

/**
 * Will resvg decode this?
 *
 * It will not decode a **progressive** JPEG, and the way it declines is
 * expensive: the failure surfaces as `Input buffer contains unsupported image
 * format` while the response is already streaming, so the route dies with
 * "failed to pipe response" and the crawler gets a 500 — no card at all, which
 * is strictly worse than the gradient card with no photo.
 *
 * It cannot be caught around `new ImageResponse(…)` either, because it happens
 * during the pipe, after the constructor has returned. So the check is here,
 * on the bytes, before they are ever handed to the renderer.
 *
 * A JPEG declares its coding in its SOF marker: `C0`/`C1` are baseline and
 * extended-sequential, `C2` is progressive. The scan walks the segment chain
 * rather than searching for the byte pair, because `FF C2` occurs constantly
 * inside entropy-coded image data.
 */
function isDecodable(buf: Buffer): boolean {
  // PNG signature — always fine.
  if (buf.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    return true;
  }
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return false; // not a JPEG either

  let i = 2;
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) return false; // desynchronised — refuse rather than guess
    const marker = buf[i + 1];
    // Standalone markers carry no length payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    // Start Of Frame. C4 (Huffman tables), C8 and CC are not frame headers
    // despite sitting in the same range.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return marker === 0xc0 || marker === 0xc1;
    }
    if (marker === 0xda) return false; // reached scan data with no SOF
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return false;
}

/**
 * Fetch a cover photo as a data URI, or give up quietly.
 *
 * **Deliberately not routed through `/_next/image`.** Sending it through the
 * optimizer is the obvious way to shrink a 375KB photograph, and it breaks the
 * card: `next.config.ts` sets `formats: ["image/avif", "image/webp"]` so
 * content negotiation hands back AVIF, which resvg cannot read — and pinning
 * `Accept: image/jpeg` to avoid that returns a **progressive** JPEG, which
 * resvg also cannot read. The originals are baseline. Leave them alone.
 *
 * Every failure returns `undefined` rather than throwing, so a slow origin, a
 * 404, an oversized file or an undecodable one costs the photograph and not
 * the whole card.
 */
export async function fetchImage(path: string): Promise<string | undefined> {
  try {
    const url = path.startsWith("http") ? path : await selfUrl(path);

    const res = await fetch(url, {
      signal: AbortSignal.timeout(4000),
      // Next patches `fetch` with its Data Cache, and a cached *failure* here
      // is indistinguishable from a working card: the route keeps returning
      // the gradient fallback, byte for byte, across rebuilds. The image bytes
      // do not belong in that cache anyway — the rendered PNG is what gets
      // cached, one layer up.
      cache: "no-store",
    });
    if (!res.ok) return undefined;

    const type = res.headers.get("content-type") ?? "";
    if (!/^image\/(jpeg|png)$/.test(type)) return undefined;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_IMAGE_BYTES) return undefined;
    if (!isDecodable(buf)) return undefined;

    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

export function OgCard({ eyebrow, title, subtitle, meta, image }: OgCardInput) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        position: "relative",
        backgroundColor: NAVY_DEEP,
        fontFamily: "Plus Jakarta Sans",
        color: "#ffffff",
      }}
    >
      {image ? (
        // A real `<div>`, not a fragment.
        //
        // Satori does not flatten `<>…</>`: the whole group is dropped, with
        // no warning and no error. The symptom is a card that renders
        // perfectly except that the photograph and both scrims are missing,
        // which looks exactly like the image having failed to load — so the
        // hours go into the fetch, which was fine all along.
        <div style={FILL}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt=""
            width={OG_SIZE.width}
            height={OG_SIZE.height}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          {/* Two scrims, not one. A single flat overlay either washes the
              photograph out or leaves the text illegible against its bright
              patches; a strong left-to-right wedge protects the copy while the
              right third of the picture stays visible, and a bottom lift keeps
              the meta pills readable over a busy foreground. */}
          <div
            style={{
              ...FILL,
              backgroundImage:
                "linear-gradient(90deg, rgba(14,26,56,.94) 0%, rgba(14,26,56,.80) 46%, rgba(14,26,56,.34) 100%)",
            }}
          />
          <div
            style={{
              ...FILL,
              backgroundImage:
                "linear-gradient(0deg, rgba(14,26,56,.80) 0%, rgba(14,26,56,0) 42%)",
            }}
          />
        </div>
      ) : (
        // No photograph: a navy field with the brand gradient bled in from the
        // top-right corner, rather than a flat slab.
        //
        // Linear, not radial. Satori parses `radial-gradient` only in its
        // simplest forms — the sized-ellipse syntax
        // (`radial-gradient(900px 520px at 88% -12%, …)`) is dropped silently,
        // which is worse than an error: the card still renders, just flat, and
        // nothing in the build says so.
        <div
          style={{
            ...FILL,
            backgroundImage:
              "linear-gradient(215deg, rgba(255,122,31,.58) 0%, rgba(242,69,78,.42) 18%, rgba(237,44,99,.20) 34%, rgba(14,26,56,0) 56%)",
          }}
        />
      )}

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "58px 64px 64px 64px",
        }}
      >
        <Lockup />

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 900 }}>
          {eyebrow && (
            <div
              style={{
                display: "flex",
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: 2.6,
                textTransform: "uppercase",
                color: GOLD,
                marginBottom: 16,
              }}
            >
              {clamp(eyebrow, 46)}
            </div>
          )}
          <div
            style={{
              display: "flex",
              fontSize: title.length > 46 ? 62 : 76,
              fontWeight: 800,
              lineHeight: 1.06,
              letterSpacing: -2.2,
            }}
          >
            {clamp(title, 86)}
          </div>
          {subtitle && (
            <div
              style={{
                display: "flex",
                fontSize: 27,
                fontWeight: 600,
                lineHeight: 1.35,
                color: "rgba(255,255,255,.80)",
                marginTop: 18,
              }}
            >
              {clamp(subtitle, 118)}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: 12 }}>
            {(meta ?? []).slice(0, 3).map((m) => (
              <div
                key={m}
                style={{
                  display: "flex",
                  alignItems: "center",
                  fontSize: 23,
                  fontWeight: 800,
                  color: "#ffffff",
                  background: "rgba(255,255,255,.13)",
                  border: "1px solid rgba(255,255,255,.26)",
                  borderRadius: 999,
                  padding: "11px 24px",
                }}
              >
                {clamp(m, 30)}
              </div>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              fontWeight: 800,
              color: "rgba(255,255,255,.62)",
            }}
          >
            {new URL(siteUrl()).host}
          </div>
        </div>
      </div>

      {/* The gradient is reserved for action (D-019); on a share card the whole
          image is the call to action, so it earns one edge. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 12,
          display: "flex",
          backgroundImage: BRAND_GRADIENT,
        }}
      />
    </div>
  );
}
