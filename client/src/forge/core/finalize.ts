import type { Mesh } from './mesh';
import type { FitSpec } from './types';

/**
 * The scale finalize will give a mesh as it stands now: a design that builds another model into itself at its true
 * size (embed.ts) divides by it, so its own fit doesn't shrink or grow what it embedded.
 */
export function fitScale(m: Mesh, fit: FitSpec): number {
  return measure(m, fit).s;
}

/** Where finalize puts the mesh: its center, floor and scale. */
function measure(m: Mesh, fit: FitSpec) {
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
    // The floor: its lowest point, or (a floating creature: fit.floor 'origin') its own y = 0
    const floorY = fit.floor === 'origin' ? Math.min(0, min[1]) : min[1];
    const h = max[1] - floorY;
    const s = Math.min(fit.height / h, fit.maxRadius / Math.max(rad, 1e-6));
    return { kind: 'standing' as const, c: [cx, floorY, cz] as const, s, h };
  }
  const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2] as const;
  const dim = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  return { kind: 'item' as const, c, s: fit.size / dim, h: 0 };
}

/** Scale and position a finished mesh into game units (1 unit = 1 tile). Also writes the standard anchors. */
export function finalize(m: Mesh, fit: FitSpec): void {
  const { kind, c, s, h } = measure(m, fit);
  m.xfAll((p) => [(p[0] - c[0]) * s, (p[1] - c[1]) * s, (p[2] - c[2]) * s], s);
  if (kind === 'standing') {
    m.anchor('feet', [0, 0, 0]);
    m.anchor('overhead', [0, h * s + 0.12, 0]);
  } else {
    m.anchor('center', [0, 0, 0]);
  }
}
