import type { Design } from '../../core/types';
import type { ColorFn, Mesh } from '../../core/mesh';
import { bipyr, blob, box, frustum, jointedLimb, loft, tube } from '../../core/primitives';
import { add, cross, hslRGB, mixC, mul, mulC, norm, rotX, sub, type RGB, type Vec3 } from '../../core/vec';
import { ell } from '../_armor';

// Identity: the summoned Fiend, a winged humanoid demon, gargoyle-like. Gray, faintly lilac skin; a torso leaned
// well forward over digitigrade legs (knee forward, a long raised heel back, standing on the balls of clawed feet),
// staggered in a stride, so it stands a little shorter than a character. Broad shoulders, the head low and thrust
// forward under a heavy brow, ember-orange glowing eyes, pointed ears and dark horns sweeping up, back and out.
// Long arms held out from the body ending in big black splayed claws; a pair of bat wings folded back, each rising to
// a joint midway and a hooked peak over the shoulder, its long fingers running down behind to scalloped, pointed tips;
// a thin tail with a spade tip curling down to one side. Seeds vary the skin's tone, the build, the stride,
// how far the wings turn out, the claws' splay and the side the tail curls to.
const HORN: RGB = [44, 36, 46];
const HORN_TIP: RGB = [20, 16, 22];
const CLAW: RGB = [16, 13, 18];
const EYE: RGB = [255, 150, 40];
const EYE_HALO: RGB = [255, 196, 96];
const FANG: RGB = [214, 204, 184];

/**
 * One bat wing for side `sx`, folded back: from its root on the upper back the arm rises to the elbow (the joint
 * midway), then to the wrist, the wing's high hooked peak over the shoulder; from the wrist four long fingers run
 * down behind the body to pointed tips by the legs, the membrane stretched between them and scalloped between the
 * tips. The wing lies in a plane turned `out` radians from straight back toward its side, so it never shows the
 * camera only its edge. Drawn on both sides (a membrane, seen from either side as the creature turns).
 */
function wing(m: Mesh, sx: number, out: number, outer: RGB, inner: RGB, bone: RGB): void {
  // In the wing's plane: u along it (back and out), v up
  const d: Vec3 = [sx * Math.sin(out), 0, -Math.cos(out)];
  const at = (u: number, v: number, z0 = 0): Vec3 => [sx * 0.1 + d[0] * u, v, z0 + d[2] * u];
  const S = at(0, 1.27, 0.06), B = at(0.02, 0.98, -0.05);
  const E = at(0.2, 1.55, 0.02), W = at(0.3, 1.8, 0.01);
  const F1 = at(0.52, 1.34), F2 = at(0.54, 0.74), F3 = at(0.46, 0.2), F4 = at(0.28, 0.1); // the lower tips almost to the ground
  // Scallops: each midway between two tips, drawn in toward the wrist
  const scallop = (a: Vec3, b: Vec3, k = 0.25): Vec3 => add(mul(mul(add(a, b), 0.5), 1 - k), mul(W, k));
  const m1 = scallop(F1, F2), m2 = scallop(F2, F3), m3 = scallop(F3, F4), m4 = scallop(F4, B, 0.2);
  const tris: [Vec3, Vec3, Vec3][] = [
    [W, F1, m1], [W, m1, F2], [W, F2, m2], [W, m2, F3], [W, F3, m3], [W, m3, F4], [W, F4, m4], [W, m4, B], [W, B, E], [E, B, S],
  ];
  // The membrane's outer side (away from the body) and inner side: each side's faces turn away from a point beyond
  // the other side
  const n: Vec3 = [Math.cos(out), 0, sx * Math.sin(out)];
  const away = n[0] * sx > 0 ? n : mul(n, -1);
  const mid = mul(add(add(W, F3), add(F2, B)), 0.25);
  const inside = add(mid, mul(away, -0.5)), outside = add(mid, mul(away, 0.5));
  for (const [a, b, c] of tris) {
    m.tri(a, b, c, outer, inside, { j: 0.12 });
    m.tri(a, b, c, inner, outside, { j: 0.12 });
  }
  // Bones: the arm, knobbed at its middle joint and the wrist, and the four fingers down from the wrist
  // (in the wing's darker bone, not the skin: pale, they read as poles over the shoulders from the front)
  tube(m, [S, E, W], 0.036, 0.024, 5, bone, { caps: false });
  blob(m, E, [0.038, 0.038, 0.038], 0, 0.1, bone);
  blob(m, W, [0.03, 0.03, 0.03], 0, 0.1, bone);
  for (const f of [F1, F2, F3, F4]) frustum(m, W, f, 0.016, 0.005, 4, bone, { caps: false });
  // The hooked thumb claw on the peak, curling up and forward
  tube(m, [W, add(W, [sx * 0.01, 0.06, 0.02]), add(W, [sx * 0.01, 0.08, 0.07])], 0.02, 0.003, 4, CLAW, { caps: false });
}

/**
 * A splayed group of claws from `root`: each its own direction, fanned `spread` radians apart about `axis` from the
 * middle one's `dir`, curling toward `curl` at the tip.
 */
function clawFan(m: Mesh, root: Vec3, dir: Vec3, axis: Vec3, spread: number, curl: Vec3, len: number, r: number, gap: number): void {
  const side = norm(cross(axis, dir));
  for (const k of [-1, 0, 1]) {
    const a = k * spread, ca = Math.cos(a), sa = Math.sin(a);
    const dk = norm(add(mul(dir, ca), mul(side, sa))); // dir turned by a about the axis
    const base = add(root, mul(side, k * gap));
    tube(m, [base, add(base, mul(dk, len * 0.55)), add(add(base, mul(dk, len)), mul(curl, len * 0.35))], r, 0.003, 4, CLAW, { caps: false });
  }
}

const design: Design = {
  id: 'summon.fiend',
  source: { table: 'summons', key: 'fiend' }, // data/units/summons.ts › fiend
  category: 'summon',
  label: 'Fiend',
  fit: { kind: 'standing', height: 1.0, maxRadius: 0.6 }, // a little shorter than a character (CHARACTER_HEIGHT 1.12)
  budget: 1500,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    // Skin: gray with a lilac cast, lighter where it catches the light, cooler and darker beneath
    const skin = hslRGB(ri(264, 284), rf(11, 17), rf(33, 38));
    const skinTop = mixC(skin, [214, 204, 226], 0.18);
    const skinLow = mixC(mulC(skin, 0.72), [60, 50, 90], 0.15);
    const skinFn: ColorFn = (_c, n) => (n[1] > 0.45 ? skinTop : n[1] < -0.45 ? skinLow : skin);
    const membraneFront = mixC(mulC(skin, 0.62), [70, 44, 86], 0.25);
    const membraneBack = mulC(membraneFront, 0.78);
    const K = rf(0.95, 1.06); // build: breadth of the shoulders and limbs

    m.anchor('feet', [0, 0, 0]);

    // Digitigrade legs, staggered in a stride: thigh forward to the knee, shin back to the raised heel (hock), a
    // short foot down to the ball, three black claws forward. The left (+x) leg forward, the right back.
    const stride = rf(0.08, 0.12);
    for (const sx of [-1, 1]) {
      const off = sx > 0 ? stride : -stride;
      const x = sx * 0.13 * K;
      const hip: Vec3 = [x, 0.82, 0], knee: Vec3 = [x * 1.18, 0.55, 0.13 + off];
      const hock: Vec3 = [x * 1.12, 0.25, -0.1 + off], ball: Vec3 = [x * 1.12, 0.05, 0.02 + off];
      m.part(sx > 0 ? 'leg_l' : 'leg_r', hip);
      blob(m, [x * 1.08, 0.72, 0.05 + off * 0.4], [0.115 * K, 0.15, 0.12], 0, 0.1, skinFn); // thigh
      jointedLimb(m, [hip, knee, hock, ball], [0.1 * K, 0.075, 0.054, 0.045], skinFn, { knobs: { scale: 1.0, jit: 0.1 } });
      // Toe claws splayed across the floor, forward and out, hooking down at the tips
      clawFan(m, [ball[0], 0.045, ball[2] + 0.01], norm([0, -0.2, 1]), [0, 1, 0], rf(0.42, 0.55), [0, -1, 0], 0.14, 0.022, 0.022);
    }

    // Torso leaned well forward: rings from the waist up, each shifted ahead of the one below, broadening to the
    // shoulders; a pelvis under it
    m.part('torso', [0, 0.85, 0]);
    blob(m, [0, 0.84, 0.01], [0.18 * K, 0.12, 0.13], 0, 0.08, skinFn); // pelvis
    const lean = (y: number) => (y - 0.82) * 0.5;
    const T: [number, number, number][] = [[0.84, 0.17, 0.12], [1.0, 0.21, 0.15], [1.16, 0.28, 0.17], [1.28, 0.29, 0.16], [1.36, 0.17, 0.11]];
    loft(m, T.map(([y, rx, rz]) => ell(y, rx * K, rz, 10, 0, lean(y))), skinFn, { bandCenters: true });

    // Shoulders and long arms held out from the body, hands low and forward, each with three big black claws.
    // Staggered against the legs, as in a stride: the left leg is forward, so the right arm swings forward at the
    // shoulder and the left one back (the whole arm turns about the shoulder; the elbow's bend stays the same).
    const armSwing = rf(9, 13) * (Math.PI / 180);
    for (const sx of [-1, 1]) {
      const sh: Vec3 = [sx * 0.29 * K, 1.27, lean(1.27)];
      const elbow: Vec3 = [sx * 0.4 * K, 1.03, lean(1.27) - 0.04];
      const wrist: Vec3 = [elbow[0], 0.82, lean(1.27) + 0.1]; // straight under the elbow: the forearm doesn't angle out
      m.part(sx > 0 ? 'arm_l' : 'arm_r', sh);
      blob(m, sh, [0.12 * K, 0.11, 0.12], 0, 0.1, skinFn); // shoulder muscle
      const armFrom = m.faces.length;
      jointedLimb(m, [sh, elbow, wrist], [0.085 * K, 0.07, 0.058], skinFn, { knobs: { scale: 1.05, jit: 0.1 } });
      const hand: Vec3 = [wrist[0], 0.77, wrist[2] + 0.03];
      blob(m, hand, [0.065, 0.075, 0.065], 0, 0.12, skinFn);
      // Claws splayed wide like grasping fingers, reaching forward and a little down, fanned across the front of the
      // hand, each hooking down toward the ground at the tip (palm down)
      clawFan(m, [hand[0], 0.74, hand[2] + 0.04], norm([sx * 0.2, -0.5, 1]), norm([0, 1, 0.5]), rf(0.5, 0.65), [0, -1, 0], 0.15, 0.024, 0.026);
      // The swing (rotX turns +y toward +z, so a hanging arm swings forward with a negative angle)
      const swing = sx > 0 ? armSwing : -armSwing;
      m.xf(armFrom, (p) => add(sh, rotX(sub(p, sh), swing)));
    }

    // Wings from the upper back, folded back but turned partly out to the sides (never edge-on to the camera)
    m.part('wings', [0, 1.2, 0.05]);
    // Never near a multiple of 45°: units face the 8 grid directions, so the camera always looks along one of those
    const out = rf(27, 31) * (Math.PI / 180);
    for (const sx of [-1, 1]) wing(m, sx, out, membraneFront, membraneBack, mulC(skin, 0.7));

    // Tail: thin, curling down behind to one side, a flat spade at its tip
    m.part('tail', [0, 0.84, -0.08]);
    const ts = c.pick([-1, 1]);
    const tail: Vec3[] = [[0, 0.84, -0.08], [ts * 0.06, 0.66, -0.26], [ts * 0.2, 0.42, -0.34], [ts * 0.34, 0.24, -0.3], [ts * 0.44, 0.16, -0.2]];
    tube(m, tail, 0.04, 0.014, 5, skinFn, { caps: false });
    const spadeAt = tail[tail.length - 1];
    const from = m.faces.length;
    bipyr(m, [0, 0, 0], 0.06, 0.02, 4, mulC(skin, 0.6));
    m.xf(from, (p) => add([p[0] * 0.8, p[2] * 0.6, p[1] * 3 + 0.05], spadeAt)); // flattened, pointing on along the tail

    // Neck, then the head held low and forward
    m.part('head', [0, 1.36, lean(1.36)]);
    const H: Vec3 = [0, 1.49, 0.44];
    frustum(m, [0, 1.32, lean(1.32)], [0, 1.46, 0.39], 0.085 * K, 0.07, 6, skinFn, { caps: false });
    blob(m, H, [0.11, 0.115, 0.12], 1, 0.08, skinFn); // skull
    blob(m, [0, H[1] - 0.08, H[2] + 0.05], [0.08, 0.055, 0.08], 0, 0.1, skinFn); // jaw
    box(m, [0, H[1] + 0.035, H[2] + 0.085], [0.17, 0.035, 0.06], mulC(skin, 0.92), 0.15); // heavy brow
    for (const sx of [-1, 1]) {
      // Ember eyes under the brow
      blob(m, [sx * 0.042, H[1] + 0.008, H[2] + 0.1], [0.02, 0.013, 0.012], 0, 0.1, EYE, { e: 1 });
      m.halo([sx * 0.042, H[1] + 0.008, H[2] + 0.11], 0.05, EYE_HALO);
      // Fangs down from the upper jaw
      frustum(m, [sx * 0.03, H[1] - 0.05, H[2] + 0.1], [sx * 0.03, H[1] - 0.1, H[2] + 0.11], 0.014, 0.002, 4, FANG);
      // Pointed ears out to the side
      frustum(m, [sx * 0.085, H[1] + 0.01, H[2] - 0.02], [sx * 0.19, H[1] + 0.05, H[2] - 0.06], 0.035, 0.004, 3, skinFn);
      // Horns sweeping up, back and out, darkening to the tip
      const horn: Vec3[] = [[sx * 0.06, H[1] + 0.08, H[2] + 0.02], [sx * 0.13, H[1] + 0.21, H[2] - 0.02], [sx * 0.21, H[1] + 0.3, H[2] - 0.1], [sx * 0.27, H[1] + 0.31, H[2] - 0.2]];
      tube(m, horn, 0.048, 0.006, 5, (cen) => mixC(HORN, HORN_TIP, Math.min(1, Math.abs(cen[0]) / 0.27)), { caps: false });
    }

    return 'Fiend';
  },
};

export default design;
