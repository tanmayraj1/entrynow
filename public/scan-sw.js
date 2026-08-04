/**
 * The gate scanner's service worker.
 *
 * Scope is `/scan` only, registered by `ScannerRegistration` — nothing on the
 * marketplace is cached by it. Its whole job is to make sure that when the
 * signal dies at 8:30 PM in a field with 8,000 people, opening the app still
 * gives you a working viewfinder rather than the browser's dinosaur.
 *
 * Two caching rules, and the split matters:
 *
 *   - **The shell is cache-first.** HTML, JS and CSS for /scan change on
 *     deploy, not during an event, and a stale-but-working scanner beats a
 *     network round trip at the door.
 *   - **Every /api/scan call is network-only.** Never cached, never replayed
 *     from cache. A cached VALID would admit the same person twice and a
 *     cached manifest would hide a cancellation. The app's own IndexedDB queue
 *     is the offline story for scans — not this cache.
 */

const CACHE = "entrynow-scan-v1";
const SHELL = ["/scan", "/scan/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // `addAll` rejects the whole batch if any one URL fails, which would
      // leave no cache at all. Individually, a miss costs one entry.
      .then((cache) => Promise.allSettled(SHELL.map((u) => cache.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/scan")) return;

  // Scan traffic is never served from cache — see the note above.
  if (url.pathname.startsWith("/api/scan")) return;

  event.respondWith(
    caches.match(request).then((hit) => {
      // Serve the cached copy immediately, then refresh it in the background
      // so the next launch is current without ever blocking this one.
      const fetching = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => hit);

      return hit || fetching;
    }),
  );
});
