// A viewport the map can be dragged around in: hold the right mouse button and drag. The content is kept
// well inside the viewport. On each axis: a map that fits only drifts a little from the center (there's
// nothing more to see); a bigger one can be panned until each edge reaches the viewport's edge (plus a
// margin), never further.
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

/** Space (px) kept between a map bigger than the viewport and the viewport's edges. */
const MARGIN = 48;
/** How far (px) a map that fits in the viewport may drift from the center. */
const MAX_DRIFT = 120;

/** The allowed range of the content's offset on one axis (viewport size `view`, content size `size`). */
function axisRange(view: number, size: number): [number, number] {
  if (size + 2 * MARGIN <= view) {
    // Fits: stay near the center, never closer to an edge than the margin
    const center = (view - size) / 2, drift = Math.min(MAX_DRIFT, center - MARGIN);
    return [center - drift, center + drift];
  }
  return [view - size - MARGIN, MARGIN]; // bigger: show any part, but no edge further in than the margin
}
const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));

export default function PanView({ children, resetKey }: {
  children: ReactNode;
  /** Changes when a different map is shown (location, zone): the view recenters on it. */
  resetKey: string;
}) {
  const viewRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Offset of the content in the viewport; null until measured (then centered). Applied straight to the
  // DOM, so dragging doesn't re-render the map.
  const pan = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{ startX: number; startY: number; from: { x: number; y: number } } | null>(null);

  const sizes = () => {
    const v = viewRef.current!, c = contentRef.current!;
    return { vw: v.clientWidth, vh: v.clientHeight, cw: c.offsetWidth, ch: c.offsetHeight };
  };
  /** Move the content to (x, y), kept within bounds. */
  const place = (x: number, y: number) => {
    const { vw, vh, cw, ch } = sizes();
    pan.current = { x: clamp(x, axisRange(vw, cw)), y: clamp(y, axisRange(vh, ch)) };
    contentRef.current!.style.transform = `translate(${pan.current.x}px, ${pan.current.y}px)`;
  };
  const center = () => {
    const { vw, vh, cw, ch } = sizes();
    place((vw - cw) / 2, (vh - ch) / 2);
  };

  // Center on a new map; keep the view in bounds when the viewport or the map changes size
  useLayoutEffect(() => center(), [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ro = new ResizeObserver(() => (pan.current ? place(pan.current.x, pan.current.y) : center()));
    ro.observe(viewRef.current!);
    ro.observe(contentRef.current!);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={viewRef}
      className="relative h-full w-full overflow-hidden"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (e.button !== 2 || !pan.current) return;
        drag.current = { startX: e.clientX, startY: e.clientY, from: { ...pan.current } };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.style.cursor = 'grabbing';
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d) place(d.from.x + e.clientX - d.startX, d.from.y + e.clientY - d.startY);
      }}
      onPointerUp={(e) => {
        if (e.button !== 2 || !drag.current) return;
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        e.currentTarget.style.cursor = '';
      }}
      onPointerCancel={(e) => {
        drag.current = null;
        e.currentTarget.style.cursor = '';
      }}
    >
      <div ref={contentRef} className="absolute left-0 top-0 w-max">
        {children}
      </div>
    </div>
  );
}
