/**
 * The scanner's home-screen icon.
 *
 * Drawn rather than shipped as a raster so it stays crisp at every launcher
 * size, and deliberately distinct from the marketplace mark: a staff member
 * with both installed must be able to tell the gate app from the shop on a
 * cluttered home screen. Mint on navy — the scanner's own palette, and
 * "maskable", so Android's circular crop does not clip the reticle.
 */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="42" fill="#0a1226"/>
  <g fill="none" stroke="#2bd4a7" stroke-width="9" stroke-linecap="round">
    <path d="M56 74V62a6 6 0 0 1 6-6h12"/>
    <path d="M118 56h12a6 6 0 0 1 6 6v12"/>
    <path d="M136 118v12a6 6 0 0 1-6 6h-12"/>
    <path d="M74 136H62a6 6 0 0 1-6-6v-12"/>
  </g>
  <rect x="52" y="92" width="88" height="8" rx="4" fill="#2bd4a7" opacity=".95"/>
</svg>`;

export function GET() {
  return new Response(SVG, {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=86400, immutable",
    },
  });
}
