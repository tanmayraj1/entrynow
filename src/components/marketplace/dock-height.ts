/**
 * Height the sticky mobile dock occupies, in px.
 *
 * It lives in its own module — not in `mobile-dock.tsx` — because
 * `MarketplaceShell` is a **server** component and needs this number to pad the
 * page out from under the dock. Importing a value from a `"use client"` module
 * into a server component does not give you the value: the bundler substitutes
 * a client reference, and interpolating that into a template literal silently
 * produces `padding-bottom: var(--dock-pad, function() {…}px)`, which the
 * browser drops as invalid. The result was no padding at all, so the dock sat
 * on top of the last 56px of every mobile page — the exact thing the padding
 * exists to prevent, failing silently with no error anywhere.
 */
export const DOCK_HEIGHT_PX = 56;
