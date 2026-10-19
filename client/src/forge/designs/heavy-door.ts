// Model for Heavy Door (data/gameObjects.ts › heavy-door): a heavy dungeon door of dark wooden planks clasped in iron
// bands, set in a stone frame, with a closed iron grate at a character's head height.
// Built facing +z (its front), width along x, standing on the floor; it sits in a wall tile, turned to face
// the floor tile it opens onto. Both faces are dressed (it is seen from either side).
import type { Design } from '../core/types';
import type { Mesh } from '../core/mesh';
import { box, frustum } from '../core/primitives';
import { mulC, type RGB, type Vec3 } from '../core/vec';
import { objectEntry } from '../designs/_object';

const WOOD: RGB = [74, 50, 33];
const WOOD_DARK: RGB = [58, 39, 26];
const IRON: RGB = [60, 62, 68];
const RIVET: RGB = [112, 114, 122];
const STONE: RGB = [56, 55, 60];
const SHUTTER: RGB = [38, 38, 42]; // the grate's closed iron hatch, behind the bars

/** Door leaf size (local units; the frame adds to it). Head height of a character falls at GRATE_Y. */
const W = 1.1, H = 2.0, T = 0.14;
/** Grate center height: a character's head height once the door is scaled to its fit (1.4 tiles tall). */
const GRATE_Y = 1.58;

/** An iron band across the leaf at height y, wrapping both faces, with rivets on each face. */
function band(m: Mesh, y: number, rf: (a: number, b: number) => number): void {
  box(m, [0, y, 0], [W + 0.02, 0.09, T + 0.035], IRON, 0.03, { j: 0.1 });
  for (const s of [1, -1])
    for (let k = 0; k < 5; k++) box(m, [-W / 2 + 0.11 + k * ((W - 0.22) / 4), y + rf(-0.008, 0.008), s * (T / 2 + 0.024)], [0.035, 0.035, 0.02], RIVET, 0.1);
}

/** The closed grate on one face (s = 1 front, -1 back): an iron hatch behind a framed grille of bars. */
function grate(m: Mesh, s: number): void {
  const z = s * (T / 2), gw = 0.42, gh = 0.3;
  box(m, [0, GRATE_Y, z + s * 0.006], [gw, gh, 0.012], SHUTTER, 0.02, { j: 0.06 });
  // Frame around it
  box(m, [0, GRATE_Y + gh / 2 + 0.02, z + s * 0.02], [gw + 0.08, 0.045, 0.03], IRON, 0.03);
  box(m, [0, GRATE_Y - gh / 2 - 0.02, z + s * 0.02], [gw + 0.08, 0.045, 0.03], IRON, 0.03);
  for (const sx of [-1, 1]) box(m, [sx * (gw / 2 + 0.02), GRATE_Y, z + s * 0.02], [0.045, gh + 0.08, 0.03], IRON, 0.03);
  // Bars
  for (let k = -1; k <= 1; k++) box(m, [k * 0.11, GRATE_Y, z + s * 0.03], [0.026, gh, 0.026], IRON, 0.02);
  box(m, [0, GRATE_Y, z + s * 0.034], [gw, 0.026, 0.026], IRON, 0.02);
}

const design: Design = {
  ...objectEntry('heavy-door'),
  category: 'object',
  fit: { kind: 'standing', height: 1.4, maxRadius: 0.5 },
  budget: 900,
  build(c) {
    const m = c.mesh;
    const { rf } = c;
    m.anchor('feet', [0, 0, 0]); // the middle of the doorway: this point goes to the tile center

    // Stone frame: two jambs and a lintel
    m.part('frame');
    for (const sx of [-1, 1]) box(m, [sx * (W / 2 + 0.1), (H + 0.1) / 2, 0], [0.2, H + 0.1, 0.36], STONE, 0.05, { j: 0.12 });
    box(m, [0, H + 0.21, 0], [W + 0.42, 0.22, 0.38], STONE, 0.05, { j: 0.12 });

    // Leaf: five vertical planks of dark wood, the joins showing
    m.part('door');
    const pw = W / 5;
    for (let k = 0; k < 5; k++) {
      const shade = mulC(k % 2 ? WOOD_DARK : WOOD, rf(0.92, 1.06));
      box(m, [-W / 2 + pw * (k + 0.5), H / 2, 0], [pw - 0.012, H - 0.01, T], shade, 0.01, { j: 0.12 });
    }

    // Iron bands clasping the planks (low, middle, top), the grate at head height between the upper two
    for (const y of [0.32, 1.12, 1.9]) band(m, y, rf);
    grate(m, 1);
    grate(m, -1);

    // Ring pull on the front, on the right (-x) side, hanging from a small plate
    const ringC: Vec3 = [-W / 2 + 0.22, 1.02, T / 2 + 0.035];
    box(m, [ringC[0], ringC[1] + 0.07, T / 2 + 0.012], [0.08, 0.08, 0.02], IRON, 0.05);
    const N = 8, rr = 0.075;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * 2 * Math.PI, a1 = ((i + 1) / N) * 2 * Math.PI;
      const p = (a: number): Vec3 => [ringC[0] + Math.sin(a) * rr, ringC[1] + Math.cos(a) * rr, ringC[2]];
      frustum(m, p(a0), p(a1), 0.016, 0.016, 4, RIVET);
    }

    return 'Heavy Door';
  },
};
export default design;
