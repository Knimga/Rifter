// Golems: hulks of rock (the Flame Golem, and the Mirehulk gone to the swamp): their weathered stone, their limbs of
// cracked rocks, their feet and their heads. What fills the cracks is each one's own (lava, moss and lichen).
// Files starting with "_" are NOT registered as designs.
import type { ColorFn, FaceOpts, Mesh } from '../core/mesh';
import { blob, box, crackedBlob } from '../core/primitives';
import { len, lerp3, mulC, sub, type RGB, type Vec3 } from '../core/vec';

/** A golem's rock: faces facing up catch more light (weathered tops), the rest stay dark. */
export const golemStone = (rock: RGB): ColorFn => {
  const rockHi = mulC(rock, 1.35);
  return (_cen: Vec3, n: Vec3): RGB => (n[1] > 0.6 ? rockHi : rock);
};

/**
 * A golem's limb builder: from `a` to `b`, a chain of `n` overlapping lumpy rocks (radius r0 tapering to r1), each
 * cracked (`share` of its faces `cracks`, `vein` their face options), so it reads bumpy instead of a smooth tube.
 */
export const golemLimb = (m: Mesh, stone: ColorFn, cracks: RGB | ColorFn, share: number, vein?: FaceOpts) =>
  (a: Vec3, b: Vec3, r0: number, r1: number, n: number) => {
    const l = len(sub(b, a));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, rr = r0 + (r1 - r0) * t;
      crackedBlob(m, lerp3(a, b, t), [rr, Math.max(rr, (l / n) * 0.78), rr], 0, 0.22, stone, cracks, share, { j: 0.2 }, vein);
    }
  };

/** A golem's foot: a slab of rock under the ankle, reaching forward. */
export function golemFoot(m: Mesh, ankle: Vec3, rock: RGB): void {
  box(m, [ankle[0], 0.07, ankle[2] + 0.05], [0.26, 0.14, 0.32], rock, 0.25);
}

/** A golem's head at `H`: small and rocky, a heavy brow over two small round glowing `eye`s, each with a halo. */
export function golemHead(m: Mesh, H: Vec3, stone: ColorFn, rock: RGB, eye: RGB): void {
  blob(m, H, [0.15, 0.13, 0.14], 0, 0.18, stone);
  box(m, [0, H[1] + 0.08, H[2] + 0.04], [0.26, 0.055, 0.1], rock, 0.2);
  for (const sx of [-1, 1]) {
    blob(m, [sx * 0.065, H[1] + 0.02, H[2] + 0.125], [0.042, 0.042, 0.035], 0, 0.05, eye, { e: 0.95, j: 0.05 });
    m.halo([sx * 0.065, H[1] + 0.02, H[2] + 0.16], 0.11, eye);
  }
}
