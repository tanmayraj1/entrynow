"use client";

import * as React from "react";

/**
 * Register the scanner's service worker.
 *
 * Scoped to `/scan`, so nothing on the marketplace is ever served from its
 * cache — a stale event listing would be a real bug, and the shop has no need
 * to work offline.
 *
 * Failure is silent by design. A browser with service workers disabled, or a
 * page served over plain HTTP in development, still gets a fully working
 * online scanner; it just loses the offline shell. Throwing here would break
 * the gate for a capability it does not strictly need.
 */
export function ScannerRegistration() {
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/scan-sw.js", { scope: "/scan" })
      .catch(() => {});
  }, []);

  return null;
}
