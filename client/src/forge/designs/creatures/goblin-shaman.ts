import type { Design } from '../../core/types';
import type { ColorFn, Mesh } from '../../core/mesh';
import { bipyr, blob, box, frustum, tendril, tube } from '../../core/primitives';
import { add, hslRGB, lerp3, mixC, mul, mulC, norm, sub, type RGB, type Vec3 } from '../../core/vec';
import { GOBLIN_RED, goblinArm, goblinHead, goblinHeadCenter, goblinLook, goblinShoulder } from '../_goblin';
import { loftRobe, type RobeRing } from '../_robe';
import { archHood } from '../_hood';

// Identity: the goblin body (designs/_goblin.ts) in a very dark grey robe with purple and red accents: hugging its
// waist (a red sash), falling to the floor with its green toes poking out at the front, splayed, and draping down
// from its arms. A pointed hood, its ears out through the sides and its nose out the front. A staff of dark natural
// wood about a quarter taller than it, never quite straight, with a gnarled head, planted upright like a walking
// stick close beside it in the right hand (the elbow bent); the left empty, its elbow at its side. Charms hang from
// its twigs on thongs. Seeds vary the body (build, skin), the robe's grey, the staff's bends and head, and the charms.
const PURPLE: RGB = [92, 50, 118];
const PURPLE_DEEP: RGB = [52, 30, 70];
const BARK: RGB = [40, 30, 22];
const THONG: RGB = [74, 54, 38];
/** Hues of the charms hanging from the staff's head (dark and muted: dull amber, moss, teal, plum, rust). */
const CHARM_HUES = [38, 95, 180, 285, 12];
/** How tall the staff stands. The goblin, from its feet to the top of its head, is about 1.05. */
const STAFF_HEIGHT = 1.3;

/**
 * Cloth hanging from an arm, from `top` (points along the arm's underside, shoulder first) down by `drop` (one per
 * point), both sides, its lower edge trimmed purple.
 */
function drape(m: Mesh, top: Vec3[], drop: number[], cloth: RGB): void {
  const TRIM = 0.03;
  for (let i = 0; i < top.length - 1; i++) {
    const a = top[i], b = top[i + 1];
    const a1 = add(a, [0, -(drop[i] - TRIM), 0]), b1 = add(b, [0, -(drop[i + 1] - TRIM), 0]);
    const a2 = add(a, [0, -drop[i], 0]), b2 = add(b, [0, -drop[i + 1], 0]);
    const mid = lerp3(a, b2, 0.5);
    for (const side of [1, -1]) {
      const behind = add(mid, [0, 0, -side]); // each side faces away from a point past the other
      m.quad(a, b, b1, a1, side > 0 ? cloth : mulC(cloth, 0.8), behind, { j: 0.14 });
      m.quad(a1, b1, b2, a2, side > 0 ? PURPLE : mulC(PURPLE, 0.8), behind, { j: 0.1 });
    }
  }
}

const design: Design = {
  id: 'creature.goblin-shaman',
  source: { table: 'enemies', key: 'goblin-shaman' }, // data/units/enemies.ts › goblin-shaman
  category: 'creature',
  label: 'Goblin Shaman',
  // The staff sets the top: a fit as tall as the staff keeps the goblin itself the other goblins' size
  fit: { kind: 'standing', height: 1.1, maxRadius: 0.62 },
  budget: 1600,
  build(c) {
    const m = c.mesh;
    const { rf } = c;
    const body = { ...goblinLook(c, ['none']), pauldrons: 'none' as const };
    const { W, hunch, skin, skinDark } = body;
    const robe = mulC([48, 48, 48], rf(0.95, 1.06)); // dark grey (about #303030)
    // Its cloth isn't one flat grey: slow waves through space (so neighbouring faces agree) shift it lighter or
    // darker and a little warm or cool, in soft patches
    const phase: Vec3 = [rf(0, 6.28), rf(0, 6.28), rf(0, 6.28)];
    const cloth: ColorFn = (cen) => {
      const light = Math.sin(cen[0] * 9 + phase[0]) + Math.sin(cen[1] * 7 + phase[1]) + Math.sin(cen[2] * 8 + phase[2]);
      const warm = Math.sin(cen[0] * 6 - cen[2] * 5 + phase[2]);
      return mulC(mixC(robe, warm > 0 ? [54, 48, 44] : [44, 46, 54], Math.abs(warm) * 0.35), 1 + light * 0.06);
    };
    const hc = goblinHeadCenter(body);

    // The robe: from a floor-length hem up to a narrow, sashed waist, then the hunched chest and shoulders, a hump
    // over the back. Lighter on top where the light falls; a purple hem and a purple strip down the front of the skirt
    m.part('torso', [0, 0.45, 0]);
    const robeColor: ColorFn = (cen, n) => {
      if (cen[1] < 0.06 || (cen[1] < 0.44 && Math.abs(cen[0]) < 0.035 && n[2] > 0.5)) return PURPLE;
      return n[1] > 0.45 ? mulC(cloth(cen, n), 1.2) : cloth(cen, n);
    };
    const PROFILE: RobeRing[] = [
      [0.01, 0.27, 0.27, 0.05, 0.1], [0.2, 0.22, 0.2, 0.04, 0.05], [0.46, 0.15, 0.14, hunch * 0.3, 0.02],
      [0.62, 0.19, 0.17, hunch * 0.5, 0.03], [0.78, 0.2, 0.17, hunch * 0.78, 0.03], [0.88, 0.13, 0.12, hunch, 0.02],
    ];
    loftRobe(c, PROFILE, W, robeColor);
    blob(m, [0, 0.8, hunch * 0.45 - 0.07], [0.19 * W, 0.15, 0.14], 0, 0.15, robeColor); // the hump
    frustum(m, [0, 0.43, hunch * 0.28], [0, 0.5, hunch * 0.32], 0.158 * W, 0.162 * W, 8, GOBLIN_RED); // sash
    box(m, [-0.08 * W, 0.34, 0.14 * W + hunch * 0.28], [0.05, 0.17, 0.02], GOBLIN_RED, 0.2); // its hanging end

    // Green toes poking out under the front of the hem: the two feet point away from each other (about 50deg out
    // from straight ahead), each foot's three toes fanned a little apart
    for (const sx of [-1, 1]) {
      const a = sx * 0.85, across: Vec3 = [Math.cos(a), 0, -Math.sin(a)];
      const foot: Vec3 = [sx * 0.12 * W, 0.022, 0.25 * W];
      for (const k of [-1, 0, 1]) {
        const ak = a - k * 0.22, dir: Vec3 = [Math.sin(ak), 0, Math.cos(ak)];
        const root = add(foot, mul(across, k * 0.028));
        frustum(m, root, add(root, mul(dir, 0.1 - Math.abs(k) * 0.02)), 0.02, 0.013, 4, skin);
      }
    }

    // Head (bare, its face under the hood) and a pointed hood: a thin red edge around the opening, a deep purple
    // lining, rising behind the head to a point. Its sides pass inside the ears, so they stick out
    goblinHead(m, body);
    const [, hy, hz] = hc;
    const openTop = hy + 0.15;
    archHood(m, {
      arches: [
        [hz + 0.1, 0.15, openTop, hy - 0.1], [hz + 0.085, 0.152, hy + 0.154, hy - 0.104], [hz + 0.02, 0.165, hy + 0.17, hy - 0.12],
        [hz - 0.07, 0.165, hy + 0.18, hy - 0.13], [hz - 0.15, 0.14, hy + 0.2, hy - 0.12], [hz - 0.22, 0.09, hy + 0.23, hy - 0.06],
        [hz - 0.28, 0.04, hy + 0.27, hy + 0.06], [hz - 0.32, 0.008, hy + 0.31, hy + 0.27], // the point
      ],
      x: 0,
      color: (y) => (y === openTop ? GOBLIN_RED : mulC(robe, 1.1)),
      lining: PURPLE_DEEP,
      pointed: 0.6,
    });

    // Arms in robe sleeves with purple cuffs, cloth draping down beneath them. The right (-x) holds the staff close
    // beside it as characters hold staves: the upper arm hanging down and out, the forearm level and forward, a
    // right angle at the elbow. The left keeps its elbow in at its side, the forearm angled a little forward and out
    // (slightly bent), the hand empty
    const hands: Vec3[] = [];
    for (const sx of [-1, 1] as const) {
      const elbow: Vec3 = sx < 0 ? [-rf(0.35, 0.37), 0.65, hunch - 0.02] : [0.26 * W, 0.64, hunch * 0.6];
      const hand: Vec3 = sx < 0 ? [elbow[0] - 0.03, 0.65, hunch + 0.23] : [0.31 * W + rf(0, 0.02), 0.47, hunch * 0.6 + 0.11];
      goblinArm(m, body, sx, elbow, hand, cloth);
      const cuff = lerp3(elbow, hand, 0.75);
      frustum(m, lerp3(elbow, hand, 0.35), cuff, 0.048, 0.07, 6, cloth, { caps: false }); // the sleeve widening
      frustum(m, cuff, add(cuff, mul(norm(sub(hand, elbow)), 0.02)), 0.072, 0.072, 6, PURPLE, { caps: false });
      blob(m, hand, [0.045, 0.045, 0.045], 0, 0.2, skinDark);
      const sh = goblinShoulder(body, sx);
      drape(m, [add(sh, [sx * 0.04, -0.05, 0]), add(elbow, [0, -0.04, 0]), add(cuff, [0, -0.06, 0])],
        [0.1, rf(0.16, 0.2), rf(0.2, 0.26)], mulC(robe, 0.95));
      hands.push(hand);
    }

    // The staff: a length of natural wood planted upright, the right fist around it. Gentle bends (slow waves, so it
    // curves rather than zigzags) that pass through the fist, tapering toward the top
    m.part('staff', hands[0]);
    const fist = hands[0];
    const [px, pz, fx, fz] = [rf(0, 6.28), rf(0, 6.28), rf(4, 6), rf(4, 6)];
    const bend = (y: number): [number, number] => [Math.sin(y * fx + px) * 0.025, Math.sin(y * fz + pz) * 0.025];
    const [bx, bz] = bend(fist[1]);
    const shaft: Vec3[] = Array.from({ length: 9 }, (_, i) => {
      const y = (STAFF_HEIGHT * i) / 8, [dx, dz] = bend(y);
      return [fist[0] + dx - bx, y, fist[2] + dz - bz];
    });
    tube(m, shaft, 0.03, 0.022, 5, BARK, { j: 0.2 });
    // A gnarled head: a lumpy knot where twisted twigs rise and branch a little outward
    const top = shaft[shaft.length - 1];
    blob(m, add(top, [0, 0.04, 0]), [0.06, 0.07, 0.06], 0, 0.3, mulC(BARK, 1.1));
    const twigs = c.ri(3, 4), turn = rf(0, 6.28);
    const charms: Vec3[] = []; // where a thong hangs from each twig, part-way along it
    for (let i = 0; i < twigs; i++) {
      const a = turn + (i / twigs) * Math.PI * 2, out: Vec3 = [Math.cos(a), 0, Math.sin(a)];
      const root = add(top, add(mul(out, 0.04), [0, 0.05, 0]));
      const dir = norm(add(mul(out, 0.7), [0, 1, 0])), len = rf(0.17, 0.22);
      const spread = (t: number): Vec3 => mul(out, t * t * 0.07); // branching outward toward the tip
      tendril(m, root, dir, len, 4, 0.026, mulC(BARK, rf(0.9, 1.15)), { sides: 4, bend: spread });
      const t = rf(0.55, 0.8);
      charms.push(add(add(root, mul(dir, len * t)), spread(t)));
    }

    // Charms dangling from the twigs on leather thongs: dull beads and small motes, each softly aglow
    m.part('charms', top);
    for (const at of charms) {
      const drop = rf(0.12, 0.28), end = add(at, [rf(-0.01, 0.01), -drop, rf(-0.01, 0.01)]);
      frustum(m, at, end, 0.009, 0.008, 3, THONG, { caps: false });
      const col = hslRGB(c.pick(CHARM_HUES) + rf(-8, 8), rf(25, 38), rf(20, 28));
      const bead = add(end, [0, -0.022, 0]);
      if (c.chance(0.5)) blob(m, bead, [0.025, 0.028, 0.025], 0, 0.15, col, { e: 0.6 });
      else bipyr(m, bead, 0.02, 0.036, 4, col, { e: 0.6 });
      m.halo(bead, 0.065, mulC(col, 1.4));
    }

    return 'Goblin Shaman';
  },
};
export default design;
