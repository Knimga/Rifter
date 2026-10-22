// One-time part animations (PartAnimation) as plain math, shared by every renderer: the easing, and a
// model's triangle positions posed at given progress (for renderers without a scene graph, e.g. forge:sheet).
// three.js renderers pose the same turns as matrices (viewEngine/three/toThree.ts animateParts).
import type { Model } from './types';

/** How far along each animation is, by name: 0 = rest (or not played), 1 = done (its end pose). */
export type AnimationProgress = Record<string, number>;

/** An animation's progress (0..1) to how far its parts have turned: eased in and out. */
export const easeAnimation = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Rotate p about the axis ('x' | 'y' | 'z') through `pivot` by `rad`. */
function rotateAbout(p: number[], pivot: readonly number[], axis: 'x' | 'y' | 'z', rad: number): number[] {
  const c = Math.cos(rad), s = Math.sin(rad);
  const [x, y, z] = [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]];
  const r = axis === 'x' ? [x, y * c - z * s, y * s + z * c]
    : axis === 'y' ? [x * c + z * s, y, -x * s + z * c]
    : [x * c - y * s, x * s + y * c, z];
  return [r[0] + pivot[0], r[1] + pivot[1], r[2] + pivot[2]];
}

/** The model's triangle positions (9 floats per triangle) with its animated parts posed at `progress`. */
export function posedPositions(model: Model, progress: AnimationProgress): Float32Array {
  const { positions, part, partNames, pivots, triCount } = model.mesh;
  const out = new Float32Array(positions);
  for (const anim of model.animations ?? []) {
    const k = easeAnimation(progress[anim.name] ?? 0);
    if (k <= 0) continue;
    for (const turn of anim.turns) {
      const idx = partNames.indexOf(turn.part);
      const pivot = pivots[turn.part] ?? [0, 0, 0];
      const rad = (turn.angleDeg * Math.PI / 180) * k;
      for (let t = 0; t < triCount; t++) {
        if (part[t] !== idx) continue;
        for (let v = 0; v < 3; v++) {
          const o = t * 9 + v * 3;
          out.set(rotateAbout([out[o], out[o + 1], out[o + 2]], pivot, turn.axis, rad), o);
        }
      }
    }
  }
  return out;
}
