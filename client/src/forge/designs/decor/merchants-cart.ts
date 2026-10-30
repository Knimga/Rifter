// Model for Merchant's Cart (data/world/decorObjects.ts › merchants-cart): a four-wheeled, open-bed cart of dark wood.
// A short railing runs around the bed (posts and a top rail), open at the back, where the tailgate hangs open from
// its hinge; at the front, the pole the horses were harnessed to runs from the front axle down to the ground, its
// crossbar lying there. The bed is loaded: a chest, a crate, a barrel, sacks, a bolt of colored cloth, a bundle of
// spears and a few colored bottles (the load's arrangement and colors vary a little by seed).
// Built in tile units, its length along x over its two tiles (span 2): its `feet` anchor at the center of its placed
// tile (x = 0), its second tile at x = 1 (the model's left, spanTiles). The back (tailgate) at -x, the pole at +x;
// its side faces +z.
import type { Design } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { blob, box, frustum, loft, ringPts, tube } from '../../core/primitives';
import { add, mulC, rotZ, type RGB, type Vec3 } from '../../core/vec';
import { DARK_WOOD, DARK_WOOD_SHADE, DECOR_IRON, barrel, decorEntry } from '../_decor';

const WOOD = DARK_WOOD;
const WOOD_DARK = DARK_WOOD_SHADE;
/** Tops of the rails, catching light. */
const WOOD_TOP: RGB = [52, 37, 27];
const IRON = DECOR_IRON;
const BURLAP: RGB = [112, 92, 62];
const BURLAP_DARK: RGB = [92, 75, 51];
const CHEST_WOOD: RGB = [84, 42, 32];
const BRASS: RGB = [152, 122, 62];
const CRATE: RGB = [88, 67, 45];
const BARREL: RGB = [70, 48, 31];
const SHAFT: RGB = [96, 72, 48];
const STEEL: RGB = [118, 122, 132];
/** The bolt of cloth's color, one of these. */
const CLOTH: RGB[] = [[128, 36, 44], [34, 92, 104], [146, 106, 38], [84, 48, 118]];
/** The bottles' glass, a few of these. */
const GLASS: RGB[] = [[90, 210, 130], [140, 100, 240], [240, 110, 60], [80, 180, 240]];

/** The bed (tile units): from its back edge to its front edge along x, half its width, its floor's top. */
const BX0 = -0.24, BX1 = 1.0, BZ = 0.34, FLOOR = 0.4;
/** The railing's top. */
const RAIL = 0.64;
/** Wheels: radius, their x positions (back, front axle), how far out they stand. */
const WR = 0.21, WX = [-0.02, 0.8], WZ = 0.43;
/** The pole: from the front axle down to the ground, ending here. */
const POLE_END: Vec3 = [1.46, 0.035, 0];
/** How far the tailgate hangs out past the vertical (radians). */
const TAILGATE_TILT = 0.5;
/** How far the model reaches from its feet (the pole's end): its fit, so it keeps the size it is built at. */
const REACH = POLE_END[0] + 0.03;

/** A wheel at (x, z): a rim of ten bent felloes, three spokes across, and a hub. */
function wheel(m: Mesh, x: number, z: number): void {
  const c: Vec3 = [x, WR, z];
  const rim: Vec3[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    rim.push([x + Math.cos(a) * (WR - 0.022), WR + Math.sin(a) * (WR - 0.022), z]);
  }
  tube(m, rim, 0.026, 0.026, 4, WOOD_DARK, { j: 0.14, caps: false });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI + 0.3, r = WR - 0.03;
    frustum(m, [x + Math.cos(a) * r, WR + Math.sin(a) * r, z], [x - Math.cos(a) * r, WR - Math.sin(a) * r, z], 0.014, 0.014, 3, WOOD, { j: 0.1, caps: false });
  }
  frustum(m, add(c, [0, 0, -0.05]), add(c, [0, 0, 0.05]), 0.048, 0.04, 6, IRON, { j: 0.08 });
}

/** A sack of burlap sitting at p (its bottom), size r, tied at the neck. */
function sack(m: Mesh, p: Vec3, r: Vec3, rf: (a: number, b: number) => number): void {
  const col = mulC(rf(0, 1) < 0.5 ? BURLAP : BURLAP_DARK, rf(0.94, 1.06));
  const top: Vec3 = [p[0], p[1] + r[1] * 1.9, p[2]];
  blob(m, [p[0], p[1] + r[1], p[2]], r, 1, 0.12, col, { j: 0.16 });
  frustum(m, add(top, [0, -0.03, 0]), add(top, [0, 0.05, 0]), r[0] * 0.3, r[0] * 0.42, 5, col, { j: 0.14 });
}

const design: Design = {
  ...decorEntry('merchants-cart'),
  category: 'decor',
  fit: { kind: 'standing', height: 5, maxRadius: REACH },
  budget: 1850,
  build(c) {
    const m = c.mesh;
    const { rf, pick } = c;
    m.anchor('feet', [0, 0, 0]);
    const len = BX1 - BX0, mid = (BX0 + BX1) / 2;
    const shade = (col: RGB) => mulC(col, rf(0.92, 1.06));

    // Running gear: the wheels on their axles, the bolsters the bed rests on, and two beams along its length
    for (const x of WX) {
      for (const s of [-1, 1]) wheel(m, x, s * WZ);
      frustum(m, [x, WR, -WZ + 0.02], [x, WR, WZ - 0.02], 0.03, 0.03, 6, IRON, { j: 0.08, caps: false });
      box(m, [x, 0.27, 0], [0.09, 0.07, 2 * BZ - 0.04], WOOD_DARK, 0.01, { j: 0.12 });
    }
    for (const s of [-1, 1]) box(m, [mid, 0.32, s * 0.2], [len - 0.04, 0.05, 0.06], WOOD_DARK, 0.01, { j: 0.12 });

    // The bed: its floor of four boards, low side boards and a front board
    for (let k = 0; k < 4; k++) {
      const z = -BZ + (k + 0.5) * (BZ / 2);
      box(m, [mid, FLOOR - 0.03, z], [len, 0.06, BZ / 2 - 0.008], shade(k % 2 ? WOOD_DARK : WOOD), 0.006, { j: 0.14 });
    }
    for (const s of [-1, 1]) box(m, [mid, FLOOR + 0.045, s * (BZ - 0.016)], [len, 0.09, 0.032], shade(WOOD), 0.006, { j: 0.14 });
    box(m, [BX1 - 0.016, FLOOR + 0.045, 0], [0.032, 0.09, 2 * BZ], shade(WOOD), 0.006, { j: 0.14 });

    // The railing: posts along both sides and the front, a top rail over them; none across the open back
    const posts = 5;
    for (const s of [-1, 1])
      for (let k = 0; k < posts; k++) {
        const x = BX0 + 0.025 + (k / (posts - 1)) * (len - 0.05);
        box(m, [x, (FLOOR + RAIL) / 2, s * (BZ - 0.016)], [0.04, RAIL - FLOOR, 0.04], WOOD_DARK, 0.006, { j: 0.12 });
      }
    box(m, [BX1 - 0.016, (FLOOR + RAIL) / 2, 0], [0.04, RAIL - FLOOR, 0.04], WOOD_DARK, 0.006, { j: 0.12 });
    for (const s of [-1, 1]) box(m, [mid, RAIL, s * (BZ - 0.016)], [len + 0.02, 0.036, 0.05], WOOD_TOP, 0.006, { j: 0.12 });
    box(m, [BX1 - 0.016, RAIL, 0], [0.05, 0.036, 2 * BZ + 0.02], WOOD_TOP, 0.006, { j: 0.12 });

    // The tailgate, hanging open from its hinge at the back of the floor: two boards, battens across its outer face
    const t0 = m.faces.length;
    const gh = RAIL - FLOOR;
    box(m, [0, -gh * 0.25, 0], [0.032, gh / 2 - 0.006, 2 * BZ - 0.02], shade(WOOD), 0.006, { j: 0.14 });
    box(m, [0, -gh * 0.75, 0], [0.032, gh / 2 - 0.006, 2 * BZ - 0.02], shade(WOOD_DARK), 0.006, { j: 0.14 });
    for (const s of [-1, 1]) box(m, [-0.024, -gh / 2, s * (BZ - 0.1)], [0.018, gh - 0.02, 0.05], WOOD_DARK, 0.004, { j: 0.1 });
    for (const s of [-1, 1]) box(m, [-0.01, -0.02, s * (BZ - 0.1)], [0.03, 0.05, 0.06], IRON, 0.004, { j: 0.08 });
    m.xf(t0, (p) => add(rotZ(p, -TAILGATE_TILT), [BX0 - 0.018, FLOOR - 0.02, 0]));

    // The pole, from the front axle down to the ground, and its crossbar lying there
    const axle: Vec3 = [WX[1], WR, 0];
    box(m, add(axle, [0.06, 0, 0]), [0.14, 0.07, 0.08], WOOD_DARK, 0.01, { j: 0.1 });
    frustum(m, axle, POLE_END, 0.036, 0.03, 6, WOOD, { j: 0.12 });
    box(m, add(POLE_END, [-0.07, -0.005, 0]), [0.045, 0.04, 0.4], WOOD, 0.008, { j: 0.12 });

    // The load. A chest at the front, a crate beside it with bottles on it, a barrel behind them
    const ch: Vec3 = [0.74 + rf(-0.02, 0.02), FLOOR, -0.11 + rf(-0.02, 0.02)];
    box(m, add(ch, [0, 0.1, 0]), [0.27, 0.2, 0.36], shade(CHEST_WOOD), 0.01, { j: 0.14 });
    loft(m, [-1, 1].map((s) => ringPts(add(ch, [0, 0.2, s * 0.18]), [0, 0, 1], 0.135, 6).map((p): Vec3 => [p[0], Math.max(p[1], ch[1] + 0.2), p[2]])), shade(CHEST_WOOD), { j: 0.14 });
    for (const s of [-1, 1]) box(m, add(ch, [0, 0.17, s * 0.11]), [0.285, 0.3, 0.035], IRON, 0.006, { j: 0.08 });
    box(m, add(ch, [-0.14, 0.17, 0]), [0.02, 0.06, 0.06], BRASS, 0.004, { j: 0.06 });

    const cr: Vec3 = [0.8 + rf(-0.02, 0.02), FLOOR, 0.17];
    box(m, add(cr, [0, 0.11, 0]), [0.22, 0.22, 0.24], shade(CRATE), 0.012, { j: 0.16 });
    for (const y of [0.025, 0.195]) box(m, add(cr, [0, y, 0]), [0.235, 0.03, 0.255], WOOD_DARK, 0.004, { j: 0.1 });
    const bottles = c.ri(2, 3);
    for (let k = 0; k < bottles; k++) {
      const g = pick(GLASS);
      const b: Vec3 = add(cr, [rf(-0.06, 0.06), 0.22, -0.07 + k * 0.07]);
      frustum(m, b, add(b, [0, 0.09, 0]), 0.034, 0.03, 6, g, { e: 0.55, j: 0.06 });
      frustum(m, add(b, [0, 0.09, 0]), add(b, [0, 0.135, 0]), 0.013, 0.011, 4, g, { e: 0.55 });
      box(m, add(b, [0, 0.14, 0]), [0.02, 0.016, 0.02], [70, 52, 36], 0);
    }

    const br: Vec3 = [0.48 + rf(-0.03, 0.03), FLOOR, 0.16 + rf(-0.02, 0.02)];
    barrel(m, br, 0.3, 0.125, shade(BARREL));

    // Sacks heaped in the middle and back
    sack(m, [0.38 + rf(-0.03, 0.03), FLOOR, -0.16], [0.13, 0.11, 0.12], rf);
    sack(m, [0.1 + rf(-0.03, 0.03), FLOOR, -0.04 + rf(-0.03, 0.03)], [0.12, 0.1, 0.13], rf);
    sack(m, [0.02 + rf(-0.03, 0.03), FLOOR, 0.19], [0.11, 0.1, 0.11], rf);

    // A bolt of colored cloth across the back of the load, and a bundle of spears laid along it
    const cloth = pick(CLOTH);
    const cx = -0.1 + rf(-0.02, 0.02);
    frustum(m, [cx, FLOOR + 0.07, -0.27], [cx, FLOOR + 0.09, 0.27], 0.065, 0.065, 7, cloth, { j: 0.12 });
    frustum(m, [cx, FLOOR + 0.07, -0.29], [cx, FLOOR + 0.07, -0.27], 0.03, 0.03, 5, mulC(cloth, 0.7));
    for (let k = 0; k < 3; k++) {
      const z = -0.26 + k * 0.03, y = FLOOR + 0.24 + k * 0.012;
      frustum(m, [-0.12, y, z], [0.86, y + 0.04, z + 0.02], 0.014, 0.013, 4, SHAFT, { j: 0.1, caps: false });
      frustum(m, [0.86, y + 0.04, z + 0.02], [0.95, y + 0.044, z + 0.022], 0.02, 0.002, 4, STEEL, { j: 0.06 });
    }

    return "Merchant's Cart";
  },
};
export default design;
