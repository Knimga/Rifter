// One-time part animations (PartAnimation) as plain math, shared by every renderer: the easing, and a
// model's triangle positions posed at given progress (for renderers without a scene graph, e.g. forge:sheet).
// three.js renderers pose the same turns as matrices (viewEngine/three/toThree.ts animateParts).
import type { Halo, Model, PartGrow } from './types';

/**
 * How far along each played animation is, by name: 0 = its start, 1 = done (its end pose). An animation not listed
 * hasn't been played and changes nothing (the model as built): one waiting its turn (the Rifter's `reopen`, which
 * starts from no rift at all) mustn't hold its start pose over the others.
 */
export type AnimationProgress = Record<string, number>;

/** An animation's progress (0..1) to how far its parts have turned (or faded): eased in and out. */
export const easeAnimation = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** A growing (or shrinking) part's size at progress t, 0 = nothing, 1 = full size (PartGrow: its ease, shrink). */
export function growScale(t: number, { ease, shrink }: Pick<PartGrow, 'ease' | 'shrink'>): number {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const e = ease ?? (shrink ? 'in' : 'out');
  const k = e === 'inOut' ? easeAnimation(c) : e === 'in' ? c ** 3 : 1 - (1 - c) ** 3;
  return shrink ? 1 - k : k;
}

/** Rotate p about the axis ('x' | 'y' | 'z') through `pivot` by `rad`. */
function rotateAbout(p: number[], pivot: readonly number[], axis: 'x' | 'y' | 'z', rad: number): number[] {
  const c = Math.cos(rad), s = Math.sin(rad);
  const [x, y, z] = [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]];
  const r = axis === 'x' ? [x, y * c - z * s, y * s + z * c]
    : axis === 'y' ? [x * c + z * s, y, -x * s + z * c]
    : [x * c - y * s, x * s + y * c, z];
  return [r[0] + pivot[0], r[1] + pivot[1], r[2] + pivot[2]];
}

/** Each turn the model's animations make at `progress`: the part (index), its pivot, axis and angle. */
function turnsAt(model: Model, progress: AnimationProgress) {
  const { partNames, pivots } = model.mesh;
  return (model.animations ?? []).flatMap((anim) => {
    const k = easeAnimation(progress[anim.name] ?? 0);
    return k <= 0 ? [] : (anim.turns ?? []).map((turn) => ({
      idx: partNames.indexOf(turn.part), pivot: pivots[turn.part] ?? [0, 0, 0], axis: turn.axis, rad: (turn.angleDeg * Math.PI / 180) * k,
    }));
  });
}

/** Each part the model's animations grow, and its size at `progress` (0 = not there yet, 1 = full size). */
function growsAt(model: Model, progress: AnimationProgress) {
  const { partNames, pivots } = model.mesh;
  return (model.animations ?? []).flatMap((anim) => (anim.grows ?? []).map((g) => ({
    idx: partNames.indexOf(g.part), pivot: pivots[g.part] ?? [0, 0, 0], k: anim.name in progress ? growScale(progress[anim.name], g) : 1,
  })));
}

/** p scaled by k about `pivot`. */
const scaleAbout = (p: number[], pivot: readonly number[], k: number) => [0, 1, 2].map((i) => pivot[i] + (p[i] - pivot[i]) * k);

/** The model's triangle positions (9 floats per triangle) with its animated parts posed at `progress`. */
export function posedPositions(model: Model, progress: AnimationProgress): Float32Array {
  const { positions, part, triCount } = model.mesh;
  const out = new Float32Array(positions);
  // Growing parts first (about their pivots), then turns
  for (const { idx, pivot, k } of growsAt(model, progress)) {
    if (k >= 1) continue;
    for (let t = 0; t < triCount; t++) {
      if (part[t] !== idx) continue;
      for (let v = 0; v < 3; v++) {
        const o = t * 9 + v * 3;
        out.set(scaleAbout([out[o], out[o + 1], out[o + 2]], pivot, k), o);
      }
    }
  }
  for (const { idx, pivot, axis, rad } of turnsAt(model, progress)) {
    for (let t = 0; t < triCount; t++) {
      if (part[t] !== idx) continue;
      for (let v = 0; v < 3; v++) {
        const o = t * 9 + v * 3;
        out.set(rotateAbout([out[o], out[o + 1], out[o + 2]], pivot, axis, rad), o);
      }
    }
  }
  return out;
}

/** The model's halos with its animated parts posed at `progress` (they move with their part). */
export function posedHalos(model: Model, progress: AnimationProgress): Halo[] {
  const turns = turnsAt(model, progress), grows = growsAt(model, progress);
  return model.mesh.halos.map((h) => {
    let p = [...h.p], r = h.r;
    for (const { idx, pivot, k } of grows) if (h.part === idx) { p = scaleAbout(p, pivot, k); r *= k; }
    for (const { idx, pivot, axis, rad } of turns) if (h.part === idx) p = rotateAbout(p, pivot, axis, rad);
    return { ...h, p: [p[0], p[1], p[2]], r };
  });
}
