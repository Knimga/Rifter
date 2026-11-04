// Arcane tools and curios for tables and shelves (the Enchanter's Table, the Arcane Research Table): glowing jars, a
// brass armillary on its stand, a mortar and pestle, a half-unrolled scroll; and leylines drawn on a tabletop (the
// Enchanter's Table's glowing circle, the Ore Bench's dim carved lines).
// Files starting with "_" are NOT registered as designs.
import type { FaceOpts, Mesh } from '../core/mesh';
import { blob, box, frustum, tube } from '../core/primitives';
import { add, mulC, rotY, sub, type RGB, type Vec3 } from '../core/vec';
import { LEATHER, PARCHMENT } from './_books';

/** Instruments' brass. */
export const BRASS: RGB = [146, 116, 58];
/** Glowing contents for jars and curios: teal, violet, amber. */
export const JAR_GLOW: RGB[] = [[90, 224, 204], [184, 124, 255], [255, 172, 84]];
/** A jar's dark glass. */
const GLASS: RGB = [40, 48, 56];

/** A glass jar on `c`, `h` tall, `r` wide: dark glass, its glowing contents (`glow`) showing through, a cork; a small glow around it. */
export function jar(m: Mesh, c: Vec3, h: number, r: number, glow: RGB): void {
  frustum(m, add(c, [0, 0.004, 0]), add(c, [0, h * 0.7, 0]), r * 0.84, r * 0.8, 7, glow, { e: 0.85, j: 0.06 });
  frustum(m, c, add(c, [0, h, 0]), r, r * 0.86, 7, GLASS, { a: 0.45, j: 0.04 });
  frustum(m, add(c, [0, h, 0]), add(c, [0, h + 0.03, 0]), r * 0.5, r * 0.46, 6, LEATHER[3], { j: 0.1 });
  m.halo(add(c, [0, h * 0.45, 0]), r * 2.6, mulC(glow, 0.7));
}

/** A brass armillary on `base`: a round foot, a stem, three rings crossed around a small glowing core (`core`). */
export function armillary(m: Mesh, base: Vec3, core: RGB): void {
  frustum(m, base, add(base, [0, 0.025, 0]), 0.07, 0.06, 7, BRASS, { j: 0.1 });
  frustum(m, add(base, [0, 0.025, 0]), add(base, [0, 0.12, 0]), 0.012, 0.01, 5, BRASS, { j: 0.1 });
  const ctr = add(base, [0, 0.2, 0]);
  const ring = (axis: (a: number) => Vec3) => tube(m, Array.from({ length: 13 }, (_, i) => add(ctr, axis((i / 12) * Math.PI * 2))), 0.008, 0.008, 4, BRASS, { j: 0.12, caps: false });
  ring((a) => [Math.cos(a) * 0.085, Math.sin(a) * 0.085, 0]);
  ring((a) => [0, Math.sin(a) * 0.085, Math.cos(a) * 0.085]);
  ring((a) => [Math.cos(a) * 0.085, Math.sin(a) * 0.03, Math.sin(a) * 0.08]);
  blob(m, ctr, [0.022, 0.022, 0.022], 0, 0.05, core, { e: 0.9 });
}

/** A stone mortar on `c`, its pestle resting in it and leaning out. */
export function mortar(m: Mesh, c: Vec3, stone: RGB): void {
  frustum(m, c, add(c, [0, 0.06, 0]), 0.045, 0.06, 7, stone, { j: 0.12 });
  frustum(m, add(c, [0, 0.04, 0]), add(c, [0.05, 0.13, -0.03]), 0.012, 0.016, 5, mulC(stone, 1.2), { j: 0.1 });
}

/**
 * A leyline: a flat strip lying on a tabletop from `p` to `q` (their `y` just above it), `w` wide, in `col` (`o`: its
 * glow, `e`, and jitter).
 */
export function leyline(m: Mesh, p: Vec3, q: Vec3, w: number, col: RGB, o: FaceOpts): void {
  const d = sub(q, p), len = Math.hypot(d[0], d[2]) || 1;
  const n: Vec3 = [(-d[2] / len) * (w / 2), 0, (d[0] / len) * (w / 2)];
  const below: Vec3 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 - 0.05, (p[2] + q[2]) / 2];
  m.quad(add(p, n), add(q, n), sub(q, n), sub(p, n), col, below, o);
}

/** A scroll half unrolled, lying on `at` turned `yaw`: its flat sheet out to one side of its roll. */
export function openScroll(m: Mesh, at: Vec3, yaw: number): void {
  const from = m.faces.length;
  box(m, [0.09, 0.003, 0], [0.18, 0.006, 0.13], PARCHMENT, 0.08);
  frustum(m, [0, 0.02, -0.075], [0, 0.02, 0.075], 0.02, 0.02, 6, PARCHMENT, { j: 0.1 });
  m.xf(from, (p) => add(rotY(p, yaw), at));
}
