import type { Mesh } from './mesh';
import type { FitSpec } from './types';

/** Scale and position a finished mesh into game units (1 unit = 1 tile). Also writes the standard anchors. */
export function finalize(m: Mesh, fit: FitSpec): void {
  const { min, max } = m.bounds();
  if (!Number.isFinite(min[0])) throw new Error('empty mesh');

  if (fit.kind === 'standing') {
    // The stand point goes to the tile center. A design should mark it with m.anchor('feet', ...) (the
    // middle of the stance), otherwise anything held out to one side (a scythe, reaching arms) would pull
    // the bounding-box center off the body. Bounding-box center is only the fallback.
    const feet = m.anchors.feet;
    const cx = feet ? feet[0] : (min[0] + max[0]) / 2;
    const cz = feet ? feet[2] : (min[2] + max[2]) / 2;
    // Footprint radius: the furthest vertex by squared distance, measured once (Math.hypot per vertex is slow)
    let far2 = -1, fx = 0, fz = 0;
    for (const f of m.faces)
      for (const p of f.v) {
        const dx = p[0] - cx, dz = p[2] - cz, d2 = dx * dx + dz * dz;
        if (d2 > far2) { far2 = d2; fx = dx; fz = dz; }
      }
    const rad = Math.hypot(fx, fz);
    const h = max[1] - min[1];
    const s = Math.min(fit.height / h, fit.maxRadius / Math.max(rad, 1e-6));
    m.xfAll((p) => [(p[0] - cx) * s, (p[1] - min[1]) * s, (p[2] - cz) * s], s);
    m.anchor('feet', [0, 0, 0]);
    m.anchor('overhead', [0, h * s + 0.12, 0]);
  } else {
    const c: [number, number, number] = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const dim = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    const s = fit.size / dim;
    m.xfAll((p) => [(p[0] - c[0]) * s, (p[1] - c[1]) * s, (p[2] - c[2]) * s], s);
    m.anchor('center', [0, 0, 0]);
  }
}
