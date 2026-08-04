"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  boundsForViewport,
  project,
  unproject,
  TILE_SIZE,
  clampLat,
  type Bounds,
  type LatLng,
} from "@/lib/geo";

/**
 * A raster slippy map — pan, zoom, and absolutely-positioned children.
 *
 * Hand-rolled rather than pulled from a mapping library: the whole projection
 * is in `src/lib/geo.ts`, the tiles are plain `<img>` elements, and the pins
 * are ordinary DOM so they inherit the design tokens and stay keyboard
 * reachable. A library would add ~150 kB, its own CSS reset, and a second
 * source of truth for coordinates the server also has to compute (D-016).
 *
 * Zoom is integer-only. Fractional zoom means scaling the tile layer between
 * levels, which buys smoothness we do not need for a locator and costs a
 * second projection path that can disagree with the server's bbox.
 */

export interface MapViewport {
  center: LatLng;
  zoom: number;
}

export interface MapRenderContext {
  /** lat/lng -> pixel offset within the map box. */
  toPoint: (p: LatLng) => { left: number; top: number };
  /** Pixels per km at the current centre — for drawing a radius. */
  pixelsPerKm: number;
  width: number;
  height: number;
  zoom: number;
}

const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ??
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? "© OpenStreetMap contributors";

/** Movement below this is a click, not a drag — so pins stay clickable. */
const DRAG_THRESHOLD_PX = 4;
/** Long enough that a flick of the wrist is one refetch, not eight. */
const IDLE_DELAY_MS = 350;

export function TileMap({
  viewport,
  onViewportChange,
  onIdle,
  minZoom = 9,
  maxZoom = 18,
  ariaLabel,
  className,
  children,
  overlay,
}: {
  viewport: MapViewport;
  onViewportChange: (v: MapViewport) => void;
  /** Fired once movement settles — the moment to refetch pins. */
  onIdle?: (v: MapViewport, bounds: Bounds) => void;
  minZoom?: number;
  maxZoom?: number;
  ariaLabel: string;
  className?: string;
  children?: (ctx: MapRenderContext) => ReactNode;
  /** Chrome drawn above the map but outside the panning layer. */
  overlay?: ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const [showZoomHint, setShowZoomHint] = useState(false);

  // Latest-value refs, so the wheel and idle effects never re-subscribe on
  // every viewport tick. Synced in an effect rather than during render, and
  // declared first so later effects in this component see fresh values.
  const viewportRef = useRef(viewport);
  const onViewportChangeRef = useRef(onViewportChange);
  const onIdleRef = useRef(onIdle);
  useEffect(() => {
    viewportRef.current = viewport;
    onViewportChangeRef.current = onViewportChange;
    onIdleRef.current = onIdle;
  });

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.round(width), height: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { width, height } = size;
  const { zoom } = viewport;

  // World-pixel coordinate of the map box's top-left corner.
  const centerPx = project(viewport.center, zoom);
  const originX = centerPx.x - width / 2;
  const originY = centerPx.y - height / 2;

  const toPoint = useCallback(
    (p: LatLng) => {
      const px = project(p, zoom);
      return { left: px.x - originX, top: px.y - originY };
    },
    [zoom, originX, originY],
  );

  const setZoom = useCallback(
    (next: number, anchor?: { x: number; y: number }) => {
      const vp = viewportRef.current;
      const z = Math.max(minZoom, Math.min(maxZoom, next));
      if (z === vp.zoom) return;

      // Zoom about the pointer when there is one, so the place under the
      // cursor stays under the cursor.
      if (anchor && width && height) {
        const c = project(vp.center, vp.zoom);
        const world = {
          x: c.x - width / 2 + anchor.x,
          y: c.y - height / 2 + anchor.y,
        };
        const scale = 2 ** (z - vp.zoom);
        const newWorld = { x: world.x * scale, y: world.y * scale };
        const newCenterPx = {
          x: newWorld.x - (anchor.x - width / 2),
          y: newWorld.y - (anchor.y - height / 2),
        };
        onViewportChangeRef.current({
          center: unproject(newCenterPx.x, newCenterPx.y, z),
          zoom: z,
        });
        return;
      }
      onViewportChangeRef.current({ center: vp.center, zoom: z });
    },
    [minZoom, maxZoom, width, height],
  );

  /**
   * Wheel zoom requires a modifier, and a plain scroll is left alone.
   *
   * A map that swallows the wheel traps the reader: they scroll to get past it
   * and the page stays put while the map zooms out to the Arabian Sea. Ctrl /
   * ⌘ + wheel zooms — which is also what a trackpad pinch sends, so pinch-to-
   * zoom still works — and everything else scrolls the page.
   *
   * Native and non-passive because React attaches wheel handlers passively, so
   * `preventDefault` in an onWheel prop is ignored.
   */
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    let cooling = false;
    let hintTimer: ReturnType<typeof setTimeout> | undefined;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        // Let the page scroll. Say why, once, so the zoom is discoverable.
        setShowZoomHint(true);
        clearTimeout(hintTimer);
        hintTimer = setTimeout(() => setShowZoomHint(false), 1400);
        return;
      }
      e.preventDefault();
      setShowZoomHint(false);
      if (cooling) return;
      cooling = true;
      setTimeout(() => (cooling = false), 120);
      const rect = el.getBoundingClientRect();
      setZoom(viewportRef.current.zoom + (e.deltaY < 0 ? 1 : -1), {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      clearTimeout(hintTimer);
    };
  }, [setZoom]);

  // Debounced idle. Fires for programmatic recentres too — a search that jumps
  // the map should refetch exactly like a drag does.
  useEffect(() => {
    if (!width || !height || !onIdleRef.current) return;
    const t = setTimeout(() => {
      onIdleRef.current?.(
        viewportRef.current,
        boundsForViewport(viewportRef.current.center, zoom, width, height),
      );
    }, IDLE_DELAY_MS);
    return () => clearTimeout(t);
  }, [viewport.center.lat, viewport.center.lng, zoom, width, height]);

  // ------------------------------------------------------------------ drag
  const drag = useRef<{
    pointerId: number;
    pointerType: string;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
    /** Handed back to the browser as a page scroll. */
    rejected: boolean;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    // A pin, a popover or a control owns its own gestures.
    if ((e.target as HTMLElement).closest("[data-map-static]")) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    drag.current = {
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
      rejected: false,
    };
    // Capture is claimed on first real movement, not here: capturing up front
    // steals a touch the browser was about to turn into a page scroll.
    if (e.pointerType === "mouse") {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId || d.rejected) return;
    const dx = e.clientX - d.lastX;
    const dy = e.clientY - d.lastY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

    if (!d.moved) {
      // On touch, a mostly-vertical swipe is the reader scrolling the page
      // past the map, not panning it. `touch-action: pan-y` lets the browser
      // take it; bailing out here stops us fighting it for the same gesture.
      if (d.pointerType === "touch") {
        const totalX = Math.abs(e.clientX - d.startX);
        const totalY = Math.abs(e.clientY - d.startY);
        if (totalY > totalX) {
          d.rejected = true;
          return;
        }
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
      d.moved = true;
      setDragging(true);
    }
    d.lastX = e.clientX;
    d.lastY = e.clientY;

    const vp = viewportRef.current;
    const c = project(vp.center, vp.zoom);
    onViewportChangeRef.current({
      center: unproject(c.x - dx, c.y - dy, vp.zoom),
      zoom: vp.zoom,
    });
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = 90;
    const vp = viewportRef.current;
    const c = project(vp.center, vp.zoom);
    const pan = (dx: number, dy: number) => {
      e.preventDefault();
      onViewportChangeRef.current({
        center: unproject(c.x + dx, c.y + dy, vp.zoom),
        zoom: vp.zoom,
      });
    };
    switch (e.key) {
      case "ArrowLeft": return pan(-step, 0);
      case "ArrowRight": return pan(step, 0);
      case "ArrowUp": return pan(0, -step);
      case "ArrowDown": return pan(0, step);
      case "+":
      case "=": e.preventDefault(); return setZoom(vp.zoom + 1);
      case "-": e.preventDefault(); return setZoom(vp.zoom - 1);
    }
  };

  // ----------------------------------------------------------------- tiles
  const tiles: { key: string; url: string; left: number; top: number }[] = [];
  if (width && height) {
    const n = 2 ** zoom;
    const minTx = Math.floor(originX / TILE_SIZE);
    const maxTx = Math.floor((originX + width) / TILE_SIZE);
    const minTy = Math.floor(originY / TILE_SIZE);
    const maxTy = Math.floor((originY + height) / TILE_SIZE);
    for (let ty = minTy; ty <= maxTy; ty++) {
      // Above the north pole or below the south there is no tile to ask for.
      if (ty < 0 || ty >= n) continue;
      for (let tx = minTx; tx <= maxTx; tx++) {
        const wrapped = ((tx % n) + n) % n; // the world repeats east-west
        tiles.push({
          key: `${zoom}/${tx}/${ty}`,
          url: TILE_URL.replace("{z}", String(zoom))
            .replace("{x}", String(wrapped))
            .replace("{y}", String(ty)),
          left: tx * TILE_SIZE - originX,
          top: ty * TILE_SIZE - originY,
        });
      }
    }
  }

  const pixelsPerKm =
    (TILE_SIZE * 2 ** zoom) / (40_075.017 * Math.cos((clampLat(viewport.center.lat) * Math.PI) / 180));

  return (
    <div
      ref={boxRef}
      role="application"
      aria-label={ariaLabel}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      className={cn(
        // `touch-pan-y`, never `touch-none`: the reader must always be able to
        // swipe past the map to reach the page below it.
        "relative overflow-hidden bg-[#eceef4] touch-pan-y select-none outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
        dragging ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
    >
      {/* Tiles. Not next/image: these are third-party, already 256px, and
          cached by the browser — the optimiser would only add a hop. */}
      <div aria-hidden className="absolute inset-0">
        {tiles.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={t.key}
            src={t.url}
            alt=""
            width={TILE_SIZE}
            height={TILE_SIZE}
            draggable={false}
            // NOT lazy: tiles are absolutely positioned inside a box that is
            // often below the fold, and a lazy tile that never enters the
            // intersection observer's view leaves a hole in the map.
            className="absolute max-w-none"
            style={{ left: t.left, top: t.top }}
          />
        ))}
      </div>

      {width > 0 && children?.({ toPoint, pixelsPerKm, width, height, zoom })}

      {overlay}

      {/* Shown only when a plain wheel scroll passed through, so the modifier
          is discoverable at the moment it would have been useful. */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 z-40 grid place-items-center pointer-events-none",
          "bg-[rgba(14,26,56,.42)] transition-opacity duration-200",
          showZoomHint ? "opacity-100" : "opacity-0",
        )}
      >
        <span className="rounded-full bg-white/95 px-4 py-2 text-[13px] font-bold text-ink shadow-[var(--shadow-e3)]">
          Hold {modifierLabel()} and scroll to zoom
        </span>
      </div>

      {/* Zoom controls */}
      <div
        data-map-static
        className="absolute right-3 bottom-9 z-30 flex flex-col rounded-[10px] overflow-hidden border border-border bg-surface shadow-[0_4px_14px_rgba(22,48,43,.18)]"
      >
        <button
          type="button"
          onClick={() => setZoom(viewport.zoom + 1)}
          disabled={viewport.zoom >= maxZoom}
          aria-label="Zoom in"
          className="size-8 grid place-items-center text-ink hover:bg-primary-tint disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Plus size={15} strokeWidth={2.6} />
        </button>
        <span aria-hidden className="h-px bg-border" />
        <button
          type="button"
          onClick={() => setZoom(viewport.zoom - 1)}
          disabled={viewport.zoom <= minZoom}
          aria-label="Zoom out"
          className="size-8 grid place-items-center text-ink hover:bg-primary-tint disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Minus size={15} strokeWidth={2.6} />
        </button>
      </div>

      {/* Attribution — required by every raster tile provider. */}
      <div
        data-map-static
        className="absolute right-0 bottom-0 z-30 bg-white/85 text-[9.5px] text-ink-muted px-1.5 py-0.5 rounded-tl-[6px] font-semibold"
      >
        {TILE_ATTRIBUTION}
      </div>
    </div>
  );
}

/**
 * "⌘" on a Mac, "Ctrl" everywhere else.
 *
 * Read at call time rather than module scope: `navigator` does not exist
 * during the server render, and the hint is only ever shown after a real
 * wheel event, so by then it does.
 */
function modifierLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl";
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";
}
