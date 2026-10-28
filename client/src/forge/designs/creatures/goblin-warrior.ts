import type { Design } from '../../core/types';
import type { ColorFn } from '../../core/mesh';
import { box, frustum, loft, ringPts } from '../../core/primitives';
import { add, alignY, dot, lerp3, mul, mulC, norm, rotX, rotZ, sub, type RGB, type Vec3 } from '../../core/vec';
import { GOBLIN_IRON, HELMET_TITLE, goblinArm, goblinBody } from '../_goblin';

// Identity: the goblin body (designs/_goblin.ts) with its long arms held out wide, battle-ready; a falchion in the
// right hand and a small, crude, red-painted round shield with one spike strapped to the left forearm. Seeds vary
// the body (build, skin, armor colors, pauldrons) and the helmet: none, a cap, a spiked cap, or a pot helmet
// hiding the face.
const PAINT: RGB = [138, 36, 30];
const WOOD: RGB = [98, 70, 46];
const BLADE: RGB = [140, 142, 146];

const design: Design = {
  id: 'creature.goblin-warrior',
  source: { table: 'enemies', key: 'goblin-warrior' }, // data/units/enemies.ts › goblin-warrior
  category: 'creature',
  label: 'Goblin Warrior',
  fit: { kind: 'standing', height: 0.86, maxRadius: 0.62 },
  budget: 1100,
  build(c) {
    const m = c.mesh;
    const { rf } = c;
    const body = goblinBody(c, ['none', 'cap', 'spiked', 'pot']);
    const { hunch } = body;

    // Long arms held out wide and low, battle-ready. The right (-x) raises the falchion out wide; the left (+x) is
    // drawn in closer, its forearm pointing straight ahead so the shield strapped on it faces the side
    const hands: Vec3[] = [];
    let forearm: [Vec3, Vec3] = [[0, 0, 0], [0, 0, 1]];
    for (const sx of [-1, 1] as const) {
      const elbowX = rf(0.35, 0.38);
      const elbow: Vec3 = sx < 0 ? [-rf(0.42, 0.46), 0.74, hunch + 0.08] : [elbowX, 0.72, hunch + 0.03];
      const hand: Vec3 = sx < 0 ? [-rf(0.56, 0.6), 0.8, hunch + 0.2] : [elbowX + 0.01, 0.67, hunch + 0.25];
      if (sx > 0) forearm = [elbow, hand];
      goblinArm(m, body, sx, elbow, hand);
      hands.push(hand);
    }

    // Falchion: a single-edged blade widening toward a clipped point, its spine straight on the outer side.
    // Built upright at the grip, then leaned OUTWARD only (never toward the camera: style guide, "Camera")
    m.part('weapon');
    const s0 = m.faces.length;
    frustum(m, [0, -0.06, 0], [0, 0.05, 0], 0.018, 0.018, 5, [52, 40, 34]); // grip
    box(m, [0, 0.055, 0], [0.11, 0.02, 0.035], GOBLIN_IRON, 0.1); // guard
    const L = 0.42;
    const blade = (f: number, w: number): Vec3[] => {
      const y = 0.065 + f * L, t = 0.012 * (1 - f * 0.5);
      return [[0.02, y, t], [0.02 - w, y, 0], [0.02, y, -t], [0.026, y, 0]]; // spine (x +), edge (x -)
    };
    loft(m, [blade(0, 0.05), blade(0.5, 0.085), blade(0.82, 0.125), blade(0.95, 0.075), blade(1, 0.004)],
      (cen) => (cen[0] < -0.05 ? mulC(BLADE, 1.2) : BLADE), { j: 0.1 });
    m.xf(s0, (p) => add(rotZ(p, 0.3), hands[0]));

    // Shield: small, round and crude (a wobbly outline), painted red over the wood with chipped patches, one iron
    // spike at its center. Built facing +z, then strapped to the outside of the left forearm: its face parallel to
    // the forearm (facing out, tipped up toward the camera about the forearm), the fist behind it
    m.part('shield');
    const s1 = m.faces.length;
    const R = 0.17, T = 0.025, N = 10;
    const wob = Array.from({ length: N }, () => rf(0.9, 1.08));
    const rim = (z: number, s: number): Vec3[] => ringPts([0, 0, z], [0, 0, 1], R * s, N).map((p, i) => [p[0] * wob[i], p[1] * wob[i], p[2]]);
    const a = rf(0, 6), b = rf(0, 6);
    const face: ColorFn = (cen, n) =>
      n[2] < 0.3 ? WOOD : Math.sin(cen[0] * 40 + a) + Math.sin(cen[1] * 36 + b) > 1.1 ? WOOD : PAINT;
    loft(m, [rim(-T, 1), rim(T, 1), rim(T + 0.02, 0.55)], face, { j: 0.22 });
    frustum(m, [0, 0, T + 0.015], [0, 0, T + 0.12], 0.035, 0.003, 5, GOBLIN_IRON);
    const [elbowL, handL] = forearm;
    const along = norm(sub(handL, elbowL));
    const out: Vec3 = norm([along[2], 0, -along[0]]); // level, square to the forearm, to the left
    const up = sub([0, 1, 0], mul(along, dot([0, 1, 0], along))); // up, square to the forearm
    const facing = norm(add(out, mul(norm(up), 0.36))); // 20° above level: the face stands ~70° from horizontal
    const strap = add(lerp3(elbowL, handL, 0.55), mul(facing, 0.045 + T)); // its back against the forearm
    const toFacing = alignY(facing);
    m.xf(s1, (p) => add(toFacing(rotX(p, -Math.PI / 2)), strap)); // +z -> +y -> facing

    return `${HELMET_TITLE[body.helmet]} Goblin Warrior`;
  },
};
export default design;
