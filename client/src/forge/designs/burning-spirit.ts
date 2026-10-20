import type { Design } from '../core/types';
import { blob, frustum, loft } from '../core/primitives';
import { add, mixC, mul, norm, type RGB, type Vec3 } from '../core/vec';
import { floorGlow } from '../designs/_glow';

// Identity: a tall wraith of living fire, floating over a pool of its own light. No legs: a ghostly,
// see-through body that rises from a flickering point, burning white-hot at its core and yellow through
// the body, with orange and red at its ragged edges and flame tips. Thin, jagged, angular arms bent at sharp
// angles, each ending in a three-fingered claw. A long head crowned with flames, with two black eyes.
// Seeds vary the flames, the body's ragged edge and the arms' angles.
const WHITE: RGB = [255, 250, 230];
const PALE: RGB = [255, 238, 160]; // the chest: white-hot but warm (pure white reads grey when see-through)
const YELLOW: RGB = [255, 218, 92];
const ORANGE: RGB = [255, 140, 40];
const RED: RGB = [214, 44, 24];
const EYE: RGB = [10, 8, 8];

const design: Design = {
  id: 'creature.burning-spirit',
  source: { table: 'enemies', key: 'burning-spirit' }, // data/enemies.ts › BOSS_CLASSES › burning-spirit
  category: 'creature',
  label: 'Burning Spirit',
  fit: { kind: 'standing', height: 1.7, maxRadius: 0.8 }, // a boss: taller than the regular enemies
  budget: 900,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    m.anchor('feet', [0, 0, 0]); // under the body: this point goes to the tile center

    // Floor glow, like the portals': a soft pool of its fire on the floor
    m.part('glow');
    floorGlow(m, [255, 176, 80], 0.62, 0.62, 12);

    // Body: a ragged flame column, from a point hovering over the floor up through a narrow waist to broad
    // shoulders. See-through and partly glowing; its color climbs from red at the tip to white at the chest.
    m.part('torso', [0, 1.0, 0]);
    const N = 10;
    const ring = (y: number, r: number, jag: number, z = 0): Vec3[] =>
      Array.from({ length: N }, (_, i) => {
        const a = (i / N) * Math.PI * 2, k = r * (1 + rf(-jag, jag));
        return [Math.sin(a) * k, y + rf(-jag, jag) * 0.15, z + Math.cos(a) * k * 0.8];
      });
    const bodyColor = (cen: Vec3): RGB => {
      const t = Math.min(1, Math.max(0, (cen[1] - 0.2) / 1.2)); // 0 at the tip, 1 at the chest
      return t < 0.3 ? mixC(RED, ORANGE, t / 0.3) : t < 0.65 ? mixC(ORANGE, YELLOW, (t - 0.3) / 0.35) : mixC(YELLOW, PALE, (t - 0.65) / 0.35);
    };
    loft(m, [ring(0.2, 0.03, 0.2), ring(0.5, 0.13, 0.35), ring(0.82, 0.19, 0.3), ring(1.12, 0.26, 0.18, 0.02), ring(1.4, 0.29, 0.1, 0.03), ring(1.58, 0.13, 0.1, 0.04)],
      bodyColor, { a: 0.82, e: 0.45, j: 0.12 });
    // A white-hot core showing through the chest
    blob(m, [0, 1.2, 0.03], [0.13, 0.17, 0.11], 0, 0.2, WHITE, { e: 1, j: 0.05 });

    // Flame tongues licking up off the shoulders and back, leaning outward (yellow, tipped orange or red)
    for (let i = 0, n = ri(6, 8); i < n; i++) {
      const sx = i % 2 === 0 ? 1 : -1;
      const base: Vec3 = [sx * rf(0.08, 0.3), rf(1.2, 1.5), rf(-0.12, 0.05)];
      const len = rf(0.16, 0.3);
      frustum(m, base, [base[0] + sx * len * 0.5, base[1] + len, base[2] - len * 0.2], 0.05, 0.004, 4, c.pick([ORANGE, RED, YELLOW]), { e: 0.9, caps: false });
    }

    // Head: long and narrow, glowing, crowned with flames; two black eyes
    m.part('head', [0, 1.7, 0.04]);
    const H: Vec3 = [0, 1.76, 0.05];
    blob(m, H, [0.14, 0.18, 0.14], 1, 0.08, PALE, { e: 0.6, j: 0.08 });
    for (const sx of [-1, 1]) blob(m, [sx * 0.055, H[1] + 0.01, H[2] + 0.12], [0.035, 0.045, 0.025], 0, 0.05, EYE, { j: 0.03 });
    for (let i = 0, n = ri(5, 7); i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1) - 0.5; // -0.5..0.5 across the crown
      const base: Vec3 = [t * 0.2, H[1] + 0.12, H[2] - 0.04 - Math.abs(t) * 0.05];
      const len = rf(0.18, 0.34) * (1 - Math.abs(t) * 0.6);
      frustum(m, base, [base[0] + t * 0.18, base[1] + len, base[2] - len * 0.3], 0.05, 0.004, 4, i % 2 ? ORANGE : c.pick([YELLOW, RED]), { e: 0.9, caps: false });
    }

    // Arms: thin and jagged, close to the body's sides, every joint bending front-to-back (never out to the
    // side): the upper arm drops from the shoulder down and back, the forearm zigzags forward through a sharp
    // kink, and the hands are held just in front of it at about waist height, slightly raised. The forearm
    // splits at the wrist into three fingers like branches, hanging down toward the ground in front of it.
    for (const sx of [-1, 1]) {
      const sh: Vec3 = [sx * 0.29, 1.42, 0.04];
      const elbow: Vec3 = [sx * rf(0.33, 0.35), rf(1.12, 1.18), rf(-0.14, -0.1)];
      const kink: Vec3 = [sx * rf(0.34, 0.36), rf(0.96, 1.0), rf(0.12, 0.16)];
      const wrist: Vec3 = [sx * rf(0.33, 0.35), rf(1.0, 1.05), rf(0.3, 0.34)];
      m.part(sx > 0 ? 'arm_l' : 'arm_r', sh);
      frustum(m, sh, elbow, 0.05, 0.035, 4, YELLOW, { e: 0.6, caps: false });
      frustum(m, elbow, kink, 0.035, 0.03, 4, YELLOW, { e: 0.6, caps: false });
      frustum(m, kink, wrist, 0.03, 0.027, 4, ORANGE, { e: 0.6, caps: false });

      // Three fingers branching from the wrist and hanging down, fanned a little sideways (in, straight, out)
      // so the three read from any angle. Each arches over (convex seen from the front): forward and a little
      // down to the knuckle, then the tip curves down toward the ground, like a claw. Tapering to a red point;
      // as thick at the fork as the forearm is, so they read as the arm splitting rather than a hand.
      for (const f of [-1, 0, 1]) {
        const dir = norm([sx * f * 0.45, -0.55, 1]);
        const knuckle = add(wrist, mul(dir, rf(0.11, 0.14)));
        const bend = norm([sx * f * 0.3, -1, 0.12]);
        const tip = add(knuckle, mul(bend, rf(0.11, 0.14)));
        frustum(m, wrist, knuckle, 0.024, 0.015, 4, ORANGE, { e: 0.7, caps: false });
        frustum(m, knuckle, tip, 0.015, 0.002, 4, RED, { e: 0.8, caps: false });
      }
      m.anchor(sx > 0 ? 'hand_l' : 'hand_r', wrist);
    }

    // Mantle: a broad cape of flame over the top of the torso, flaring out past the shoulders so it caps
    // over the tops of the arms, its lower edge ragged like flame. Drawn last, so the rest of the body is
    // built exactly as before for every seed.
    m.part('torso', [0, 1.0, 0]);
    // Its outline is a rounded rectangle-ish oval (a superellipse), so the left and right ends are blunt and
    // round rather than pointed; the ragged jitter is mostly up and down (the hem), little in width
    const M = 16;
    const round = (v: number) => Math.sign(v) * Math.abs(v) ** 0.6;
    const mantleRing = (y: number, rx: number, rz: number, jag: number): Vec3[] =>
      Array.from({ length: M }, (_, i) => {
        const a = (i / M) * Math.PI * 2, k = 1 + rf(-jag, jag) * 0.3;
        return [round(Math.sin(a)) * rx * k, y + rf(-jag, jag) * 0.5, 0.02 + round(Math.cos(a)) * rz * k];
      });
    // Bright like the body's top (pale gold), going orange at the ragged hem; narrow front-to-back and set
    // back a little, so it caps the shoulders and back but leaves the glowing chest open
    const mantleColor = (cen: Vec3): RGB => {
      const t = Math.min(1, Math.max(0, (cen[1] - 1.38) / 0.2)); // 0 at the hem, 1 at the neck
      return t < 0.5 ? mixC(ORANGE, YELLOW, t * 2) : mixC(YELLOW, PALE, (t - 0.5) * 2);
    };
    // Rings from the neck down; the last one tucks back under the widest, so the edge rolls round instead of
    // ending in a sharp lip
    loft(m, [
      mantleRing(1.6, 0.15, 0.12, 0.04), mantleRing(1.54, 0.34, 0.18, 0.05),
      mantleRing(1.45, 0.44, 0.22, 0.1), mantleRing(1.37, 0.4, 0.2, 0.12),
    // See-through and partly glowing like the body (glow must stay below 0.5, or the game draws it solid)
    ].map((r) => r.map(([x, y, z]): Vec3 => [x, y, z - 0.03])), mantleColor, { a: 0.82, e: 0.45, j: 0.1 });

    // More spikes, standing on the mantle: a row along the top of each shoulder (leaning outward) and a ridge
    // down the back (leaning back and out), flame-colored
    const spikeColors = [ORANGE, RED, YELLOW, RED];
    for (const sx of [-1, 1]) {
      for (let i = 0, n = ri(3, 4); i < n; i++) {
        const t = (i + 0.5) / n; // along the shoulder, from the neck outward
        const base: Vec3 = [sx * (0.18 + t * 0.22), 1.56 - t * 0.09, rf(-0.06, 0.04)];
        const len = rf(0.16, 0.26) * (1.1 - t * 0.3);
        frustum(m, base, [base[0] + sx * len * 0.55, base[1] + len, base[2] - len * 0.15], 0.05, 0.004, 4, c.pick(spikeColors), { e: 0.9, caps: false });
      }
    }
    for (let i = 0, n = ri(4, 5); i < n; i++) {
      const t = (i + 0.5) / n; // down the back, from the neck
      const sx = i % 2 === 0 ? 1 : -1;
      const base: Vec3 = [sx * rf(0.04, 0.14), 1.56 - t * 0.14, -0.17 - t * 0.06];
      const len = rf(0.18, 0.28);
      frustum(m, base, [base[0] + sx * len * 0.3, base[1] + len * 0.75, base[2] - len * 0.65], 0.055, 0.004, 4, c.pick(spikeColors), { e: 0.9, caps: false });
    }

    // A second, smaller white-hot core drifting somewhere below the first, inside the narrower lower body
    m.part('torso', [0, 1.0, 0]);
    const lowY = rf(0.72, 0.95);
    const room = 0.06 + (lowY - 0.72) * 0.25; // the body narrows toward its tip: keep the core inside it
    blob(m, [rf(-room, room), lowY, 0.02 + rf(-room, room) * 0.7], [0.07, 0.09, 0.06], 0, 0.2, WHITE, { e: 1, j: 0.05 });

    return 'Burning Spirit';
  },
};

export default design;
