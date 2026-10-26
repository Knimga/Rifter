// Building one model inside another: a design draws another design's model into its own mesh (the active Rifter
// holds the keystone and the rift), so the inner model's shape lives in one place. The inner model is built and
// finalized on its own (its own seed and fit: its true size in tiles), then its faces, halos, parts and pivots
// are copied in, placed by `place`. Its part names are kept, so the outer design can name them in its motion
// and animations (a rift's spinning swirl and rim); the inner design must not share part names with the outer.
import { BuildCtx } from './ctx';
import { finalize } from './finalize';
import type { Mesh } from './mesh';
import type { FitSpec } from './types';
import { mul, type Vec3 } from './vec';

/** What embedding needs of a design: how it builds and its fit (any Design has both). */
export interface Embeddable {
  fit: FitSpec;
  build(c: BuildCtx): unknown;
}

/**
 * Draw `inner`'s model (built with `seed`, finalized to its fit) into `m`: each point through `place` after
 * scaling by `scale` (pass 1 / the outer mesh's own fitScale, so the inner model keeps its true size once the
 * outer is finalized). Halo radii scale with it. Its anchors are not copied.
 */
export function embed(m: Mesh, inner: Embeddable, seed: number, place: (p: Vec3) => Vec3, scale = 1): void {
  const c = new BuildCtx(seed >>> 0);
  inner.build(c);
  finalize(c.mesh, inner.fit);
  const sub = c.mesh;
  const at = (p: Vec3) => place(mul(p, scale));
  const partOf = sub.partNames.map((name) => m.partIndex(name));
  for (const f of sub.faces) m.faces.push({ ...f, v: [at(f.v[0]), at(f.v[1]), at(f.v[2])], part: partOf[f.part] });
  for (const h of sub.halos) m.halos.push({ ...h, p: at(h.p), r: h.r * scale, part: partOf[h.part] });
  for (const [name, p] of Object.entries(sub.pivots)) m.pivots[name] = at(p);
  // A part it gave no pivot pivots on its own origin (its feet or center), not the outer model's
  for (const name of sub.partNames) if (!sub.pivots[name] && !m.pivots[name]) m.pivots[name] = at([0, 0, 0]);
}
