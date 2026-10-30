import type { Design } from '../../core/types';
import { blob, frustum, jointedLimb, loft } from '../../core/primitives';
import { add, cross, hslRGB, lerp3, mul, norm, rotX, sub, type RGB, type Vec3 } from '../../core/vec';
import type { Mesh } from '../../core/mesh';

// Identity: an eyelax: a hunched, crouching aberration, its long muscular arms splayed out and down to clawed hands
// on the floor, its digitigrade legs folded deep beneath it. Its big head is thrust forward between its shoulders,
// almost all of it one huge yellow eye (its iris darker yellow rings deepening to a black pupil, a yellow halo
// around it) gazing up at the viewer, a wide lipless grin of jagged teeth beneath. A crown of long spines fans out
// from the back of its head, and longer ones sweep back down its back, dark with lavender tips. Near-black violet
// skin, mottled darker in patches; lavender claws, like its spines' tips. Seeds vary the spines (how many, how long, how they fan), the
// mottling, the arms' and legs' splay, and its skin's hue.

/**
 * The eye: a yellow, faintly glowing sclera; an iris of darker yellows, ring by ring, deepening into a black pupil;
 * a halo of its yellow around it.
 */
const SCLERA: RGB = [228, 196, 60];
const EYE_HALO: RGB = [255, 228, 120];
/**
 * The halo again at 0.375 of its strength, laid over it: the same yellow, 1.375x as strong (its red can't go past
 * 255).
 */
const EYE_HALO_BOOST: RGB = [96, 86, 45];
const IRIS: RGB = [150, 116, 30], IRIS_RING: RGB = [74, 54, 14], PUPIL: RGB = [10, 10, 12];
const MOUTH: RGB = [44, 20, 26], TOOTH: RGB = [224, 216, 192];

/** An elliptical ring around `c`, square to `t` (sideways `rx`, up `ry`). */
function ellRing(c: Vec3, t: Vec3, rx: number, ry: number, n: number): Vec3[] {
  const side = norm(cross([0, 1, 0], t)), up = cross(t, side);
  return Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2;
    return add(c, add(mul(side, Math.cos(a) * rx), mul(up, Math.sin(a) * ry)));
  });
}

/** Its arms and legs (jointedLimb): six-sided, a lump of muscle at each bend. */
const LIMB = { sides: 6, j: 0.12, knobs: { scale: 1.15, jit: 0.1 } };

/** Claws from `palm`: one per direction (out along it, curling down to the floor), skin to a `claw`-colored point. */
function claws(m: Mesh, palm: Vec3, dirs: Vec3[], reach: number, w: number, skin: RGB, claw: RGB): void {
  for (const d of dirs) {
    const knuckle = add(palm, mul(d, reach * 0.4));
    const tip = add(add(palm, mul(d, reach)), [0, -palm[1] + 0.004, 0]);
    frustum(m, palm, knuckle, w, w * 0.75, 4, skin, { caps: false, j: 0.1 });
    frustum(m, knuckle, tip, w * 0.75, w * 0.1, 4, claw, { j: 0.08 });
  }
}

const design: Design = {
  id: 'creature.eyelax',
  source: { table: 'enemies', key: 'eyelax' }, // data/units/enemies.ts › eyelax
  category: 'creature',
  label: 'Eyelax',
  fit: { kind: 'standing', height: 1.15, maxRadius: 0.5 },
  budget: 2600,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    m.anchor('feet', [0, 0, 0.06]); // between its hands and feet

    // Skin: near-black violet (about #1a1724), mottled darker in patches (a slow wave through space, so patches form),
    // its tops a little lighter, catching the light
    const hue = rf(250, 258);
    const SKIN = hslRGB(hue, rf(19, 25), rf(11, 12.5)), SKIN_TOP = hslRGB(hue, 20, rf(16, 18)), MOTTLE = hslRGB(hue, rf(19, 25), rf(7, 8));
    const ph = [rf(0, 6.28), rf(0, 6.28), rf(0, 6.28)];
    const skin = (cen: Vec3, n: Vec3): RGB => {
      const w = Math.sin(cen[0] * 34 + ph[0]) + Math.sin(cen[1] * 29 + ph[1]) + Math.sin(cen[2] * 31 + ph[2]);
      return w > 0.8 ? MOTTLE : n[1] > 0.5 ? SKIN_TOP : SKIN;
    };
    const SPINE = hslRGB(hue, 14, rf(13, 16)), SPINE_TIP = hslRGB(rf(254, 264), rf(50, 62), rf(70, 76)); // lavender

    // The torso, head and spines are built standing a little higher, then dropped by DROP together (lowering its
    // crouch); the shoulders and hips meet them there
    const DROP = 0.07;
    const lower = (from: number) => m.xf(from, (p) => [p[0], p[1] - DROP, p[2]]);

    // ─── Torso: hunched, leaning far forward from the hips to the shoulders, the back rising into a hump ───
    m.part('torso', [0, 0.5 - DROP, 0]);
    const torsoFrom = m.faces.length;
    const back: Vec3[] = [[0, 0.42, -0.16], [0, 0.55, -0.11], [0, 0.65, -0.03], [0, 0.64, 0.07], [0, 0.6, 0.15]];
    const RX = [0.11, 0.13, 0.16, 0.17, 0.1], RY = [0.08, 0.1, 0.115, 0.1, 0.07];
    const tangent = (i: number) => norm(sub(back[Math.min(back.length - 1, i + 1)], back[Math.max(0, i - 1)]));
    loft(m, back.map((p, i) => ellRing(p, tangent(i), RX[i], RY[i], 10)), skin, { bandCenters: true, j: 0.12 });
    lower(torsoFrom);

    // ─── Legs: thick, folded deep beneath it, knees out to the sides, heels raised, clawed feet on the floor ───
    const legOut = rf(0.21, 0.25);
    for (const s of [1, -1]) {
      const hip: Vec3 = [s * 0.11, 0.42 - DROP, -0.14], knee: Vec3 = [s * legOut, 0.31, 0.04];
      const ankle: Vec3 = [s * (legOut - 0.05), 0.11, -0.16], foot: Vec3 = [s * (legOut - 0.05), 0.04, -0.07];
      jointedLimb(m, [hip, knee, ankle, foot], [0.078, 0.058, 0.036, 0.03], skin, LIMB);
      blob(m, foot, [0.045, 0.03, 0.06], 0, 0.1, skin);
      claws(m, add(foot, [0, 0, 0.035]), [-0.35, 0, 0.35].map((a): Vec3 => norm([Math.sin(a) + s * 0.15, 0, Math.cos(a)])), 0.11, 0.014, SKIN, SPINE_TIP);
    }

    // ─── Arms: long, thick and muscular, elbows splayed out to the sides, forearms reaching forward to big clawed
    //     hands planted ahead of it ───
    const armOut = rf(0.29, 0.33);
    for (const s of [1, -1]) {
      const shoulder: Vec3 = [s * 0.16, 0.63 - DROP, 0.06], elbow: Vec3 = [s * armOut, 0.34, 0.05];
      const wrist: Vec3 = [s * (armOut - 0.06), 0.1, 0.24], palm: Vec3 = [s * (armOut - 0.07), 0.05, 0.28];
      jointedLimb(m, [shoulder, elbow, wrist, palm], [0.068, 0.056, 0.04, 0.034], skin, LIMB);
      blob(m, palm, [0.05, 0.027, 0.056], 0, 0.1, skin);
      // Four long fingers spread forward, curling to their claws on the floor
      claws(m, palm, [-0.55, -0.18, 0.18, 0.55].map((a): Vec3 => norm([Math.sin(a) + s * 0.2, 0, Math.cos(a)])), 0.15, 0.016, SKIN, SPINE_TIP);
    }

    // ─── Head: big, thrust forward and low between the shoulders, tilted up to gaze at the viewer ───
    m.part('head', [0, 0.6 - DROP, 0.15]);
    const headFrom = m.faces.length;
    blob(m, [0, 0.62, 0.2], [0.13, 0.128, 0.13], 1, 0.06, skin);
    blob(m, [0, 0.5, 0.25], [0.095, 0.062, 0.085], 1, 0.06, skin); // the jaw
    // The eye: a huge ball bulging from the front of the head, its brow a ridge of skin over it
    const EYE_C: Vec3 = [0, 0.645, 0.28], ER = 0.097 * rf(0.97, 1.04);
    const tilt = rf(0.28, 0.4);
    const F: Vec3 = norm([0, Math.sin(tilt), Math.cos(tilt)]); // where it looks: forward and up
    blob(m, EYE_C, [ER, ER, ER], 1, 0.01, SCLERA, { e: 0.35, j: 0.05 });
    // Its yellow halo: centered in the eye, so only a rim of it shows around the ball. Placed where the eye ends up
    // (the head is dropped by DROP below, and xf never moves halos)
    const haloAt: Vec3 = [EYE_C[0], EYE_C[1] - DROP, EYE_C[2]], haloR = ER * 1.35 * 1.25 * 1.1;
    m.halo(haloAt, haloR, EYE_HALO);
    m.halo(haloAt, haloR, EYE_HALO_BOOST);
    blob(m, [0, 0.745, 0.285], [0.105, 0.032, 0.055], 0, 0.1, skin);
    // Iris, its darker inner ring, and the pupil: discs on the eye's front, each a little prouder than the last
    const disc = (r: number, out0: number, out1: number, col: RGB) =>
      frustum(m, add(EYE_C, mul(F, ER * out0)), add(EYE_C, mul(F, ER * out1)), r, r * 0.96, 10, col, { j: 0.04 });
    disc(ER * 0.66, 0.8, 0.97, IRIS);
    disc(ER * 0.44, 0.9, 0.995, IRIS_RING);
    disc(ER * 0.24, 0.95, 1.02, PUPIL);

    // The mouth: a wide, dark grin beneath the eye, jagged teeth above and below
    blob(m, [0, 0.495, 0.312], [0.08, 0.03, 0.038], 0, 0.08, MOUTH, { j: 0.05 });
    const arc = (x: number): number => 0.346 - x * x * 5; // the teeth follow the jaw's curve
    for (let k = 0; k < 7; k++) {
      const x = -0.06 + (k / 6) * 0.12, len = rf(0.026, 0.038);
      frustum(m, [x, 0.518, arc(x)], [x + rf(-0.004, 0.004), 0.518 - len, arc(x) + 0.004], 0.008, 0.001, 3, TOOTH, { j: 0.06 });
    }
    for (let k = 0; k < 6; k++) {
      const x = -0.05 + (k / 5) * 0.1, len = rf(0.02, 0.03);
      frustum(m, [x, 0.472, arc(x) - 0.004], [x + rf(-0.004, 0.004), 0.472 + len, arc(x)], 0.007, 0.001, 3, TOOTH, { j: 0.06 });
    }

    // ─── Spines: a fan crowning the back of the head, then a mane down the back, grey to purple tips ───
    const spike = (base: Vec3, dir: Vec3, len: number, w: number) => {
      const d = norm(add(dir, [0, 0, -0.15])); // each sweeps a little back
      const mid = add(base, mul(d, len * 0.6)), tip = add(base, mul(norm(add(d, [0, -0.08, -0.12])), len));
      frustum(m, base, mid, w, w * 0.5, 4, SPINE, { caps: false, j: 0.1 });
      frustum(m, mid, tip, w * 0.5, w * 0.05, 4, SPINE_TIP, { j: 0.08 });
    };
    m.part('spines', [0, 0.66 - DROP, 0.1]);
    // Crown: fanned left to right across the back of the head, the middle ones longest
    const crown = ri(7, 9), HC: Vec3 = [0, 0.65, 0.17];
    for (let k = 0; k < crown; k++) {
      const f = k / (crown - 1) - 0.5; // -0.5 .. 0.5, left to right
      const dir = norm([f * 2.1 + rf(-0.1, 0.1), 0.8 - Math.abs(f) * 0.5, -0.45]);
      spike(add(HC, mul(dir, 0.11)), dir, (0.3 - Math.abs(f) * 0.22) * rf(0.85, 1.15), 0.022);
    }
    // Mane: down the back to the hips, in pairs splayed out to the sides, swept back (BACK_SWEEP), shorter toward the
    // tail
    const BACK_SWEEP = (-15 * Math.PI) / 180; // about x: tipping their tops back
    for (const [i, t] of [[1, 0.2], [1, 0.75], [2, 0.3], [2, 0.8], [3, 0.4]] as const) {
      const at = lerp3(back[4 - i], back[3 - i], t);
      const lenK = 1 - (i - 1) * 0.22;
      for (const s of [1, -1]) {
        const dir = rotX(norm([s * rf(0.35, 0.6), 0.85, -0.35]), BACK_SWEEP);
        spike(add(at, [s * 0.04, 0.08, 0]), dir, rf(0.31, 0.46) * lenK, 0.024);
      }
      if (c.chance(0.5)) spike(add(at, [0, 0.1, 0]), rotX(norm([0, 1, -0.3]), BACK_SWEEP), rf(0.24, 0.36) * lenK, 0.021);
    }
    // A few on the shoulders, pointing up and out
    for (const s of [1, -1]) spike([s * 0.16, 0.7, 0.04], [s * 0.7, 0.75, -0.1], rf(0.09, 0.13), 0.017);
    lower(headFrom);

    return 'Eyelax';
  },
};

export default design;
