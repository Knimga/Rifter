import type { Design } from '../../core/types';
import { blob, box, fibSphere, frustum, onEllipsoid, tube } from '../../core/primitives';
import { add, hslRGB, mul, mulC, norm, rotX, rotY, sub, type RGB, type Vec3 } from '../../core/vec';
import { GOBLIN_IRON, goblinArm, goblinHead, goblinHeadCenter, goblinLegs, goblinLook, goblinTorso } from '../_goblin';

// Identity: a goblin (designs/_goblin.ts, the warrior's and archer's body) a fifth larger than the rest, bareheaded
// under a shock of white spiky hair, his eyes bright white. Iron pauldrons on both shoulders, a white baldric across
// his chest and white rags at his belt, round flasks of glowing liquid dangling from it. A shepherd's crook of pale
// wood taller than he is, planted upright in his right fist (the shaman's staff hold), its hook curling outward; a
// hand crossbow in his left fist, aimed down at the ground ahead. Seeds vary the body (build, skin, armor colors), the hair's spikes,
// the flasks' liquids and the crook's sway.
const WHITE: RGB = [222, 220, 212];
const CROOK_WOOD: RGB = [104, 80, 54];
const STOCK: RGB = [70, 50, 36];
const STRING: RGB = [170, 160, 140];
const CORD: RGB = [74, 54, 38];
/** Hues of the flasks' liquids: venom green, amber, blood red, teal. */
const LIQUID_HUES = [100, 34, 352, 182];
/** How tall the crook's shaft stands (its hook rises a little above). The goblin, feet to crown, is about 1.05. */
const CROOK_HEIGHT = 1.26;

const design: Design = {
  id: 'creature.troll-tamer',
  source: { table: 'enemies', key: 'troll-tamer' }, // data/units/bosses.ts › BOSS_CLASSES › troll-tamer
  category: 'creature',
  label: 'Troll Tamer',
  // The crook sets the top: this keeps the goblin himself 1.2x the other goblins
  fit: { kind: 'standing', height: 1.12, maxRadius: 0.8 },
  budget: 1500,
  build(c) {
    const m = c.mesh;
    const { rf } = c;
    const body = { ...goblinLook(c, ['none']), pauldrons: 'both' as const, pauldronSize: 1.2, eye: { color: [248, 248, 242] as RGB, e: 0.7 } };
    const { W, hunch } = body;
    goblinLegs(m, body);
    goblinTorso(c, body);
    goblinHead(m, body);
    const hc = goblinHeadCenter(body);

    // A shock of white hair: short spikes bristling from the crown, up, out and back (never over the face)
    m.part('hair', hc);
    const HEAD: Vec3 = [0.12, 0.11, 0.12];
    for (const d of fibSphere(30, rf(0, 6.28)).filter(d => d[1] > 0.3 && d[2] < 0.55)) {
      const root = onEllipsoid(hc, HEAD, d, -0.02);
      const dir = norm(add(add(d, [0, 0.35, -0.25]), [rf(-0.2, 0.2), 0, rf(-0.2, 0.2)]));
      frustum(m, root, add(root, mul(dir, rf(0.09, 0.15))), 0.034, 0.003, 3, mulC(WHITE, rf(0.9, 1.05)), { caps: false });
    }

    // White bits on his clothes: a baldric from the left shoulder down across the chest to the right hip, and two
    // white rags among the belt's flaps
    m.part('baldric', [0, 0.6, 0]);
    tube(m, [[0.14 * W, 0.86, hunch + 0.08], [0.05 * W, 0.74, hunch * 0.75 + 0.2 * W], [-0.06 * W, 0.6, hunch * 0.3 + 0.19 * W],
      [-0.13 * W, 0.46, 0.15 * W]], 0.024, 0.024, 4, WHITE, { j: 0.12 });
    for (const [x, z] of [[0.13, 0.08], [-0.1, -0.12]] as const) box(m, [x * W, 0.34, z * W], [0.07, 0.12, 0.02], mulC(WHITE, rf(0.85, 1)), 0.25);

    // Round flasks dangling from the belt on cords: on the left hip, the right, and behind; each its own glowing liquid
    m.part('flasks', [0, 0.44, 0]);
    for (const a of [0.55, -0.9, 2.5]) {
      const at: Vec3 = [Math.sin(a) * 0.18 * W, 0.44, Math.cos(a) * 0.17 * W];
      const drop = rf(0.05, 0.09), neck = add(at, [0, -drop, 0]);
      frustum(m, at, neck, 0.007, 0.007, 3, CORD, { caps: false });
      const r = rf(0.042, 0.05), bulb = add(neck, [0, -0.03 - r, 0]);
      frustum(m, add(neck, [0, 0.008, 0]), add(neck, [0, -0.035, 0]), 0.016, 0.02, 4, [90, 96, 92]); // neck and cork
      const col = hslRGB(c.pick(LIQUID_HUES) + rf(-6, 6), rf(55, 70), rf(36, 44));
      blob(m, bulb, [r, r * 0.95, r], 0, 0.1, col, { e: 0.6 });
      m.halo(bulb, 0.08, mulC(col, 1.5));
    }

    // Arms: the right (-x) holds the crook as the shaman holds its staff, upper arm hanging down and out, the forearm
    // level and forward; the left with its elbow in at his side, the forearm angled down and ahead, the hand crossbow in its fist
    const elbowR: Vec3 = [-rf(0.35, 0.37), 0.65, hunch - 0.02];
    const handR: Vec3 = [elbowR[0] - 0.03, 0.65, hunch + 0.23];
    goblinArm(m, body, -1, elbowR, handR);
    const elbowL: Vec3 = [rf(0.26, 0.28) * W, 0.66, hunch];
    const handL: Vec3 = [elbowL[0] + 0.03, 0.52, hunch + 0.19];
    goblinArm(m, body, 1, elbowL, handL);

    // The crook: a straight shaft of pale wood with a slight sway, planted upright through the right fist, its hook
    // curling outward (to his right, sideways to the camera) over the top and down
    m.part('crook', handR);
    const [px, pz] = [rf(0, 6.28), rf(0, 6.28)];
    const sway = (y: number): Vec3 => [Math.sin(y * 3 + px) * 0.015, 0, Math.sin(y * 3 + pz) * 0.015];
    const off = sub(handR, add([0, handR[1], 0], sway(handR[1])));
    const shaft: Vec3[] = Array.from({ length: 6 }, (_, i) => {
      const y = (CROOK_HEIGHT * i) / 5;
      return add(add([0, y, 0], sway(y)), [off[0], 0, off[2]]);
    });
    const top = shaft[shaft.length - 1], R = 0.085;
    const hook: Vec3[] = Array.from({ length: 7 }, (_, i) => {
      const t = (i / 6) * Math.PI * 1.2; // from the shaft's top, up, over and down the outer side
      return add(top, [-R + R * Math.cos(t), R * Math.sin(t), 0]);
    });
    tube(m, [...shaft, ...hook.slice(1)], 0.026, 0.018, 5, (_, n) => (n[1] > 0.4 ? mulC(CROOK_WOOD, 1.15) : CROOK_WOOD), { j: 0.15 });

    // The hand crossbow: a short stock pointing down and ahead out of the left fist (turned a little outward), a small iron
    // prod across its front, the string drawn back to the nut. Built along +z at the fist
    m.part('crossbow', handL);
    const s0 = m.faces.length;
    box(m, [0, 0.03, 0.08], [0.036, 0.034, 0.24], STOCK, 0.1); // stock
    box(m, [0, -0.02, -0.01], [0.03, 0.08, 0.04], mulC(STOCK, 0.85), 0.1); // grip, in the fist
    box(m, [0, 0.03, 0.2], [0.05, 0.04, 0.03], GOBLIN_IRON, 0.05); // iron nose
    const tip = (sx: number): Vec3 => [sx * 0.12, 0.035, 0.17];
    for (const sx of [-1, 1]) {
      frustum(m, [sx * 0.02, 0.035, 0.205], tip(sx), 0.014, 0.008, 4, GOBLIN_IRON);
      frustum(m, tip(sx), [0, 0.05, 0.06], 0.005, 0.005, 3, STRING, { caps: false });
    }
    // A third larger than built (to read at game scale), pitched down at the ground ahead and turned a little outward
    m.xf(s0, p => add(rotY(rotX(mul(p, 1.3), 0.75), 0.25), handL));

    return 'Troll Tamer';
  },
};
export default design;
