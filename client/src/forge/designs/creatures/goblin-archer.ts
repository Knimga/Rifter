import type { Design } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { box, frustum } from '../../core/primitives';
import { add, alignY, cross, mul, mulC, norm, sub, type RGB, type Vec3 } from '../../core/vec';
import { GOBLIN_ARMOR_BROWN, GOBLIN_IRON, GOBLIN_RED, HELMET_TITLE, goblinArm, goblinBody } from '../_goblin';
import { BOW_ARROW, BOW_LIMBS } from '../_character';
import { bowShape } from '../_bow';

// Identity: the goblin body (designs/_goblin.ts), bareheaded or in a leather cap (never iron); a quiver across its
// back, mouth over the right shoulder, arrows fletched red; a crude bow held low and ready in the left fist,
// pointing at the ground a little ahead (the class Archer's bow hold: BOW_LIMBS, BOW_ARROW), an arrow nocked and
// the right fist on the string. Seeds vary the body (build, skin, armor colors, pauldrons) and the cap.
const BOW_WOOD: RGB = [116, 86, 56];
const STRING: RGB = [170, 160, 140];
const SHAFT: RGB = [96, 74, 50];
/** Bow shape units (bowShape) to goblin units: the bow is about 0.75 long. */
const BOW_SCALE = 0.25;

/** An arrow built upright from its nock at the origin to its iron head at y = len, its red fletching at the nock. */
function arrow(m: Mesh, len: number): void {
  frustum(m, [0, 0, 0], [0, len - 0.04, 0], 0.009, 0.009, 4, SHAFT, { caps: false });
  frustum(m, [0, len - 0.045, 0], [0, len, 0], 0.017, 0.002, 4, GOBLIN_IRON); // head
  box(m, [0, 0.05, 0], [0.042, 0.075, 0.006], GOBLIN_RED, 0.1); // fletching: two vanes, crossed
  box(m, [0, 0.05, 0], [0.006, 0.075, 0.042], GOBLIN_RED, 0.1);
}

const design: Design = {
  id: 'creature.goblin-archer',
  source: { table: 'enemies', key: 'goblin-archer' }, // data/units/enemies.ts › goblin-archer
  category: 'creature',
  label: 'Goblin Archer',
  fit: { kind: 'standing', height: 0.86, maxRadius: 0.62 },
  budget: 1500,
  build(c) {
    const m = c.mesh;
    const body = goblinBody(c, ['none', 'leather'], GOBLIN_ARMOR_BROWN);
    const { hunch, leather } = body;

    // The bow: built by bowShape (limbs along y, arrow line -x), then turned into the bow hold, its grip in the
    // left fist low in front of the body
    const fist: Vec3 = [0.08, 0.54, hunch + 0.36];
    const side = norm(cross(BOW_LIMBS, BOW_ARROW));
    const H = 3.0, depth = H * 0.19;
    const s0 = m.faces.length;
    bowShape(m, H, depth, { wood: BOW_WOOD, leather: mulC(leather, 0.8), trim: GOBLIN_RED, string: STRING });
    const toHold = (p: Vec3): Vec3 =>
      add(fist, mul(add(add(mul(BOW_LIMBS, p[1]), mul(BOW_ARROW, -(p[0] + depth))), mul(side, p[2])), BOW_SCALE));
    m.xf(s0, toHold);
    m.part('bow');
    const nock = toHold([0, 0, 0]); // the string's middle

    // An arrow nocked on the string, along the arrow line past the grip
    const s1 = m.faces.length;
    arrow(m, 0.5);
    const toArrow = alignY(BOW_ARROW);
    m.xf(s1, (p) => add(toArrow(p), sub(nock, mul(BOW_ARROW, 0.02))));

    // Arms: the left reaches down and forward to the grip; the right, its elbow out, holds the string at the nock
    const handR = add(nock, mul(BOW_LIMBS, 0.025));
    goblinArm(m, body, -1, [-0.32, 0.7, hunch + 0.06], handR);
    goblinArm(m, body, 1, [0.3, 0.66, hunch + 0.18], fist);

    // Quiver across the back, its mouth over the right shoulder, red-fletched arrows showing; clear of the hump
    m.part('quiver', [0, 0.75, -0.15]);
    const bottom: Vec3 = [0.16, 0.66, -0.17], top: Vec3 = [-0.12, 0.92, -0.12];
    frustum(m, bottom, top, 0.045, 0.052, 7, mulC(leather, 0.75));
    frustum(m, top, add(top, mul(norm(sub(top, bottom)), 0.02)), 0.058, 0.058, 7, mulC(leather, 0.55), { caps: false }); // rim
    const along = norm(sub(top, bottom));
    for (const [dx, dz, tilt] of [[0.018, 0.01, 0.08], [-0.02, -0.006, -0.06], [0.0, -0.025, 0.02]] as const) {
      const s2 = m.faces.length;
      arrow(m, 0.16);
      const dir = norm(add(along, [tilt, 0, 0]));
      const toQuiver = alignY(mul(dir, -1)); // stored head down: the fletching shows at the mouth
      m.xf(s2, (p) => add(toQuiver(p), add(top, add(mul(dir, 0.08), [dx, 0, dz]))));
    }

    return `${HELMET_TITLE[body.helmet]} Goblin Archer`;
  },
};
export default design;
