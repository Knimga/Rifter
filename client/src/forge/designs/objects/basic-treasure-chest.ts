// Model for Basic Treasure Chest (data/world/gameObjects.ts › basic-treasure-chest): a plain wooden chest of
// horizontal planks under a rounded (barrel) lid, clasped in iron: two straps over the lid and down the
// body, a rim along the lid's edge, iron corner caps, and a hasp with a padlock on the front.
// Built facing +z (the lock), width along x, standing on the floor.
// Animation 'open' (a looted chest): the lid swings up and back on its hinge at the back edge, ajar, showing
// the dark, empty inside. Everything that moves with the lid (its straps, rim and the hasp) is in the 'lid'
// part; the padlock stays on the body.
import type { Design } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { box, frustum, loft } from '../../core/primitives';
import { mulC, type RGB, type Vec3 } from '../../core/vec';
import { objectEntry } from '../_object';

const WOOD: RGB = [84, 54, 32];
const WOOD_DARK: RGB = [68, 44, 26];
const IRON: RGB = [62, 64, 70];
const RIVET: RGB = [118, 120, 128];
const LOCK: RGB = [96, 98, 106];
const KEYHOLE: RGB = [18, 18, 20];
/** The inside of the chest, seen once the lid is open. */
const INSIDE: RGB = [10, 7, 5];

/** Body size (local units): width along x, depth along z, height of the box under the lid. */
const W = 0.9, D = 0.56, H = 0.46;
/** The lid: a half cylinder along x, as deep as the body. */
const R = D / 2;
/** Points across the lid's arc, front (+z) over the top to the back. */
const ARC = 8;
/** Iron strap width; straps sit at ±STRAP_X. */
const SW = 0.07, STRAP_X = W * 0.3;

/** The lid's cross-section at x: its arc, `grow` outward (iron straps sit just proud of the wood). */
function lidRing(x: number, grow = 0): Vec3[] {
  const r = R + grow;
  const pts: Vec3[] = [];
  for (let i = 0; i <= ARC; i++) {
    const t = (i / ARC) * Math.PI; // 0 = front edge, PI = back edge
    pts.push([x, H + Math.sin(t) * r, Math.cos(t) * r]);
  }
  return pts;
}

/** A strap's run down the body at x: front and back faces, with rivets on the front. */
function bodyStrap(m: Mesh, x: number): void {
  for (const s of [1, -1]) box(m, [x, H / 2, s * (D / 2 + 0.008)], [SW, H, 0.022], IRON, 0.03, { j: 0.08 });
  for (const y of [0.1, H - 0.1]) box(m, [x, y, D / 2 + 0.024], [0.03, 0.03, 0.016], RIVET, 0.1);
}

const design: Design = {
  ...objectEntry('basic-treasure-chest'),
  category: 'object',
  fit: { kind: 'standing', height: 0.5, maxRadius: 0.45 },
  budget: 700,
  // Looted: the lid swings open on its back hinge, left ajar
  animations: [{ name: 'open', ms: 550, turns: [{ part: 'lid', axis: 'x', angleDeg: -45 }] }],
  build(c) {
    const m = c.mesh;
    const { rf } = c;
    m.anchor('feet', [0, 0, 0]);

    // Body: three horizontal planks, the seams showing, and the dark inside under the lid
    m.part('body');
    const ph = H / 3;
    for (let k = 0; k < 3; k++) {
      const shade = mulC(k % 2 ? WOOD_DARK : WOOD, rf(0.93, 1.05));
      box(m, [0, ph * (k + 0.5), 0], [W, ph - 0.01, D], shade, 0.008, { j: 0.12 });
    }
    box(m, [0, H + 0.002, 0], [W - 0.08, 0.004, D - 0.08], INSIDE, 0, { j: 0.04 });

    // Iron straps down the body, and iron caps on its four bottom corners
    for (const sx of [-1, 1]) bodyStrap(m, sx * STRAP_X);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) box(m, [sx * (W / 2 - 0.04), 0.07, sz * (D / 2 - 0.04)], [0.1, 0.14, 0.1], IRON, 0.05, { j: 0.08 });

    // The padlock, hanging from a staple on the body: its dark keyhole, and its shackle up through the hasp
    const zf = D / 2;
    box(m, [0, H - 0.11, zf + 0.05], [0.12, 0.11, 0.05], LOCK, 0.04, { j: 0.06 });
    box(m, [0, H - 0.125, zf + 0.077], [0.022, 0.04, 0.008], KEYHOLE, 0);
    const N = 6, sr = 0.042, sc: Vec3 = [0, H - 0.055, zf + 0.05];
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI, a1 = ((i + 1) / N) * Math.PI;
      const p = (a: number): Vec3 => [sc[0] + Math.cos(a) * sr, sc[1] + Math.sin(a) * sr, sc[2]];
      frustum(m, p(a0), p(a1), 0.012, 0.012, 4, LOCK);
    }

    // Lid, hinged at its back edge: the rounded wooden top, its iron straps, a rim along its bottom edge,
    // and the hasp hanging down its front over the padlock
    m.part('lid', [0, H, -R]);
    loft(m, [lidRing(-W / 2), lidRing(W / 2)], mulC(WOOD, rf(0.95, 1.04)), { j: 0.14 });
    for (const sx of [-1, 1]) loft(m, [lidRing(sx * STRAP_X - SW / 2, 0.014), lidRing(sx * STRAP_X + SW / 2, 0.014)], IRON, { j: 0.08 });
    for (const sz of [-1, 1]) box(m, [0, H + 0.02, sz * (D / 2 - 0.005)], [W + 0.02, 0.04, 0.03], IRON, 0.02, { j: 0.08 });
    for (const sx of [-1, 1]) box(m, [sx * (W / 2 - 0.005), H + 0.02, 0], [0.03, 0.04, D + 0.02], IRON, 0.02, { j: 0.08 });
    box(m, [0, H + 0.02, zf + 0.018], [0.09, 0.15, 0.022], IRON, 0.03);

    return 'Basic Treasure Chest';
  },
};
export default design;
