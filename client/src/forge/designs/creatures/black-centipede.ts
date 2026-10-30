import type { Design } from '../../core/types';
import { frustum, jointedLimb, loft, tendril, tube } from '../../core/primitives';
import { add, cross, dot, hslRGB, len, lerp3, mixC, mul, norm, sub, type RGB, type Vec3 } from '../../core/vec';
import type { Mesh } from '../../core/mesh';

// Identity: a large (2x2) black centipede, built like the real thing: a head with long antennae and two big curved
// pincer jaws (forcipules) closing in front of it, then 15-17 flattened body segments, each a hard dorsal plate over a
// purple joint membrane, each with one pair of jointed legs splayed out to the floor; the last pair long and trailing
// (terminal legs). Its front reared up (head and three segments rising, pincers forward); the rest of the body
// serpentines behind it across its square in an S-curve. Near-black, a faint violet sheen on the plates, purple joints,
// leg tips and underside; the pincers glow venom green toward their tips, haloed along the glow. Seeds vary the S-curve (which way,
// how wide), how high it rears, the segment count, and small leg and color differences.

/** Venom on the pincer tips, and the halo along it (hotter, so it blooms past them). */
const VENOM: RGB = [120, 224, 84];
const VENOM_HALO: RGB = [184, 255, 146];
const VENOM_HALO_R = 0.055;

/** `n` points evenly spaced along a polyline (by length), its first and last included. */
function resample(pts: Vec3[], n: number): Vec3[] {
  const at = [0];
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + len(sub(pts[i], pts[i - 1])));
  const total = at[at.length - 1];
  const out: Vec3[] = [];
  for (let k = 0, i = 1; k < n; k++) {
    const d = (k / (n - 1)) * total;
    while (i < pts.length - 1 && at[i] < d) i++;
    const t = (d - at[i - 1]) / Math.max(1e-9, at[i] - at[i - 1]);
    out.push(lerp3(pts[i - 1], pts[i], Math.min(1, Math.max(0, t))));
  }
  return out;
}

/**
 * A ring around `c` in the plane of `side` and `back`: a plate's cross-section, its sides squared out into flanges
 * (the hard edges a centipede's plates have), flatter on its belly (below) than on its back.
 */
function plateRing(c: Vec3, side: Vec3, back: Vec3, w: number, h: number, sides: number): Vec3[] {
  return Array.from({ length: sides }, (_, j) => {
    const a = (j / sides) * Math.PI * 2, up = Math.sin(a), out = Math.cos(a);
    const flange = Math.sign(out) * Math.abs(out) ** 0.6;
    return add(c, add(mul(side, flange * w), mul(back, up * h * (up > 0 ? 1 : 0.65))));
  });
}

/** A leg from `hip` through `knee` to `foot` (jointedLimb): a thicker upper part, a thin lower one in its own color. */
function leg(m: Mesh, hip: Vec3, knee: Vec3, foot: Vec3, upper: RGB, lower: RGB, w: number): void {
  jointedLimb(m, [hip, knee, foot], [w, w * 0.75, w * 0.3], [upper, lower], { sides: 4, j: 0.12 });
}

const design: Design = {
  id: 'creature.black-centipede',
  source: { table: 'enemies', key: 'black-centipede' }, // data/units/enemies.ts › black-centipede
  category: 'creature',
  label: 'Black Centipede',
  // Large: about its 2x2 square, a little past it (its reach from the middle sets the size; 21% over a radius of 1)
  fit: { kind: 'standing', height: 1.6, maxRadius: 1.21 },
  budget: 3400,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;

    // Colors: near-black plates with a faint violet sheen on top; purple joints, leg tips and underside
    const hue = rf(262, 272), accent = rf(276, 290);
    const TOP = hslRGB(hue, rf(12, 18), rf(13, 16)), SIDE = hslRGB(hue, 10, rf(7, 9));
    const BELLY = hslRGB(accent, rf(22, 30), rf(12, 15)), JOINT = hslRGB(accent, rf(30, 40), rf(17, 22));
    const LEG = hslRGB(hue, 10, 9), LEG_TIP = hslRGB(accent, rf(28, 36), rf(19, 24));
    const plate = (back: Vec3) => (_: Vec3, n: Vec3) => {
      const d = dot(n, back);
      return d > 0.55 ? TOP : d < -0.35 ? BELLY : SIDE;
    };

    // ─── The spine: head at the top of the reared front, then down and back along an S-curve to the tail ───
    const LEG_H = 0.11; // how high the body rides over the floor
    const turn = c.pick([1, -1]); // which way the S-curve swings first: out one side, back, and out again
    const amp = rf(0.42, 0.5), wave = rf(2.6, 3) * Math.PI;
    const zBase = 0.45, length = 1.85;
    // It leaves the reared front heading straight back (1 - cos: no sideways slope at its start), so the plates
    // there face the same way as the reared ones above them
    const ground: Vec3[] = Array.from({ length: 61 }, (_, k) => {
      const t = k / 60;
      return [turn * amp * (1 - Math.cos(t * wave)), LEG_H, zBase - t * length];
    });
    // Reared, a cobra's stance: a column rising from where the body leaves the floor, then curving over forward at
    // the top, so the head points down at the floor in front of it. Listed from the head down to the floor.
    const rise = rf(0.62, 0.74), lean = rf(0.05, 0.09), curl = rf(0.2, 0.24), over = rf(2.5, 2.75);
    const top: Vec3 = [0, LEG_H + rise, zBase + lean];
    const column: Vec3[] = Array.from({ length: 9 }, (_, k) => {
      const f = k / 8;
      return [0, LEG_H + rise * f, zBase + lean * f * f];
    });
    // The curl: an arc over the top (angle 0: rising; past PI / 2: turning down), the head at its end
    const arc: Vec3[] = Array.from({ length: 10 }, (_, k) => {
      const b = (k / 9) * over;
      return [0, top[1] + curl * Math.sin(b), top[2] + curl * (1 - Math.cos(b))];
    });
    const reared = [...column, ...arc.slice(1)].reverse();
    // Segments spaced evenly along each part: the reared front's (the head first) and the floor's
    const nUp = ri(6, 7), nDown = ri(17, 19), n = nUp + nDown;
    const upPts = resample(reared, nUp + 1); // the head, then the reared segments (its last point is the floor's first)
    const downPts = resample(ground, nDown + 1).slice(1);
    const centers = [...upPts, ...downPts]; // [0]: the head; 1..n: the segments (1..nUp reared)
    const C = centers;

    // Each point's frame: forward (toward the head), its left side, and its back (dorsal). On the floor, carried
    // from the tail along the S-curve, so the sides never flip as it turns. Reared (the head too): its sides stay
    // left and right, so the raised plates face the front with their undersides, and the curl over the top
    // bends straight forward and down, never sideways.
    const T = C.map((_, i) => norm(sub(C[Math.max(0, i - 1)], C[Math.min(n, i + 1)])));
    const S: Vec3[] = [], D: Vec3[] = [];
    let side = norm(cross([0, 1, 0], T[n]));
    for (let i = n; i >= 0; i--) {
      side = i <= nUp ? [1, 0, 0] : norm(sub(side, mul(T[i], dot(side, T[i]))));
      S[i] = side;
      D[i] = norm(cross(T[i], side));
    }
    // Width along the body: narrower behind the head, broad through the middle, tapering to the tail
    const widthAt = (i: number) => {
      const t = i / n;
      return 0.2 * Math.min(1, 0.7 + t * 1.6) * Math.min(1, 0.55 + (1 - t) * 2.2);
    };
    const REARED = nUp; // segments rising with the head

    // ─── Body segments: a hard plate over a purple joint membrane, and a pair of legs ───
    for (let i = 1; i <= n; i++) {
      const c0 = C[i], t = T[i], s = S[i], d = D[i];
      const w = widthAt(i) * rf(0.96, 1.04), h = w * 0.32;
      const segLen = len(sub(C[i - 1], c0)); // the spacing differs a little between the reared front and the floor
      const ring = (o: number, k: number) => plateRing(add(c0, mul(t, o * segLen)), s, d, w * k, h * k, 10);
      // The membrane at its back (between it and the segment behind), then the plate, its front edge drawn in
      loft(m, [ring(-0.55, 0.7), ring(-0.36, 0.86)], JOINT, { bandCenters: true, caps: false, j: 0.1 });
      loft(m, [ring(-0.36, 0.97), ring(0.05, 1), ring(0.48, 0.84)], plate(d), { bandCenters: true, j: 0.14 });

      for (const sd of [1, -1]) {
        const hip = add(c0, add(mul(s, sd * w * 0.82), mul(d, -h * 0.25)));
        // Each pair a little ahead or behind the last, alternating, as a walking centipede's legs ripple
        const sway = (i % 2 === 0 ? 1 : -1) * sd * rf(0.01, 0.04);
        if (i === n) {
          // Terminal legs: long, trailing straight back from the tail, a little apart
          const knee = add(hip, add(mul(t, -0.17), mul(s, sd * 0.07)));
          const tip = add(knee, add(mul(t, -0.2), mul(s, sd * 0.06)));
          leg(m, hip, [knee[0], knee[1] + 0.02, knee[2]], [tip[0], 0.03, tip[2]], LEG, LEG_TIP, 0.016);
        } else if (i <= REARED) {
          // Reared: legs held out from the raised body, claws reaching forward
          const knee = add(hip, add(mul(s, sd * 0.13), mul(t, 0.04 + sway)));
          const foot = add(knee, add(mul(s, sd * 0.07), add(mul(t, 0.09), mul(d, -0.05))));
          leg(m, hip, knee, foot, LEG, LEG_TIP, 0.017);
        } else {
          // On the floor: splayed out sideways, the knee raised, the foot down
          const knee = add(hip, add(mul(s, sd * 0.17), add([0, 0.08, 0], mul(t, sway))));
          const foot = add(hip, add(mul(s, sd * 0.34), mul(t, sway * 2)));
          leg(m, hip, knee, [foot[0], 0, foot[2]], LEG, LEG_TIP, 0.018);
        }
      }
    }

    // ─── The head: a flat capsule, its front tipped down over the pincers ───
    const h0 = C[0], t0 = norm(add(T[0], [0, -0.12, 0])), s0 = S[0], d0 = norm(cross(t0, s0));
    const HW = 0.13, HH = 0.058;
    const headRing = (o: number, k: number) => plateRing(add(h0, mul(t0, o)), s0, d0, HW * k, HH * k, 10);
    loft(m, [headRing(-0.075, 0.8), headRing(-0.03, 1), headRing(0.04, 0.94), headRing(0.085, 0.55)], plate(d0), { bandCenters: true, j: 0.12 });

    for (const sd of [1, -1]) {
      // Antennae: long, sweeping out and forward, arching a little and drooping at their tips
      const base = add(h0, add(mul(t0, 0.07), add(mul(s0, sd * 0.045), mul(d0, 0.025))));
      const dir = add(mul(t0, 0.75), add(mul(s0, sd * rf(0.55, 0.75)), mul(d0, 0.3)));
      tendril(m, base, dir, rf(0.3, 0.36), 6, 0.011, (k) => mixC(LEG, LEG_TIP, k), {
        sides: 3, caps: false,
        bend: (k) => add(mul(s0, sd * 0.05 * k * k), mul(d0, -0.09 * k * k)),
      });

      // Pincers (forcipules): from under the head's front, curving forward and in, the tips nearly meeting
      const root = add(h0, add(mul(t0, 0.03), add(mul(s0, sd * 0.06), mul(d0, -0.04))));
      const b1 = add(root, add(mul(t0, 0.07), add(mul(s0, sd * 0.04), mul(d0, -0.012))));
      const b2 = add(b1, add(mul(t0, 0.07), mul(s0, sd * 0.004)));
      const tip = add(b2, add(mul(t0, 0.035), mul(s0, -sd * 0.05)));
      tube(m, [root, b1, b2], 0.026, 0.013, 6, (_, nrm) => (nrm[1] > 0.4 ? mixC(TOP, JOINT, 0.5) : JOINT), { caps: false, j: 0.12 });
      frustum(m, b2, tip, 0.013, 0.002, 6, VENOM, { e: 1, j: 0 });
      // A glow along the venom end of each jaw: where the green starts, and near its tip
      for (const k of [0, 0.7]) m.halo(lerp3(b2, tip, k), VENOM_HALO_R, VENOM_HALO);
    }

    // Centered on its square: the middle of everything's reach (legs, antennae and jaws too) goes to the feet anchor,
    // so the whole of it sits evenly inside its 2x2
    const pts = m.faces.flatMap((f) => f.v);
    const mid = (k: 0 | 2) => (Math.min(...pts.map((p) => p[k])) + Math.max(...pts.map((p) => p[k]))) / 2;
    m.anchor('feet', [mid(0), 0, mid(2)]);

    return 'Black Centipede';
  },
};

export default design;
