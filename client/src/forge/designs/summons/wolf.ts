import type { Design } from '../../core/types';
import { alongPath, blob, box, frustum, jointedLimb, loft, onEllipsoid, ringPts } from '../../core/primitives';
import { add, cross, dot, hslRGB, len, mixC, mul, mulC, norm, sub, type RGB, type Vec3 } from '../../core/vec';

// Identity: a menacing brown wolf, the summoned Wolf. Its coat runs as one soft gradient (never patches):
// a darker brown saddle along the back, brown down the flanks, fading to cream on the belly, throat, chest, muzzle
// and lower legs. Broad shoulders, the body tapering from them to the rump, stout spikes of hair flaring back over
// the shoulders and the middle of the back. Long legs in a walking stance (staggered: diagonal pairs forward / back, never squared), a ruff at
// the neck, tall pointed ears, a long muzzle drawn back in a snarl on white fangs, small amber eyes, and a big bushy
// tail curling up over the back and out to one side, flared with stout triangular spikes, its tip darker. Seeds vary
// the coat's hues and where the gradient turns, the build, the hackles, the side the tail curls to and the ears' set.
const NOSE: RGB = [24, 18, 16];
const MOUTH: RGB = [70, 26, 24];
const FANG: RGB = [236, 230, 212];
const EYE: RGB = [255, 178, 52]; // amber

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const design: Design = {
  id: 'summon.wolf',
  source: { table: 'summons', key: 'wolf' }, // data/units/summons.ts › wolf
  category: 'summon',
  label: 'Wolf',
  fit: { kind: 'standing', height: 1.0, maxRadius: 0.62 }, // long body: the radius is the limiting fit
  budget: 1250,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    // Coat: brown to cream, a gradient, never patches
    const cream = hslRGB(ri(34, 42), rf(30, 40), rf(54, 60));
    const brown = hslRGB(ri(22, 30), rf(34, 44), rf(25, 30));
    const saddle = mulC(brown, rf(0.62, 0.72)); // darkest along the spine
    const bias = rf(-0.06, 0.06); // where the gradient turns: a lighter or darker wolf
    const W = rf(0.92, 1.06); // build: girth
    const side = c.pick([-1, 1]); // which side the tail sweeps to

    // The gradient: by height and by how much a face looks up, lighter where it faces forward low on the body
    // (throat, chest, muzzle's underside). One smooth value per face, so neighbouring faces agree.
    const tone = (cen: Vec3, n: Vec3) =>
      clamp01(clamp01((cen[1] - 0.5) / 0.42) * 0.55 + (n[1] * 0.5 + 0.5) * 0.45 - (cen[2] > 0.25 ? Math.max(0, n[2]) * 0.3 : 0) + bias);
    // Cream holds a while before it turns brown, so the lower flanks and legs stay light
    const coatAt = (s: number): RGB => (s < 0.8 ? mixC(cream, brown, (s / 0.8) ** 1.6) : mixC(brown, saddle, (s - 0.8) / 0.2));
    const coat = (cen: Vec3, n: Vec3): RGB => coatAt(tone(cen, n));

    m.anchor('feet', [0, 0, 0.04]); // middle of the stance: this point goes to the tile center

    // Legs: long, the hind ones bent at the stifle (forward) and the hock (back). Staggered in a walk:
    // diagonal pairs, front-left and hind-right forward, front-right and hind-left back.
    const swing = rf(0.11, 0.15);
    for (const sx of [-1, 1]) {
      const fwd = sx > 0 ? swing : -swing; // +x (left) front leg steps forward
      const fx = sx * 0.15 * W, hx = sx * 0.11 * W; // front legs set wider, under the broad shoulders
      m.part(sx > 0 ? 'leg_fl' : 'leg_fr', [fx, 0.74, 0.34]);
      jointedLimb(m, [[fx, 0.76, 0.34], [fx * 1.05, 0.46, 0.32 + fwd * 0.45], [fx, 0.16, 0.36 + fwd * 0.9], [fx, 0.03, 0.38 + fwd]],
        [0.09, 0.062, 0.046, 0.04], coat);
      blob(m, [fx, 0.03, 0.42 + fwd], [0.05, 0.032, 0.065], 0, 0.12, cream); // paw
      m.part(sx > 0 ? 'leg_hl' : 'leg_hr', [hx, 0.74, -0.32]);
      const back = -fwd; // the hind leg on the same side goes the other way
      blob(m, [hx * 1.05, 0.66, -0.3], [0.09 * W, 0.16, 0.13], 0, 0.1, coat); // haunch
      jointedLimb(m, [[hx, 0.7, -0.32], [hx * 1.08, 0.46, -0.22 + back * 0.5], [hx, 0.22, -0.42 + back * 0.8], [hx, 0.03, -0.38 + back]],
        [0.095, 0.062, 0.046, 0.04], coat);
      blob(m, [hx, 0.03, -0.34 + back], [0.05, 0.032, 0.065], 0, 0.12, cream);
    }

    // Body: broad, menacing shoulders over a deep chest, tapering through a tucked waist to narrower hips; the back
    // nearly level, a touch higher at the shoulders
    m.part('torso', [0, 0.74, 0]);
    blob(m, [0, 0.73, 0.28], [0.22 * W, 0.21, 0.22], 1, 0.08, coat);   // chest
    const shoulders: Vec3 = [0.16 * W, 0.84, 0.3], shoulderR: Vec3 = [0.11 * W, 0.12, 0.14];
    for (const sx of [-1, 1]) blob(m, [sx * shoulders[0], shoulders[1], shoulders[2]], shoulderR, 0, 0.1, coat);
    blob(m, [0, 0.77, -0.02], [0.15 * W, 0.15, 0.26], 1, 0.08, coat);  // waist
    blob(m, [0, 0.76, -0.3], [0.13 * W, 0.15, 0.17], 1, 0.08, coat);   // hips

    // Stout spikes of hair (hackles) flaring from the shoulders and cresting the middle of the back between them,
    // pointed back (the side ones also out, so they read from every side): cones whose bases sit sunk into the body
    const SPIKE = 0.81; // the hackles' size
    const hackle = (base: Vec3, dir: Vec3) =>
      frustum(m, base, add(base, mul(norm(dir), rf(0.13, 0.18) * SPIKE)), rf(0.038, 0.048) * SPIKE, 0.004, 4, coat, { caps: false });
    const hackles = ri(3, 4);
    for (const sx of [-1, 1]) {
      // Over the inner top of each shoulder, from near its crown to partway down its side
      const sc: Vec3 = [sx * shoulders[0] * 0.85, shoulders[1], shoulders[2]];
      for (let k = 0; k < hackles; k++) {
        const ang = 0.45 + (k / (hackles - 1) - 0.5) * 0.7 + rf(-0.07, 0.07); // from vertical, toward the side
        const base = onEllipsoid(sc, shoulderR, norm([sx * Math.sin(ang), Math.cos(ang), rf(-0.1, 0.25)]), -0.02);
        hackle(base, [sx * rf(0.4, 0.6), rf(0.15, 0.35), -1]);
      }
      // Between the shoulder and the crest, so the hackles run as one mane across the back
      for (let k = 0; k < 2; k++) hackle([sx * rf(0.06, 0.08), 0.925, 0.34 - k * 0.12 + rf(-0.02, 0.02)], [sx * rf(0.2, 0.32), rf(0.25, 0.4), -1]);
    }
    // The crest: along the spine from the withers back, alternating a hair to either side, leaning back
    for (let k = 0; k < 3; k++) {
      const sx = k % 2 ? 1 : -1;
      hackle([sx * rf(0.005, 0.02), 0.93 - k * 0.01, 0.36 - k * 0.11], [sx * rf(0.05, 0.15), rf(0.3, 0.45), -1]);
    }

    // Bushy tail: a fluffy loft swelling past its root and tapering to a darker tip, curling up over the back and
    // out to one side (sideways, never straight at the camera)
    m.part('tail', [0, 0.84, -0.44]);
    const path: Vec3[] = [
      [0, 0.86, -0.42], [side * 0.04, 0.9, -0.56], [side * 0.1, 1.0, -0.64],
      [side * 0.16, 1.09, -0.63], [side * 0.2, 1.14, -0.56], [side * 0.21, 1.15, -0.47],
    ];
    const radii = [0.05, 0.1, 0.135, 0.13, 0.095, 0.02];
    const rings = path.map((p, i) => {
      const dir = norm(sub(path[Math.min(i + 1, path.length - 1)], path[Math.max(i - 1, 0)]));
      return ringPts(p, dir, radii[i], 7).map((q) => add(p, mul(sub(q, p), i === 0 || i === path.length - 1 ? 1 : rf(0.82, 1.18))));
    });
    // How far along the tail (0 root, 1 tip) a point lies: its nearest point on the curled path, by arc length
    const segLen = path.slice(1).map((p, i) => len(sub(p, path[i])));
    const tailLen = segLen.reduce((s, l) => s + l, 0);
    const alongTail = (q: Vec3) => {
      let best = Infinity, at = 0, run = 0;
      for (let i = 0; i < segLen.length; i++) {
        const d = sub(path[i + 1], path[i]);
        const u = clamp01(dot(sub(q, path[i]), d) / (segLen[i] * segLen[i]));
        const dist = len(sub(q, add(path[i], mul(d, u))));
        if (dist < best) { best = dist; at = run + u * segLen[i]; }
        run += segLen[i];
      }
      return at / tailLen;
    };
    const tipDark = mulC(saddle, 0.6);
    const tailCoat = (cen: Vec3, n: Vec3): RGB => {
      const t = alongTail(cen);
      return t > 0.78 ? mixC(coat(cen, n), tipDark, clamp01((t - 0.78) / 0.15)) : coat(cen, n);
    };
    loft(m, rings, tailCoat, { bandCenters: true });

    // Flared: stout triangular spikes of hair down both sides of the tail, sweeping out and toward the tip
    for (let k = 0; k < 4; k++) {
      const t = 0.2 + k * 0.19 + rf(-0.03, 0.03);
      const p = alongPath(path, t);
      const ahead = norm(sub(alongPath(path, Math.min(1, t + 0.05)), alongPath(path, Math.max(0, t - 0.05))));
      const outward = norm(cross(ahead, [0, 0, 1])); // across the tail, in its curl's plane's sideways
      const r = 0.13 - k * 0.012;
      for (const s of [-1, 1]) {
        const o = mul(outward, s);
        const base = add(p, mul(o, r * 0.55));
        frustum(m, base, add(base, add(mul(o, rf(0.09, 0.12)), mul(ahead, rf(0.06, 0.09)))), rf(0.04, 0.05), 0.004, 3, tailCoat, { caps: false });
      }
    }

    // Neck with a ruff of fur, the head carried forward about level with the back
    m.part('head', [0, 0.86, 0.45]);
    blob(m, [0, 0.84, 0.44], [0.19 * W, 0.19, 0.16], 1, 0.22, coat); // ruff
    frustum(m, [0, 0.82, 0.42], [0, 0.89, 0.62], 0.13 * W, 0.11, 6, coat, { caps: false });
    const H: Vec3 = [0, 0.92, 0.68];
    blob(m, H, [0.13, 0.12, 0.14], 1, 0.08, coat); // skull
    for (const sx of [-1, 1]) blob(m, [sx * 0.1, H[1] - 0.04, H[2] + 0.02], [0.06, 0.06, 0.07], 0, 0.15, coat); // cheek fur

    // Tall pointed ears, a little apart and leaning out
    const earOut = rf(0.03, 0.06);
    for (const sx of [-1, 1]) {
      const base: Vec3 = [sx * 0.075, H[1] + 0.09, H[2] - 0.03];
      frustum(m, base, [sx * (0.1 + earOut), H[1] + 0.3, H[2] - 0.06], 0.058, 0.004, 3, mixC(brown, saddle, 0.4));
    }

    // Small amber eyes, set at a slant
    for (const sx of [-1, 1]) blob(m, [sx * 0.07, H[1] + 0.035, H[2] + 0.115], [0.028, 0.016, 0.018], 0, 0.1, EYE, { e: 0.8 });

    // A long muzzle, the lips drawn back in a snarl: the upper jaw and nose, a dark mouth, the lower jaw dropped a
    // little, and white fangs top and bottom crossing the gap
    const up0: Vec3 = [0, H[1] - 0.005, H[2] + 0.07], up1: Vec3 = [0, H[1] - 0.045, H[2] + 0.33];
    const lo0: Vec3 = [0, H[1] - 0.08, H[2] + 0.05], lo1: Vec3 = [0, H[1] - 0.15, H[2] + 0.28];
    blob(m, [0, H[1] - 0.075, H[2] + 0.17], [0.055, 0.05, 0.12], 0, 0.1, MOUTH);
    frustum(m, up0, up1, 0.085, 0.042, 6, coat);
    box(m, [0, up1[1] + 0.012, up1[2] + 0.012], [0.05, 0.04, 0.035], NOSE, 0.1);
    frustum(m, lo0, lo1, 0.055, 0.03, 5, cream);
    for (const sx of [-1, 1]) {
      const x = sx * 0.038;
      frustum(m, [x, up1[1] - 0.005, up1[2] - 0.05], [x, up1[1] - 0.125, up1[2] - 0.035], 0.026, 0.003, 4, FANG);
      frustum(m, [x * 0.85, lo1[1] + 0.01, lo1[2] - 0.045], [x * 0.85, lo1[1] + 0.1, lo1[2] - 0.035], 0.021, 0.003, 4, FANG);
    }

    return 'Wolf';
  },
};

export default design;
