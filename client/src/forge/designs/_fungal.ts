// Fungus shared by the fungal creatures (Sporetender, Mirehulk): mushroom caps on stalks and bracket (shelf)
// fungus, after the handoff's builders (handoff/Fungal Forest Forge.html).
// Files starting with "_" are NOT registered as designs.
import type { BuildCtx } from '../core/ctx';
import { blob, frustum, loft } from '../core/primitives';
import { add, mulC, rotX, rotY, rotZ, type RGB, type Vec3 } from '../core/vec';

/** A pale stalk, the default under every cap. */
const STALK: RGB = [206, 196, 172];

/**
 * A mushroom cap: a ragged faceted dome with gills underneath, built at the origin, tilted, then moved to `at`.
 * `sides`: facets around (default 9; fewer for small caps).
 */
export function cap(c: BuildCtx, at: Vec3, r: number, h: number, top: RGB, gill: RGB, o: { spots?: number; spotCol?: RGB; tilt?: [number, number]; sides?: number } = {}): void {
  const m = c.mesh, n = o.sides ?? 9, s0 = m.faces.length;
  const ring = (y: number, k: number): Vec3[] =>
    Array.from({ length: n }, (_, i) => { const t = (i / n) * 2 * Math.PI, q = r * k * (1 + (c.R() - 0.5) * 0.22); return [Math.cos(t) * q, y, Math.sin(t) * q]; });
  const rings: Vec3[][] = [];
  for (let i = 0; i <= 4; i++) { const a = (i / 4) * 1.3; rings.push(ring(h * Math.sin(a), Math.cos(a))); }
  loft(m, rings, top, { caps: false, j: 0.18 });
  const last = rings[4], tc: Vec3 = [0, h * Math.sin(1.3) + h * 0.04, 0];
  for (let i = 0; i < n; i++) m.tri(tc, last[i], last[(i + 1) % n], top, [0, h * 0.45, 0], { j: 0.18 });
  const rim = rings[0], gc: Vec3 = [0, -h * 0.18, 0];
  for (let i = 0; i < n; i++) m.tri(gc, rim[i], rim[(i + 1) % n], i % 2 ? gill : mulC(gill, 0.8), [0, h * 0.5, 0], { j: 0.2 });
  for (let k = 0; k < (o.spots ?? 0); k++) {
    const a = c.R() * 6.283, f = 0.15 + c.R() * 0.55, sr = r * (0.07 + c.R() * 0.05);
    blob(m, [Math.cos(a) * r * f, h * Math.sqrt(1 - f * f) + sr * 0.2, Math.sin(a) * r * f], [sr, sr * 0.45, sr], 0, 0.2, o.spotCol ?? [236, 230, 214], { j: 0.1 });
  }
  const tl = o.tilt ?? [0, 0];
  m.xf(s0, (p) => add(rotZ(rotX(p, tl[0]), tl[1]), at));
}

/**
 * A stalk with a cap on top (`r` across, its dome `r` × 0.55 high), leaning by `lean` ([x, z] slope of the
 * stalk). Returns the stalk's tip (the cap's base).
 */
export function mush(c: BuildCtx, base: Vec3, h: number, r: number, top: RGB, gill: RGB, o: { lean?: [number, number]; spots?: number; stalk?: RGB; sides?: number } = {}): Vec3 {
  const l = o.lean ?? [0, 0], tip: Vec3 = [base[0] + l[0] * h, base[1] + h, base[2] + l[1] * h];
  frustum(c.mesh, base, tip, r * 0.24, r * 0.17, 5, o.stalk ?? STALK, { j: 0.14 });
  cap(c, tip, r, r * 0.55, top, gill, { spots: o.spots, tilt: [l[1] * 1.4, -l[0] * 1.4], sides: o.sides });
  return tip;
}

/**
 * Bracket fungus: a stacked half-shelf growing out of a surface at `p`, `r` deep, turned `ang` about y (at
 * π/2 it juts out toward -z: off a creature's back).
 */
export function shelf(c: BuildCtx, p: Vec3, ang: number, r: number, col: RGB): void {
  const m = c.mesh, s0 = m.faces.length;
  blob(m, [0, 0, 0], [r, r * 0.2, r * 0.8], 0, 0.16, col, { j: 0.2 });
  blob(m, [0, -r * 0.16, 0], [r * 0.8, r * 0.14, r * 0.65], 0, 0.16, mulC(col, 0.7), { j: 0.2 });
  m.xf(s0, (q) => add(rotY(q, ang), p));
}
