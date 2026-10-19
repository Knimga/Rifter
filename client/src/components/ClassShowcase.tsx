// The class models of character select, drawn on one WebGL canvas laid over the class columns. Each column
// marks where its model goes with `data-showcase-slot="<classKey>"`; models stand facing the viewer, spin
// while their column is hovered or focused, grow when focused, and dim when another class is focused.
// Lazy-loaded (it pulls in three.js).
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type { ClassKey } from '../data/classes';
import { startingGear } from '../data/party';
import { characterModel, heldGear } from './characterModel';
import { SHOWCASE_SPIN_MS, ShowcaseRenderer } from '../viewEngine/three/showcase';
import type { Model } from '../forge/core/types';

export interface ShowcaseItem {
  classKey: ClassKey;
  /** Spinning (hovered or focused). */
  active: boolean;
  focused: boolean;
  dim: boolean;
}

/** How fast a model eases to its size (ms, roughly). */
const EASE_MS = 120;
/** Model size: hovered grows noticeably, focused grows most. */
const scaleFor = (it: ShowcaseItem) => (it.focused ? 1.3 : it.active ? 1.18 : 1);

/** A class's character, holding its starting gear, as in the game. */
function classModel(key: ClassKey): Model | null {
  const { weapon, shield } = heldGear(startingGear(key));
  return characterModel(key, weapon, shield);
}

export default function ClassShowcase({ hostRef, items }: { hostRef: RefObject<HTMLElement | null>; items: ShowcaseItem[] }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const models = useMemo(() => new Map(items.map((it) => [it.classKey, classModel(it.classKey)])), []); // eslint-disable-line react-hooks/exhaustive-deps
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const pose = useRef(new Map<ClassKey, { yaw: number; scale: number }>());
  const frameRef = useRef<() => void>(() => {});

  useEffect(() => {
    const host = hostRef.current, layer = layerRef.current;
    if (!host || !layer) return;
    const r = new ShowcaseRenderer();
    layer.appendChild(r.canvas);
    let raf = 0, last = 0;

    const draw = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(now - last, 50) : 16;
      const hostBox = host.getBoundingClientRect();
      let animating = false;
      const cells = [];
      for (const it of itemsRef.current) {
        const model = models.get(it.classKey);
        const slot = host.querySelector(`[data-showcase-slot="${it.classKey}"]`);
        if (!model || !slot) continue;
        const p = pose.current.get(it.classKey) ?? { yaw: 0, scale: 1 };
        if (it.active) { p.yaw += (dt / SHOWCASE_SPIN_MS) * 2 * Math.PI; animating = true; }
        const target = scaleFor(it);
        p.scale += (target - p.scale) * Math.min(1, dt / EASE_MS);
        if (Math.abs(target - p.scale) > 0.001) animating = true; else p.scale = target;
        pose.current.set(it.classKey, p);
        const b = slot.getBoundingClientRect();
        cells.push({ model, yaw: p.yaw, scale: p.scale, dim: it.dim, rect: { x: b.left - hostBox.left, y: b.top - hostBox.top, w: b.width, h: b.height } });
      }
      r.render(cells, now / 1000);
      if (animating) { last = now; raf = requestAnimationFrame(draw); } else last = 0;
    };
    const request = () => { if (!raf) raf = requestAnimationFrame(draw); };
    frameRef.current = request;

    const resize = () => { r.setSize(host.clientWidth, host.clientHeight); request(); };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      r.dispose();
      r.canvas.remove();
    };
  }, [hostRef, models]);

  // Hover / focus changes start the animation (it stops by itself once everything has settled)
  const stateKey = items.map((it) => `${it.classKey}:${+it.active}${+it.focused}${+it.dim}`).join('|');
  useEffect(() => frameRef.current(), [stateKey]);

  return <div ref={layerRef} aria-hidden="true" className="absolute inset-0 pointer-events-none z-10" />;
}
