// Model for Ore Bench (data/world/decorObjects.ts › ore-bench): a geomancer's workbench, its back against a wall. A low
// bench of dark wood with a thick slab of earthy grey stone for its top, on four stout legs and a stretcher:
// - the middle: a half-cracked geode, its rough brown shell broken open toward the front, amber crystals glowing in
//   its hollow (the bench's one light), and a broken-off piece of it lying beside it;
// - around it, carved into the top: dark leylines, gone dim (a broken ring around the geode, lines running off it);
// - the left (from its front): raw ore (dark lumps flecked with copper and silver), a hammer and a chisel;
// - along its edges and sides: bundles of dried herbs, and little cones of colored earths and dusts (ochre, rust,
//   sage, chalk, slate) heaped on the top and on a shelf at its end;
// - on the floor around its front and ends: brown rubble, chipped from the work.
// Built in tile units over its two tiles (span 2), along x: its `feet` anchor at its placed tile's center (x = 0), its
// second tile at x = 1 (the model's left, spanTiles). Its front faces +z; its back is at −z, against the wall.
import type { Design } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { bipyr, blob, box, frustum } from '../../core/primitives';
import { add, mixC, mulC, type RGB, type Vec3 } from '../../core/vec';
import { decorEntry, DARK_WOOD, DARK_WOOD_SHADE, DECOR_IRON } from '../_decor';
import { leyline } from '../_arcana';

const SLAB: RGB = [58, 54, 51];
const SLAB_TOP: RGB = [67, 62, 58];
const SLAB_DEEP: RGB = [38, 35, 33];
/** The dim leylines carved in the top: dark, a faint warm glow left in them. */
const LEY: RGB = [66, 44, 26];
const SHELL: RGB = [88, 74, 62]; // the geode's rough outside
const RIND: RGB = [148, 138, 124]; // the pale band where it broke
const HOLLOW: RGB = [60, 36, 20]; // the dark of its hollow, under the crystals
const CRYSTAL: RGB = [255, 178, 78];
const CRYSTAL_HOT: RGB = [255, 222, 150];
const GLOW: RGB = [255, 150, 54];
const ORE: RGB = [50, 48, 52];
const COPPER: RGB = [184, 110, 58];
const SILVER: RGB = [172, 176, 188];
const HERBS: RGB[] = [[84, 102, 50], [108, 96, 48], [70, 86, 46]];
const TWINE: RGB = [126, 98, 64];
/** The colored earths and dusts: ochre, rust, sage, chalk, slate. */
const DUSTS: RGB[] = [[176, 128, 52], [150, 64, 40], [104, 128, 86], [196, 190, 176], [84, 98, 124]];
const RUBBLE: RGB = [78, 58, 50];

/** The bench: its ends (x), back (−z, at the wall) and front (+z), and its top. */
const X0 = -0.44, X1 = 1.44, Z0 = -0.44, Z1 = 0.2, TOP = 0.46;
const SLAB_T = 0.09;
const MID = (X0 + X1) / 2, ZM = (Z0 + Z1) / 2;
/** The geode's size (its break, crystals and halo scale with it), and its center on the middle of the top. */
const G = 1.45;
const GEODE: Vec3 = [MID, TOP + 0.13 * G, ZM + 0.02];
/** How far it reaches from its feet (the far back corner, the rubble at its far end): its fit, so it keeps its built size. */
const REACH = Math.hypot(X1 + 0.12, Z0 - 0.02);

/** A dim carved leyline on the top from `p` to `q`, `w` wide (_arcana's leyline). */
const strip = (m: Mesh, p: Vec3, q: Vec3, w: number, col: RGB) => leyline(m, p, q, w, col, { e: 0.18, j: 0.08 });

/** A little cone of colored earth or dust heaped on `base`. */
function dustCone(m: Mesh, base: Vec3, r: number, h: number, col: RGB): void {
  frustum(m, base, add(base, [0, h, 0]), r, r * 0.08, 8, col, { j: 0.1 });
}

/** A bundle of dried herbs lying on `base`, along x turned by `turn`, tied in the middle. */
function herbs(m: Mesh, base: Vec3, len: number, turn: number, col: RGB, rf: (a: number, b: number) => number): void {
  const dx = Math.cos(turn) * len / 2, dz = Math.sin(turn) * len / 2;
  for (let k = 0; k < 7; k++) {
    const o: Vec3 = [rf(-0.016, 0.016), 0.012 + rf(0, 0.014), rf(-0.016, 0.016)];
    const tip = add(add(base, o), [dx * rf(0.8, 1.1), rf(0, 0.01), dz * rf(0.8, 1.1)]);
    const shade = mulC(col, rf(0.85, 1.12));
    frustum(m, add(add(base, o), [-dx, 0, -dz]), tip, 0.007, 0.012, 4, shade, { j: 0.12 });
    // Its leaves: a dry tuft past the tie, splayed a little
    blob(m, add(tip, [rf(-0.01, 0.01), 0.008, rf(-0.01, 0.01)]), [0.03, 0.014, 0.024], 0, 0.3, mulC(shade, rf(0.9, 1.15)), { j: 0.16 });
  }
  frustum(m, add(base, [-dx * 0.15, 0.016, -dz * 0.15]), add(base, [dx * 0.05, 0.016, dz * 0.05]), 0.026, 0.026, 6, TWINE, { j: 0.06 });
}

const design: Design = {
  ...decorEntry('ore-bench'),
  category: 'decor',
  fit: { kind: 'standing', height: 5, maxRadius: REACH },
  budget: 2600,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    m.anchor('feet', [0, 0, 0]);

    // The bench: four stout legs, a stretcher between each end's pair and one along the back, a thick stone top
    m.part('bench');
    for (const x of [X0 + 0.07, X1 - 0.07]) for (const z of [Z0 + 0.07, Z1 - 0.07]) box(m, [x, (TOP - SLAB_T) / 2, z], [0.09, TOP - SLAB_T, 0.09], DARK_WOOD, 0.01, { j: 0.1 });
    for (const x of [X0 + 0.07, X1 - 0.07]) box(m, [x, 0.12, ZM], [0.05, 0.05, Z1 - Z0 - 0.14], DARK_WOOD_SHADE, 0.01, { j: 0.08 });
    box(m, [MID, 0.12, Z0 + 0.07], [X1 - X0 - 0.14, 0.05, 0.05], DARK_WOOD_SHADE, 0.01, { j: 0.08 });
    // A low shelf between the legs of its right end (from its front), holding more dusts
    box(m, [X0 + 0.24, 0.16, ZM], [0.36, 0.03, Z1 - Z0 - 0.14], DARK_WOOD, 0.01, { j: 0.08 });
    // The stone top: paler on top, darker underneath; a dark band under its front edge
    box(m, [MID, TOP - SLAB_T / 2, ZM], [X1 - X0 + 0.04, SLAB_T, Z1 - Z0 + 0.04], (_p, n) => (n[1] > 0.5 ? SLAB_TOP : n[1] < -0.5 ? SLAB_DEEP : SLAB), 0.015, { j: 0.08 });
    box(m, [MID, TOP - SLAB_T - 0.01, Z1 - 0.02], [X1 - X0 - 0.06, 0.02, 0.03], SLAB_DEEP, 0.01);

    // The dim leylines carved in the top: a broken ring around the geode, lines running off it toward the ends
    const y = TOP + 0.002;
    const ring = (r: number, a0: number, a1: number, segs: number) => {
      for (let i = 0; i < segs; i++) {
        const t0 = a0 + ((a1 - a0) * i) / segs, t1 = a0 + ((a1 - a0) * (i + 1)) / segs;
        strip(m, [GEODE[0] + Math.cos(t0) * r, y, GEODE[2] + Math.sin(t0) * r * 0.85], [GEODE[0] + Math.cos(t1) * r, y, GEODE[2] + Math.sin(t1) * r * 0.85], 0.014, LEY);
      }
    };
    ring(0.26, 0.3, 2.6, 7);
    ring(0.26, 3.3, 5.9, 7);
    for (const [a, b] of [[[MID - 0.26, ZM - 0.06], [MID - 0.62, ZM - 0.14]], [[MID + 0.26, ZM + 0.04], [MID + 0.58, ZM + 0.12]], [[MID + 0.58, ZM + 0.12], [MID + 0.8, ZM - 0.08]], [[MID - 0.62, ZM - 0.14], [MID - 0.76, ZM + 0.1]]] as const)
      strip(m, [a[0], y, a[1]], [b[0], y, b[1]], 0.012, LEY);

    // The geode: a rough brown shell broken open toward the front and up, a pale rind around the break, amber
    // crystals glowing in its dark hollow
    m.part('geode', GEODE);
    blob(m, GEODE, [0.15 * G, 0.13 * G, 0.14 * G], 1, 0.12, SHELL, { j: 0.12 });
    const open: Vec3 = add(GEODE, [0, 0.05 * G, 0.09 * G]); // the middle of the break, on its front-top
    const face: Vec3 = [0, 0.55, 0.83]; // the way the break faces
    const onBreak = (u: number, v: number, out = 0): Vec3 => add(open, [u, v * 0.83 + face[1] * out, -v * 0.55 + face[2] * out]);
    // The rind, then the hollow inside it (a disc, a little sunk)
    const RIM = 12;
    for (let i = 0; i < RIM; i++) {
      const a0 = (i / RIM) * Math.PI * 2, a1 = ((i + 1) / RIM) * Math.PI * 2;
      const P = (a: number, r: number, out: number) => onBreak(Math.cos(a) * r, Math.sin(a) * r * 0.85, out);
      m.quad(P(a0, 0.115 * G, 0.004), P(a1, 0.115 * G, 0.004), P(a1, 0.085 * G, 0.004), P(a0, 0.085 * G, 0.004), RIND, GEODE, { j: 0.1 });
      m.tri(P(a0, 0.086 * G, -0.006), P(a1, 0.086 * G, -0.006), onBreak(0, 0, -0.03 * G), HOLLOW, add(GEODE, [0, -0.2, -0.2]), { j: 0.08 });
    }
    // Crystals: a cluster pointing out of the hollow, the middle ones longest and hottest
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2 + rf(-0.2, 0.2), r = (k < 3 ? rf(0, 0.025) : rf(0.03, 0.07)) * G;
      const base = onBreak(Math.cos(a) * r, Math.sin(a) * r * 0.85, -0.01);
      const tip = add(base, add(mulC(face, rf(0.035, 0.06) * (k < 3 ? 1.4 : 1) * G) as Vec3, [Math.cos(a) * 0.012, 0, Math.sin(a) * 0.01]));
      frustum(m, base, tip, rf(0.011, 0.017) * G, 0.002, 5, k < 3 ? CRYSTAL_HOT : CRYSTAL, { e: 0.95, j: 0.06 });
    }
    m.halo(onBreak(0, 0, 0.03), 0.24, mulC(GLOW, 0.6));
    m.halo(onBreak(0, 0, 0.02), 0.1, mulC(CRYSTAL_HOT, 0.65));
    // The piece that broke off, lying beside it with its few crystals up
    const piece: Vec3 = [MID + 0.3, TOP + 0.035, ZM + 0.12];
    blob(m, piece, [0.055, 0.035, 0.05], 0, 0.15, SHELL, { j: 0.12, floorY: TOP });
    for (let k = 0; k < 4; k++) bipyr(m, add(piece, [rf(-0.02, 0.02), 0.03, rf(-0.015, 0.02)]), 0.01, 0.022, 4, CRYSTAL, { e: 0.9, j: 0.05 });
    m.halo(add(piece, [0, 0.05, 0]), 0.07, mulC(GLOW, 0.45));

    // The left (from its front, +x): raw ore, flecked with copper and silver, a hammer and a chisel lying by it
    m.part('tools');
    for (const [x, z, r] of [[1.12, -0.18, 0.07], [1.26, -0.04, 0.05], [1.02, -0.02, 0.045]] as const) {
      const p: Vec3 = [x, TOP + r * 0.6, z];
      blob(m, p, [r, r * 0.75, r * 0.9], 0, 0.2, mulC(ORE, rf(0.85, 1.15)), { j: 0.12, floorY: TOP });
      for (let k = 0; k < 3; k++) bipyr(m, add(p, [rf(-r, r) * 0.6, r * 0.55, rf(-r, r) * 0.6]), r * 0.18, r * 0.25, 4, k % 2 ? COPPER : SILVER, { e: 0.15, j: 0.05 });
    }
    // The hammer: its handle along the front edge, its iron head at the far end
    const h0: Vec3 = [0.74, TOP + 0.018, 0.1], h1: Vec3 = [1.08, TOP + 0.018, 0.13];
    frustum(m, h0, h1, 0.014, 0.016, 5, DARK_WOOD, { j: 0.08 });
    box(m, add(h1, [0.02, 0.012, 0]), [0.05, 0.05, 0.11], DECOR_IRON, 0.004, { j: 0.06 });
    // The chisel, across the hammer's handle
    frustum(m, [0.86, TOP + 0.03, -0.02], [0.98, TOP + 0.028, 0.08], 0.011, 0.009, 4, DECOR_IRON, { j: 0.06 });

    // Herbs: dried bundles along its edges, one hanging down over the front edge
    herbs(m, [-0.3, TOP, 0.12], 0.26, 0.2, HERBS[0], rf);
    herbs(m, [0.2, TOP, -0.36], 0.24, -0.15, HERBS[1], rf);
    herbs(m, [1.32, TOP, 0.12], 0.22, 1.4, HERBS[2], rf);
    for (let k = 0; k < 4; k++) {
      const x = -0.08 + k * 0.022;
      frustum(m, [x, TOP - 0.005, Z1 + 0.025], [x + rf(-0.015, 0.015), TOP - 0.13 - rf(0, 0.04), Z1 + 0.03 + rf(0, 0.015)], 0.012, 0.022, 4, HERBS[k % 3], { j: 0.12 });
    }

    // Little cones of colored earths and dusts: along the top's back edge and its right end, and on the low shelf
    const cones: [number, number, number][] = [[-0.3, TOP, -0.3], [-0.14, TOP, -0.33], [0.04, TOP, -0.3], [-0.34, TOP, -0.06], [1.0, TOP, -0.34], [0.86, TOP, -0.32]];
    cones.forEach(([x, cy, z], k) => dustCone(m, [x, cy, z], rf(0.04, 0.055), rf(0.05, 0.075), DUSTS[k % DUSTS.length]));
    for (let k = 0; k < 3; k++) dustCone(m, [X0 + 0.12 + k * 0.12, 0.175, ZM + rf(-0.06, 0.06)], 0.04, 0.05, DUSTS[(k + 2) % DUSTS.length]);
    // A little of each spilled at a cone's foot
    for (const [x, cy, z] of cones.slice(0, 3)) box(m, [x + 0.04, cy + 0.003, z + 0.05], [0.05, 0.006, 0.04], mixC(DUSTS[0], SLAB_TOP, 0.5), 0.01);

    // Brown rubble on the floor around its front and ends, chipped from the work
    m.part('rubble');
    for (let k = 0, n = ri(9, 12); k < n; k++) {
      const side = k % 3;
      const p: [number, number] = side === 0 ? [rf(X0, X1), rf(Z1 + 0.05, Z1 + 0.28)] : side === 1 ? [rf(X0 - 0.12, X0 + 0.02), rf(Z0 + 0.1, Z1 + 0.15)] : [rf(X1 - 0.02, X1 + 0.12), rf(Z0 + 0.1, Z1 + 0.15)];
      const r = k < 3 ? rf(0.04, 0.065) : rf(0.015, 0.035);
      blob(m, [p[0], r * 0.55, p[1]], [r, r * 0.7, r * rf(0.7, 1)], 0, 0.3, mulC(RUBBLE, rf(0.8, 1.15)), { j: 0.16, floorY: 0 });
    }

    return this.label;
  },
};

export default design;
