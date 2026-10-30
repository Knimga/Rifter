import type { Design } from '../../core/types';
import { bipyr, blob } from '../../core/primitives';
import { add, hslRGB, mul, rotX, rotY, rotZ, type RGB, type Vec3 } from '../../core/vec';
import type { Mesh } from '../../core/mesh';

// Identity: a wheeling cluster of near-black bats: 6-8 of them circling a tilted ring around the swarm's middle,
// each banked into the turn at its own tilt, caught at its own point in the wingbeat (some wings raised high, some
// swept down, some folding), so the cluster reads as flapping. No animation. Bodies near-black, their tops only a
// faint cold sheen, wings a shade more violet; every bat shows tiny white eyes, each with a small halo. Seeds vary
// how many bats, where each flies, its size, tilt and wingbeat, and the ring's tilt.

/** Where the swarm's middle hovers (its own y = 0 is the floor: it floats). */
const MID_Y = 0.5;
/** Tiny white eyes (a cold white), and the small halo on each, hotter so it blooms past them. */
const EYE: RGB = [176, 188, 255];
const EYE_HALO: RGB = [206, 214, 255];
const EYE_HALO_R = 0.0225;

/**
 * One wing of a bat, built flat in the bat's own space (x out to `side`, z forward, y up), from the shoulder: the
 * leading edge out through the wrist to the tip, the trailing edge scalloped between the fingers back to the body.
 * `flap` (radians) raises it at the shoulder (negative sweeps it down) and bends the outer half a little more, as a
 * beating wing curves; `fold` (0..1) draws the fingers in toward the wrist (the upstroke). Both sides drawn: it is a
 * membrane, seen from above or below as the bat tilts.
 */
function wing(m: Mesh, side: 1 | -1, flap: number, fold: number, top: RGB, under: RGB, place: (p: Vec3) => Vec3): void {
  const reach = 1 - 0.3 * fold;
  const raw: Record<string, Vec3> = {
    S: [0.018, 0.004, 0.012], W: [0.09, 0.016, 0.026], T: [0.175, 0, 0.004],
    F2: [0.152, 0, -0.05], F3: [0.1, 0, -0.078], B: [0.012, 0, -0.05],
  };
  // The scallops between the fingers: each midway, drawn in toward the wrist
  const mid = (a: Vec3, b: Vec3): Vec3 => {
    const p = mul(add(a, b), 0.5);
    return add(mul(p, 0.72), mul(raw.W, 0.28));
  };
  raw.m1 = mid(raw.T, raw.F2);
  raw.m2 = mid(raw.F2, raw.F3);
  raw.m3 = mid(raw.F3, raw.B);
  const pose = (p: Vec3): Vec3 => {
    const x = p[0] * (p[0] > 0.09 ? reach : 1);
    const lift = x * Math.tan(flap) + Math.max(0, x - 0.09) * Math.tan(flap * 0.45);
    return place([x * side, p[1] + lift, p[2]]);
  };
  const P = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, pose(v)])) as Record<string, Vec3>;
  const faces: [string, string, string][] = [
    ['W', 'T', 'm1'], ['W', 'm1', 'F2'], ['W', 'F2', 'm2'], ['W', 'm2', 'F3'], ['W', 'F3', 'S'], ['S', 'F3', 'm3'], ['S', 'm3', 'B'],
  ];
  // A point above and one below the membrane, in the bat's own space: each side of a face turns away from one
  const up = place([0.09 * side, 0.4, -0.02]), down = place([0.09 * side, -0.4, -0.02]);
  for (const [a, b, c] of faces) {
    m.tri(P[a], P[b], P[c], top, down, { j: 0.14 });
    m.tri(P[a], P[b], P[c], under, up, { j: 0.14 });
  }
}

const design: Design = {
  id: 'creature.echo-bat-swarm',
  source: { table: 'enemies', key: 'echo-bat-swarm' }, // data/units/enemies.ts › echo-bat-swarm
  category: 'creature',
  label: 'Echo Bat Swarm',
  // The radius is the limiting fit: the farthest wingtip reaches the tile's edge
  fit: { kind: 'standing', height: 1.25, maxRadius: 0.5, floor: 'origin' },
  budget: 1000,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    m.anchor('feet', [0, 0, 0]); // under the swarm: this point goes to the tile center

    const hue = rf(222, 234);
    const ringTilt = rf(-0.3, 0.3), ringTiltAxis = rf(0, Math.PI);
    const n = ri(6, 8);
    // A bat's eyes, in its own space at `eyeAt`: built there and flown into place with it (`move`: on their own,
    // after the swarm; otherwise its body's xf moves them)
    const eyeAt = (s: number): Vec3 => [0.009 * s, 0.014, 0.068];
    const eyes = (place: (p: Vec3) => Vec3, move: boolean) => {
      const from = m.faces.length;
      for (const s of [1, -1]) bipyr(m, eyeAt(s), 0.0065, 0.006, 3, EYE, { e: 1, j: 0 });
      if (move) m.xf(from, place);
    };
    const eyesLater: ((p: Vec3) => Vec3)[] = [];
    for (let i = 0; i < n; i++) {
      // Where it flies: round a ring (evenly spaced, nudged), at its own radius and height; the ring itself tipped
      const theta = (i / n) * Math.PI * 2 + rf(-0.2, 0.2);
      const r = rf(0.2, 0.3);
      const ring: Vec3 = [Math.cos(theta) * r, rf(-0.26, 0.26), Math.sin(theta) * r];
      const at = add(rotY(rotX(rotY(ring, -ringTiltAxis), ringTilt), ringTiltAxis), [0, MID_Y, 0]);
      // Facing along the turn, banked into it (inner wing down), each at its own tilt
      const yaw = Math.PI - theta;
      const bank = -rf(0.15, 0.55), pitch = rf(-0.2, 0.2);
      const size = rf(0.85, 1.05);
      const place = (p: Vec3): Vec3 => add(rotY(rotX(rotZ(mul(p, size), bank), pitch), yaw), at);

      // Its colors: near-black, the tops only a faint cold sheen; the wings a shade more violet
      const lBody = rf(5, 7);
      const body = hslRGB(hue, rf(8, 12), lBody), bodyTop = hslRGB(hue, 12, lBody + rf(6, 8));
      const wingUnder = hslRGB(hue + 14, rf(8, 12), rf(4, 6)), wingTop = hslRGB(hue + 14, 12, rf(11, 14));
      const byLight = (n: Vec3) => (n[1] > 0.35 ? bodyTop : body);

      // Body and head, built along +z, then flown into place
      const from = m.faces.length;
      blob(m, [0, 0, -0.004], [0.026, 0.021, 0.048], 0, 0.14, (_, nrm) => byLight(nrm));
      blob(m, [0, 0.008, 0.05], [0.021, 0.019, 0.021], 0, 0.14, (_, nrm) => byLight(nrm));
      // Pointed ears, both sides of each
      for (const s of [1, -1]) {
        const ear: Vec3[] = [[0.004 * s, 0.024, 0.056], [0.02 * s, 0.054, 0.044], [0.015 * s, 0.022, 0.04]];
        m.tri(ear[0], ear[1], ear[2], bodyTop, [0.012 * s, 0.03, 0.2]);
        m.tri(ear[0], ear[1], ear[2], body, [0.012 * s, 0.03, -0.2]);
      }
      // Eyes on every one: tiny white points, each with a small halo. Most are drawn here; the rest after the whole
      // swarm (eyesLater), since drawing faces uses up rolls and the bats after would fly elsewhere than they did.
      if (c.chance(0.65)) eyes(place, false);
      else eyesLater.push(place);
      m.xf(from, place);
      for (const s of [1, -1]) m.halo(place(eyeAt(s)), EYE_HALO_R, EYE_HALO);

      // The wings at this bat's point in the beat: high on the upstroke (fingers drawn in), low on the downstroke
      const beat = rf(0, Math.PI * 2);
      const flap = 0.15 + Math.sin(beat) * 0.75;
      const fold = Math.max(0, Math.cos(beat)) * (flap > 0 ? 0.8 : 0.3);
      for (const s of [1, -1] as const) wing(m, s, flap, fold, wingTop, wingUnder, place);
    }
    for (const place of eyesLater) eyes(place, true);

    return 'Echo Bat Swarm';
  },
};

export default design;
