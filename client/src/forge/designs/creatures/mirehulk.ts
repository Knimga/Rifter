import type { Design } from '../../core/types';
import type { ColorFn } from '../../core/mesh';
import { blob, crackedBlob, frustum } from '../../core/primitives';
import { hslRGB, mixC, mulC, type RGB, type Vec3 } from '../../core/vec';
import { mush, shelf } from '../_fungal';
import { golemFoot, golemHead, golemLimb, golemStone } from '../_golem';

// Identity: the Flame Golem's hulk of rock (here a warm dark brown), gone to the swamp. Instead of lava, its
// cracks are grown over with dark green moss and patches of dark orange rust-lichen. Hunched like a gorilla: a
// rounded hump of a back, shoulders thrust forward, the head sunk low between them, long arms dangling straight
// down so the huge fists rest on their knuckles, a staggered stance on bent legs.
// Fungus grows on it like the Rotbound in an external designer's example: two capped mushrooms (one on the upper back, one on a shoulder,
// one larger than the other), shelf fungus along the middle of its back,
// and small mushrooms sprouting all over its back and shoulders, pale dull yellow to orange. Black and dark green
// vines dangle from its shoulders and body. Small glowing eyes with a halo.
// Seeds vary the eye color (yellow, orange or green), the rock's tone, the moss and lichen, the build, the leading foot, where the mushrooms grow and their
// color, the shelves and the vines.
/** Eye colors: yellow, orange, green. */
const EYES: RGB[] = [[255, 222, 80], [255, 150, 40], [120, 255, 110]];
const MUSH_PALE: RGB = [196, 182, 118]; // pale dull yellow
const MUSH_ORANGE: RGB = [204, 118, 52];
const VINES: RGB[] = [[16, 18, 14], [30, 54, 28]]; // black, dark green

const design: Design = {
  id: 'creature.mirehulk',
  source: { table: 'enemies', key: 'mirehulk' }, // data/units/enemies.ts › mirehulk
  category: 'creature',
  label: 'Mirehulk',
  fit: { kind: 'standing', height: 1.5, maxRadius: 0.66 }, // hunched: the back and its mushrooms top it out
  budget: 2800,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    const rock = hslRGB(ri(16, 24), rf(22, 30), rf(17, 22)); // always a warm dark brown (never the Golem's cooler grey-brown)
    const moss = hslRGB(ri(105, 135), rf(24, 36), rf(13, 18));
    const lichen = hslRGB(ri(18, 28), rf(50, 64), rf(18, 24)); // dark orange
    // What grows in the cracks: moss, with patches of lichen where a slow wave through the body crosses a threshold
    // (by position, so neighbouring faces agree and the lichen comes in patches); about a third is lichen
    const phase: Vec3 = [rf(0, 6.28), rf(0, 6.28), rf(0, 6.28)];
    const growth: ColorFn = (cen) =>
      Math.sin(cen[0] * 7 + phase[0]) + Math.sin(cen[1] * 6 + phase[1]) + Math.sin(cen[2] * 8 + phase[2]) > 0.9 ? lichen : moss;
    const W = rf(0.95, 1.08); // build: bulk

    const stone = golemStone(rock);
    /** Share of the faces grown over (moss, lichen): the torso's masses, and the (less) limbs. Lit, not glowing. */
    const TORSO_MOSS = 0.33, LIMB_MOSS = 0.2;
    const MOSS = { j: 0.18 };
    const mossy = (p: Vec3, r: Vec3, level: number, share: number) => crackedBlob(m, p, r, level, 0.2, stone, growth, share, { j: 0.2 }, MOSS);
    /** A point on the front (+1) or back (-1) of the ellipsoid at `ctr` with radii `r`, at x and y (just outside it). */
    const surface = (ctr: Vec3, r: Vec3, x: number, y: number, face: 1 | -1): Vec3 => {
      const k = Math.sqrt(Math.max(0, 1 - ((x - ctr[0]) / r[0]) ** 2 - ((y - ctr[1]) / r[1]) ** 2));
      return [x, y, ctr[2] + face * (r[2] * k + 0.015)];
    };

    // Rocky limbs grown over with moss and lichen
    const limb = golemLimb(m, stone, growth, LIMB_MOSS, MOSS);
    /** A vine hanging from `p` (on a surface): thin, in 4-5 segments, drifting a little (`sx`: outward) as it falls. */
    const vine = (p: Vec3, sx: number) => {
      const col = c.pick(VINES);
      let a = p, w = rf(0.02, 0.028);
      for (let i = 0, n = ri(4, 5); i < n && a[1] > 0.25; i++) {
        const l = rf(0.13, 0.21);
        const b: Vec3 = [a[0] + sx * rf(0, 0.025), a[1] - l, a[2] + rf(-0.02, 0.02)];
        frustum(m, a, b, w, w * 0.75, 4, i % 2 ? mulC(col, 1.25) : col, { j: 0.2, caps: false });
        a = b;
        w *= 0.8;
      }
    };

    m.anchor('feet', [0, 0, 0.06]); // between the feet and the knuckles: this point goes to the tile center

    // Short, thick legs in a staggered stance: one foot planted ahead, the other behind (which one leads varies),
    // both knees bent forward of the line from hip to ankle
    const lead = c.chance(0.5) ? 1 : -1;
    for (const sx of [-1, 1]) {
      const ahead = sx === lead;
      const hip: Vec3 = [sx * 0.2 * W, 0.72, ahead ? -0.04 : -0.08];
      const knee: Vec3 = ahead ? [sx * 0.24 * W, 0.42, 0.2] : [sx * 0.23 * W, 0.44, -0.02];
      const ankle: Vec3 = ahead ? [sx * 0.24 * W, 0.13, 0.15] : [sx * 0.23 * W, 0.13, -0.2];
      m.part(sx > 0 ? 'leg_l' : 'leg_r', hip);
      limb(hip, knee, 0.15, 0.13, 1);
      mossy(knee, [0.14, 0.13, 0.14], 0, LIMB_MOSS);
      limb(knee, ankle, 0.13, 0.12, 1);
      golemFoot(m, ankle, rock);
    }

    // Body, hunched over: pelvis, belly, a chest thrust forward and down, and behind them a hunched back: a
    // rounded mass rising behind the shoulders
    m.part('torso', [0, 0.85, 0]);
    blob(m, [0, 0.84, -0.06], [0.27 * W, 0.16, 0.2], 0, 0.2, stone);
    mossy([0, 1.02, 0.02], [0.27 * W, 0.22, 0.22], 0, TORSO_MOSS);
    const CHEST: Vec3 = [0, 1.18, 0.24], CHEST_R: Vec3 = [0.36 * W, 0.26, 0.26];
    mossy(CHEST, CHEST_R, 1, TORSO_MOSS);
    const BACK: Vec3 = [0, 1.3, -0.02], BACK_R: Vec3 = [0.34 * W, 0.26, 0.28];
    mossy(BACK, BACK_R, 1, TORSO_MOSS);

    // Places on the back, along its outline seen from the side: from the lower back (t = 0) up over the hump and
    // forward to the base of the neck (t = 1); the angle is from straight up, toward the back
    const ANG0 = (140 * Math.PI) / 180, ANG1 = (-30 * Math.PI) / 180;
    const angAt = (t: number) => ANG0 + (ANG1 - ANG0) * t;
    /** A point on the back at t, `x` to the side, `out` of the way from its middle out to its surface (1 = on it). */
    const backAt = (t: number, x: number, out: number): Vec3 => {
      const g = angAt(t), k = out * Math.sqrt(Math.max(0, 1 - (x / BACK_R[0]) ** 2));
      return [x, BACK[1] + BACK_R[1] * k * Math.cos(g), BACK[2] - BACK_R[2] * k * Math.sin(g)];
    };

    // Head: small, sunk low and forward between the shoulders; a heavy brow over small round glowing green eyes
    m.part('head', [0, 1.24, 0.46]);
    golemHead(m, [0, 1.26, 0.56], stone, rock, c.pick(EYES));

    // Big boulder shoulders thrust forward; long arms dangling straight down like a gorilla's, leaning a little
    // outward, the huge fists resting on their knuckles on the ground. Vines hang off each shoulder.
    for (const sx of [-1, 1]) {
      const sh: Vec3 = [sx * 0.44 * W, 1.34, 0.24];
      m.part(sx > 0 ? 'arm_l' : 'arm_r', sh);
      mossy(sh, [0.21, 0.19, 0.21], 0, TORSO_MOSS);
      const elbow: Vec3 = [sx * 0.6 * W, 0.84, 0.24], wrist: Vec3 = [sx * 0.62 * W, 0.36, 0.34];
      limb(sh, elbow, 0.13, 0.11, 2);
      mossy(elbow, [0.12, 0.12, 0.12], 0, LIMB_MOSS);
      limb(elbow, wrist, 0.11, 0.12, 2);
      const fist: Vec3 = [sx * 0.62 * W, 0.17, 0.38];
      mossy(fist, [0.17, 0.16, 0.17], 0, LIMB_MOSS);
      m.anchor(sx > 0 ? 'hand_l' : 'hand_r', fist);
      // Off the front of the shoulder boulder, hanging in front of the arm
      for (let i = 0, n = ri(2, 3); i < n; i++) vine(surface(sh, [0.21, 0.19, 0.21], sh[0] + sx * rf(0, 0.1), sh[1] - rf(0.06, 0.12), 1), sx);
    }

    // Fungus, like the Rotbound's: shelf fungus along the middle of the back, then two capped mushrooms, one on the
    // upper back and one on a shoulder, one larger than the other, each with glowing spores floating close all
    // around its cap. Pale dull yellow to orange.
    m.part('torso', [0, 0.85, 0]);
    const mushColor = () => mixC(MUSH_PALE, MUSH_ORANGE, rf(0, 1));
    // Shelves along the middle of the back, off its sides (clear of the vertebrae)
    for (let i = 0, n = ri(3, 5); i < n; i++) {
      const t = rf(0.12, 0.45), r = rf(0.09, 0.15), sx = i % 2 === 0 ? 1 : -1;
      shelf(c, backAt(t, sx * rf(0.35, 0.7) * BACK_R[0], 0.95), Math.PI / 2 + rf(-0.4, 0.4), r, mulC(mushColor(), rf(0.75, 1)));
    }
    const side = c.chance(0.5) ? 1 : -1;
    const bigOnBack = c.chance(0.5);
    for (const onBack of [true, false]) {
      const big = onBack === bigOnBack;
      // On the back: on the hump, off to one side
      const tb = rf(0.5, 0.68);
      const base: Vec3 = onBack ? backAt(tb, -side * rf(0.3, 0.5) * BACK_R[0], 0.95) : [side * 0.44 * W, 1.48, rf(0.16, 0.26)];
      const lean: [number, number] = onBack ? [rf(-0.3, 0.3), -0.4] : [side * 0.4, -0.1];
      const h = big ? rf(0.2, 0.24) : rf(0.12, 0.15), r = big ? rf(0.19, 0.23) : rf(0.11, 0.14);
      const top = mushColor();
      mush(c, base, h, r, top, mixC(top, [230, 220, 190], 0.6), { lean, spots: ri(2, 5) });
    }

    // Vines hanging from the body: off the flanks of the hump, and the front of the chest
    for (let i = 0, n = ri(7, 10); i < n; i++) {
      const sx = i % 2 === 0 ? 1 : -1;
      const t = rf(0.25, 0.6);
      const p = c.chance(0.6)
        ? backAt(t, sx * BACK_R[0] * rf(0.85, 0.95), 1.02)
        : surface(CHEST, CHEST_R, rf(-0.22, 0.22) * W, rf(1.02, 1.1), 1);
      vine(p, sx);
    }

    // Small mushrooms sprouting all over the back and the tops of the shoulders (no spores), leaning out of the
    // surface they grow from; six-sided caps, to keep them cheap
    const sprout = (base: Vec3, lean: [number, number]) => {
      const top = mushColor(), r = rf(0.05, 0.08);
      mush(c, base, rf(0.05, 0.09), r, top, mixC(top, [230, 220, 190], 0.6), { lean, sides: 6 });
    };
    for (let i = 0, n = ri(4, 6); i < n; i++) {
      const t = rf(0.2, 0.85), x = (i % 2 === 0 ? 1 : -1) * rf(0.2, 0.75) * BACK_R[0];
      sprout(backAt(t, x, 0.97), [(x / BACK_R[0]) * 0.5, -0.3]);
    }
    for (const sx of [-1, 1]) {
      m.part(sx > 0 ? 'arm_l' : 'arm_r');
      for (let i = 0, n = ri(1, 2); i < n; i++) sprout([sx * (0.44 * W + rf(-0.06, 0.1)), 1.5, 0.24 + rf(-0.1, 0.08)], [sx * 0.35, rf(-0.2, 0.1)]);
    }

    return 'Mirehulk';
  },
};

export default design;
