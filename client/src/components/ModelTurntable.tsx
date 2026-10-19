// One character model standing in its box, turning slowly like the models of character select (the party
// window's model). Fills its positioned parent. Lazy-loaded (it pulls in three.js).
import { useEffect, useRef } from 'react';
import type { Model } from '../forge/core/types';
import { SHOWCASE_SPIN_MS, ShowcaseRenderer } from '../viewEngine/three/showcase';

export default function ModelTurntable({ model, scale = 1 }: { model: Model | null; scale?: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef(model);
  modelRef.current = model;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const r = new ShowcaseRenderer();
    host.appendChild(r.canvas);
    let raf = 0, last = 0, yaw = 0;

    const draw = (now: number) => {
      const dt = last ? Math.min(now - last, 50) : 16;
      last = now;
      yaw += (dt / SHOWCASE_SPIN_MS) * 2 * Math.PI;
      const m = modelRef.current;
      r.render(m ? [{ model: m, yaw, scale, rect: { x: 0, y: 0, w: host.clientWidth, h: host.clientHeight } }] : [], now / 1000);
      raf = requestAnimationFrame(draw);
    };
    const ro = new ResizeObserver(() => r.setSize(host.clientWidth, host.clientHeight));
    ro.observe(host);
    r.setSize(host.clientWidth, host.clientHeight);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      r.dispose();
      r.canvas.remove();
    };
  }, [scale]);

  return <div ref={hostRef} aria-hidden="true" className="absolute inset-0 pointer-events-none" />;
}
