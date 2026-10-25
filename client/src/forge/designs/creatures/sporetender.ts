import type { Design } from '../../core/types';
import type { BuildCtx } from '../../core/ctx';
import type { Mesh, ColorFn } from '../../core/mesh';
import { blob, bipyr, frustum, loft } from '../../core/primitives';
import { add, alignY, hslRGB, mulC, norm, type RGB, type Vec3 } from '../../core/vec';
import { antler, mush } from '../_fungal';

// The Capstalker from an external designer's example (their "Fungal Forest Forge" page), as faithfully as the forge allows: a tall, thin
// fey thing on bark legs, a stag skull with glowing eyes, bone antlers tipped with small mushrooms, a ragged
// mantle of leaves at the shoulders, a big cap on its back, glowing spores drifting around it.
// Identity: the skull, the bark body, the antlers, its rust-orange leaves and orange caps. Seeds vary the
// caps' orange (ochre or rust), the glow color (eyes, antler tips, spores), the leaves' shade, the antlers'
// size and tines, and the bark's tone.

/** Cap palettes, top and gills: the example's two oranges (Ochre, Rust). */
const CAPS: [RGB, RGB][] = [
  [[190, 138, 58], [226, 206, 150]],
  [[152, 66, 42], [222, 190, 150]],
];
/** Glow colors: teal, amber, lime. */
const GLOWS: RGB[] = [[80, 230, 190], [255, 170, 60], [150, 230, 70]];

const jit = (c: BuildCtx, k: number) => 1 + (c.R() - 0.5) * k;
const ell = (y: number, rx: number, rz: number, n: number): Vec3[] =>
  Array.from({ length: n }, (_, i) => { const t = (i / n) * 2 * Math.PI; return [Math.cos(t) * rx, y, Math.sin(t) * rz]; });

/** A leaf hanging from `base` along `dir`, `L` long and `w` wide. */
function leaf(m: Mesh, base: Vec3, dir: Vec3, L: number, w: number, col: RGB): void {
  const s0 = m.faces.length;
  blob(m, [0, L / 2, 0], [w, L / 2, w * 0.2], 0, 0.12, col, { j: 0.2 });
  const al = alignY(norm(dir));
  m.xf(s0, (p) => add(al(p), base));
}

const design: Design = {
  id: 'creature.sporetender',
  source: { table: 'enemies', key: 'sporetender' }, // data/units/enemies.ts › sporetender
  category: 'creature',
  label: 'Sporetender',
  fit: { kind: 'standing', height: 1.6, maxRadius: 0.6 }, // tall and thin: the antlers top it out
  budget: 2200,
  build(c) {
    const m = c.mesh;
    const { rf, ri, pick } = c;
    const bone: RGB = [212, 204, 182], bark = hslRGB(rf(24, 38), rf(14, 24), rf(14, 20)), moss = hslRGB(rf(85, 110), rf(25, 38), rf(24, 32));
    const leafC = hslRGB(rf(14, 28), rf(48, 60), rf(30, 38)); // the example's Rust season
    const glow = pick(GLOWS);
    const [capTop, capGill] = pick(CAPS);
    const as = rf(0.55, 0.85);
    const col: ColorFn = (_, n) => (n[1] > 0.5 ? moss : bark);
    m.anchor('feet', [0, 0, 0.07]); // between the ankles and the toes

    // Legs: thigh, shin, hoof
    for (const sx of [-1, 1]) {
      m.part(sx > 0 ? 'leg_l' : 'leg_r', [sx * 0.1, 1.25, 0]);
      const H: Vec3 = [sx * 0.1, 1.25, 0], K: Vec3 = [sx * 0.12, 0.78, 0.2], A: Vec3 = [sx * 0.1, 0.34, -0.04], T: Vec3 = [sx * 0.1, 0.02, 0.18];
      frustum(m, H, K, 0.075, 0.06, 6, bark, { j: 0.14 });
      frustum(m, K, A, 0.055, 0.04, 6, bark, { j: 0.14 });
      frustum(m, A, T, 0.04, 0.022, 5, [60, 52, 44]);
    }

    // Body: a thin lofted trunk, mossy on top, and the neck
    m.part('torso', [0, 1.2, 0]);
    const rg: [number, number, number, number][] = [[1.2, 0, 0.14, 0.1], [1.5, 0, 0.18, 0.12], [1.8, 0.02, 0.21, 0.13], [1.92, 0.03, 0.1, 0.08]];
    loft(m, rg.map(([y, z, rx, rz]) => ell(y, rx, rz, 8).map((p): Vec3 => [p[0] * jit(c, 0.08), p[1], p[2] + z])), col, { j: 0.16 });
    frustum(m, [0, 1.88, 0.02], [0, 2.12, 0.12], 0.05, 0.04, 6, bark);

    // Stag skull: cranium, snout, dark sockets with glowing eyes, antlers
    m.part('head', [0, 2.12, 0.12]);
    blob(m, [0, 2.18, 0.14], [0.085, 0.1, 0.11], 1, 0.06, bone, { j: 0.12 });
    frustum(m, [0, 2.15, 0.2], [0, 2.07, 0.42], 0.06, 0.032, 6, bone, { j: 0.12 });
    for (const sx of [-1, 1]) {
      blob(m, [sx * 0.055, 2.2, 0.2], [0.032, 0.034, 0.03], 0, 0.06, [22, 18, 16]);
      blob(m, [sx * 0.055, 2.2, 0.215], [0.016, 0.016, 0.012], 0, 0.05, glow, { e: 1 });
      m.halo([sx * 0.055, 2.2, 0.23], 0.1, glow);
    }
    for (const sx of [-1, 1]) antler(c, [sx * 0.05, 2.27, 0.1], sx, as, ri(2, 3), bone, capTop, capGill, glow);

    // Arms with long bone fingers
    for (const sx of [-1, 1]) {
      const S: Vec3 = [sx * 0.2, 1.8, 0], E: Vec3 = [sx * 0.3, 1.35, 0.1], Hd: Vec3 = [sx * 0.3, 0.9, 0.2];
      m.part(sx > 0 ? 'arm_l' : 'arm_r', S);
      frustum(m, S, E, 0.05, 0.038, 5, bark, { j: 0.14 });
      frustum(m, E, Hd, 0.038, 0.026, 5, bark, { j: 0.14 });
      blob(m, Hd, [0.04, 0.05, 0.04], 0, 0.1, bark);
      for (const dx of [-0.025, 0, 0.025]) frustum(m, [Hd[0] + dx, Hd[1], Hd[2]], [Hd[0] + dx * 2, Hd[1] - 0.2, Hd[2] + 0.1], 0.014, 0.005, 4, bone);
      m.anchor(sx > 0 ? 'hand_l' : 'hand_r', Hd);
    }

    // Ragged mantle of leaves at the shoulders, a big cap on its back, glowing spores drifting around it
    m.part('torso');
    for (let i = 0, n = ri(9, 13); i < n; i++) {
      const a = (i / n) * 6.283;
      leaf(m, [Math.cos(a) * 0.2, 1.8 + rf(-0.05, 0.05), Math.sin(a) * 0.12], [Math.cos(a) * 0.6, -1, Math.sin(a) * 0.4], rf(0.35, 0.65), 0.07, mulC(leafC, rf(0.8, 1.15)));
    }
    mush(c, [0, 1.76, -0.1], 0.1, 0.2, capTop, capGill, { lean: [0, -0.6], spots: ri(2, 4) });
    for (let i = 0, n = ri(6, 10); i < n; i++) bipyr(m, [rf(-0.5, 0.5), rf(0.6, 2.4), rf(-0.5, 0.5)], 0.018, 0.03, 4, glow, { e: 1 });

    return `${pick(['Gloam', 'Hollow', 'Thorn', 'Dusk'])} Sporetender`;
  },
};
export default design;

