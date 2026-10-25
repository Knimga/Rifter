import type { Design } from '../../core/types';
import { blob, frustum, loft } from '../../core/primitives';
import { add, mixC, mul, norm, type RGB, type Vec3 } from '../../core/vec';
import { floorGlow } from '../_glow';

// Identity: a ghost floating over a pool of its own cold light. No legs: a flowing, see-through body, pale white
// at the head and shoulders fading to lavender, swaying as it rises and flaring at the bottom into a ragged hem
// with long tatters streaming in a wind. An electric blue heart glows through its chest; a closed hood, no face; thin, angular arms
// bent at sharp angles (like the Burning Spirit's), ending in three-fingered claws tipped with blue.
// Seeds vary the sway, the hem, the tatters and the wind's side, and the arms' angles.
const WHITE: RGB = [240, 242, 255];
const PALE: RGB = [214, 208, 246]; // white going lavender
const LAVENDER: RGB = [168, 146, 226];
const DUSK: RGB = [120, 98, 196]; // deep lavender, the tatters' ends
const BLUE: RGB = [90, 190, 255]; // electric blue
const BLUE_HOT: RGB = [170, 230, 255];
/** How far its body floats above where it was first drawn: clear air between its tatters and the floor glow. */
const LIFT = 0.18;

const design: Design = {
  id: 'creature.specter',
  source: { table: 'enemies', key: 'specter' }, // data/units/enemies.ts › specter
  category: 'creature',
  label: 'Specter',
  fit: { kind: 'standing', height: 1.4, maxRadius: 0.6 },
  budget: 1200,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    m.anchor('feet', [0, 0, 0]); // under the body: this point goes to the tile center

    // Floor glow: a pool of its cold light (it floats over it)
    m.part('glow');
    floorGlow(m, [150, 170, 255], 0.5, 0.5, 12);
    const s0 = m.faces.length; // everything after the glow floats (lifted at the end: LIFT)

    // Body: a flowing column from the ragged hem up through the waist to the shoulders, swaying side to side and
    // leaning a little forward as it rises. See-through and faintly glowing; lavender at the hem to white at
    // the shoulders.
    m.part('torso', [0, 1.0, 0]);
    const N = 12;
    const swayPhase = rf(0, Math.PI * 2), swayAmp = rf(0.03, 0.06);
    const sway = (y: number): [number, number] => [Math.sin(y * 4 + swayPhase) * swayAmp, (y - 0.4) * 0.06];
    const ring = (y: number, r: number, jag: number): Vec3[] => {
      const [sx, sz] = sway(y);
      return Array.from({ length: N }, (_, i) => {
        const a = (i / N) * Math.PI * 2, k = r * (1 + rf(-jag, jag));
        return [sx + Math.sin(a) * k, y + rf(-jag, jag) * 0.3, sz + Math.cos(a) * k * 0.8];
      });
    };
    const bodyColor = (cen: Vec3): RGB => {
      const t = Math.min(1, Math.max(0, (cen[1] - 0.45) / 1.0)); // 0 at the hem, 1 at the shoulders
      return t < 0.5 ? mixC(LAVENDER, PALE, t * 2) : mixC(PALE, WHITE, (t - 0.5) * 2);
    };
    const hem = ring(0.45, 0.3, 0.22);
    loft(m, [hem, ring(0.66, 0.25, 0.12), ring(0.9, 0.19, 0.08), ring(1.14, 0.23, 0.05), ring(1.36, 0.26, 0.04), ring(1.52, 0.12, 0.04)],
      bodyColor, { a: 0.6, e: 0.4, j: 0.1, caps: false });
    // Its heart: electric blue, glowing through the chest
    const heart: Vec3 = [sway(1.18)[0], 1.18, sway(1.18)[1] + 0.02];
    blob(m, heart, [0.07, 0.09, 0.06], 0, 0.2, BLUE_HOT, { e: 1, j: 0.05 });

    // Tatters: long ragged strips torn from all over its lower body (from the hem up past the waist), streaming
    // in a wind: out from the body, all swept the same way to one side and a little back, rippling as they go
    // (never pointed at or away from the camera: they sweep sideways). Lavender fading to deep lavender.
    const windSide = c.chance(0.5) ? 1 : -1;
    /** The body's radius at height y (its profile, hem to waist). */
    const radiusAt = (y: number) => (y < 0.66 ? 0.3 + (0.25 - 0.3) * ((y - 0.45) / 0.21) : 0.25 + (0.19 - 0.25) * ((y - 0.66) / 0.24));
    for (let i = 0, n = ri(12, 16); i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rf(-0.2, 0.2), y = rf(0.48, 0.86);
      const [bx, bz] = sway(y), rr = radiusAt(y);
      const out: Vec3 = [Math.sin(a), 0, Math.cos(a) * 0.8];
      let p: Vec3 = [bx + out[0] * rr, y, bz + out[2] * rr];
      // Where it streams: mostly down, blown out from the body and the wind's way (sideways, a little back), never
      // close to level (at least about 45 degrees below it)
      const dir = norm([out[0] * 0.3 + windSide * 0.45, rf(-1, -0.75), out[2] * 0.3 - 0.15]);
      const len = rf(0.32, 0.55), segs = 4, ph = rf(0, Math.PI * 2);
      let w = rf(0.04, 0.055);
      for (let k = 0; k < segs; k++) {
        const ripple = Math.sin(k * 1.9 + ph) * 0.035;
        const next: Vec3 = [p[0] + dir[0] * (len / segs), p[1] + dir[1] * (len / segs) + ripple, p[2] + dir[2] * (len / segs) + ripple * 0.5];
        const w2 = k === segs - 1 ? 0.003 : w * 0.75;
        frustum(m, p, next, w, w2, 3, mixC(LAVENDER, DUSK, k / (segs - 1)), { a: 0.55 - k * 0.05, e: 0.35, j: 0.12, caps: false });
        p = next;
        w = w2;
      }
    }

    // Head: a hood. A cowl draped over the shoulders, rising to a point swept back over the head, pale and
    // faintly glowing, rounded over the head with a soft point swept back. No opening, no face.
    m.part('head', [0, 1.56, 0.06]);
    const [hx, hz] = sway(1.66);
    const H = 10;
    const hoodRing = (y: number, rad: number, dz: number): Vec3[] =>
      Array.from({ length: H }, (_, i) => {
        const a = (i / H) * Math.PI * 2, k = rad * (1 + rf(-0.05, 0.05));
        return [hx + Math.sin(a) * k, y, hz + dz + Math.cos(a) * k * 0.9];
      });
    loft(m, [hoodRing(1.44, 0.21, 0.02), hoodRing(1.58, 0.17, 0.05), hoodRing(1.7, 0.16, 0.03), hoodRing(1.78, 0.13, -0.02), hoodRing(1.83, 0.07, -0.08), hoodRing(1.85, 0.015, -0.13)],
      (cen) => (cen[1] > 1.6 ? WHITE : PALE), { a: 0.8, e: 0.4, j: 0.08 });

    // Arms: thin and jagged, close to the body's sides, each joint bending front-to-back (never out to the side,
    // as the Burning Spirit's): down and back from the shoulder, a sharp kink forward, the hands held in front at
    // waist height; three claws branch from the wrist and hang down, tipped with electric blue
    for (const sx of [-1, 1]) {
      const [bx, bz] = sway(1.36);
      const sh: Vec3 = [bx + sx * 0.25, 1.38, bz + 0.03];
      const elbow: Vec3 = [bx + sx * rf(0.29, 0.31), rf(1.08, 1.14), bz + rf(-0.14, -0.1)];
      const kink: Vec3 = [bx + sx * rf(0.3, 0.32), rf(0.92, 0.96), bz + rf(0.1, 0.14)];
      const wrist: Vec3 = [bx + sx * rf(0.29, 0.31), rf(0.96, 1.0), bz + rf(0.28, 0.32)];
      m.part(sx > 0 ? 'arm_l' : 'arm_r', sh);
      frustum(m, sh, elbow, 0.04, 0.03, 4, PALE, { a: 0.8, e: 0.4, caps: false });
      frustum(m, elbow, kink, 0.03, 0.026, 4, PALE, { a: 0.8, e: 0.4, caps: false });
      frustum(m, kink, wrist, 0.026, 0.022, 4, LAVENDER, { a: 0.8, e: 0.4, caps: false });
      for (const f of [-1, 0, 1]) {
        const dir = norm([sx * f * 0.45, -0.55, 1]);
        const knuckle = add(wrist, mul(dir, rf(0.1, 0.13)));
        const tip = add(knuckle, mul(norm([sx * f * 0.3, -1, 0.12]), rf(0.1, 0.13)));
        frustum(m, wrist, knuckle, 0.02, 0.013, 4, LAVENDER, { a: 0.85, e: 0.4, caps: false });
        frustum(m, knuckle, tip, 0.013, 0.002, 4, BLUE, { e: 0.8, caps: false });
      }
      m.anchor(sx > 0 ? 'hand_l' : 'hand_r', wrist);
    }

    // It floats: everything but the floor glow lifted, so there is clear air between its tatters and the pool of
    // light (its pivots, anchors and its heart's halo with it)
    const up = (p: Vec3): Vec3 => [p[0], p[1] + LIFT, p[2]];
    m.xf(s0, up);
    for (const k of ['torso', 'head', 'arm_l', 'arm_r']) if (m.pivots[k]) m.pivots[k] = up(m.pivots[k]);
    for (const k of ['hand_l', 'hand_r']) if (m.anchors[k]) m.anchors[k] = up(m.anchors[k]);
    m.halo(up(heart), 0.24, BLUE);

    return 'Specter';
  },
};

export default design;
