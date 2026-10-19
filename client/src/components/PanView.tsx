// A viewport the map can be dragged around in: hold the right mouse button and drag. The content is kept
// within the area the HUD leaves free (insets). On each axis: a map that fits there only drifts a little
// from its centre (there's nothing more to see); a bigger one can be panned until each edge is a margin
// past the free area's edge, never further.
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

/** How far (px) a map bigger than the free area may pass its edge (or must stay inside it, if it fits). */
const MARGIN = 48;
/** How far (px) a map that fits may drift from the centre. */
const MAX_DRIFT = 120;

/** Space the screen's HUD covers along each edge (px): the map is kept within the rest. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * The allowed range of the content's offset on one axis: viewport size `view`, content size `size`, and
 * the HUD's insets at the start (`a`) and end (`b`) of the axis. Measured within the inner area.
 */
function axisRange(view: number, size: number, a: number, b: number): [number, number] {
  const inner = view - a - b;
  if (size + 2 * MARGIN <= inner) {
    // Fits: stay near the inner area's centre, never closer to its edges than the margin
    const center = a + (inner - size) / 2, drift = Math.min(MAX_DRIFT, (inner - size) / 2 - MARGIN);
    return [center - drift, center + drift];
  }
  // Bigger: show any part, but no edge further in than a margin past the inner area's edge
  return [view - b - size - MARGIN, a + MARGIN];
}
const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));

export default function PanView({ children, resetKey, insets = NO_INSETS }: {
  children: ReactNode;
  /** Changes when a different map is shown (location, zone): the view recenters on it. */
  resetKey: string;
  /** Space covered by HUD along each edge: the map centres in, and pans little past, the area inside it. */
  insets?: Insets;
}) {
  const insetsRef = useRef(insets);
  insetsRef.current = insets;
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
    const ins = insetsRef.current;
    pan.current = { x: clamp(x, axisRange(vw, cw, ins.left, ins.right)), y: clamp(y, axisRange(vh, ch, ins.top, ins.bottom)) };
    contentRef.current!.style.transform = `translate(${pan.current.x}px, ${pan.current.y}px)`;
  };
  const center = () => {
    const { vw, vh, cw, ch } = sizes();
    const ins = insetsRef.current;
    place(ins.left + (vw - ins.left - ins.right - cw) / 2, ins.top + (vh - ins.top - ins.bottom - ch) / 2);
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
