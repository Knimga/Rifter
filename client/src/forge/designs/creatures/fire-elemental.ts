import type { Design } from '../../core/types';
import type { ColorFn } from '../../core/mesh';
import { blob, frustum, loft, tendril } from '../../core/primitives';
import { add, mixC, mul, norm, type RGB, type Vec3 } from '../../core/vec';
import { floorGlow } from '../_glow';

// Identity: a hulk of living fire floating over an orange pool of its own light. No legs and no neck: a broad,
// domed upper body (the head is the top of the dome, a hood with two white eyes) on a powerful chest, narrowing
// below into a thin, wavering flame tail. Heavy arms held out to the sides, elbows bent, thick forearms and clawed
// hands. Ethereal: see-through and half glowing, fiery orange through the body, yellow on top and where the light
// catches, streaked orange-red, redder down the tail. Two white-hot chunks float inside it, and yellow and orange
// halos glow over the body, like the Burning Spirit's.
// Seeds vary the tail's sway and wisps, the streaks, the chunks' and glows' places and the arms' pose.
const WHITE: RGB = [255, 250, 230];
const PALE: RGB = [255, 236, 150];
const YELLOW: RGB = [255, 206, 74];
const ORANGE: RGB = [255, 118, 22];
const EMBER: RGB = [226, 60, 20]; // orange-red
const EYE: RGB = [255, 255, 255];
const EYE_HALO: RGB = [255, 255, 255];
/** Its body's look: see-through and partly glowing (below 0.5, or the game draws it solid). */
const ETHEREAL = { a: 0.65, e: 0.45, j: 0.1 };

const design: Design = {
  id: 'creature.fire-elemental',
  source: { table: 'enemies', key: 'fire-elemental' }, // data/units/enemies.ts › fire-elemental
  category: 'creature',
  label: 'Fire Elemental',
  fit: { kind: 'standing', height: 1.35, maxRadius: 0.6, floor: 'origin' }, // it floats: its tail never touches
  budget: 1100,
  build(c) {
    const m = c.mesh;
    const { rf } = c;
    m.anchor('feet', [0, 0, 0]); // under the body: this point goes to the tile center

    m.part('glow');
    floorGlow(m, [255, 128, 36], 0.58, 0.58, 12);

    // Streaks of orange-red through the fire, decided by a slow wave through space so they form bands
    const ph = [rf(0, 6), rf(0, 6), rf(0, 6)];
    const streak = (p: Vec3) => Math.sin(p[0] * 9 + ph[0]) + Math.sin(p[1] * 7 + ph[1]) + Math.sin(p[2] * 10 + ph[2]) > 1.3;
    /** Orange through the body, yellow at the crown, redder down the tail; orange-red streaks. */
    const fire: ColorFn = (cen, n) => {
      const t = Math.min(1, Math.max(0, (cen[1] - 0.2) / 1.72)); // 0 at the tail's tip, 1 at the crown
      let col = t < 0.3 ? mixC(EMBER, ORANGE, t / 0.3) : t < 0.75 ? ORANGE : t < 0.92 ? mixC(ORANGE, YELLOW, (t - 0.75) / 0.17) : mixC(YELLOW, PALE, (t - 0.92) / 0.08);
      if (n[1] > 0.55) col = mixC(col, YELLOW, 0.3); // tops catch the light (a little: the camera sees mostly tops)
      if (streak(cen) && t < 0.85) col = mixC(col, EMBER, 0.6);
      return col;
    };

    // Body: one column from the tail's tip up through the chest into the dome, swaying as the tail rises; the
    // dome leans a little forward over the chest
    m.part('torso', [0, 1.2, 0]);
    const N = 12;
    const sway = rf(0.04, 0.07), swayPh = rf(0, Math.PI * 2);
    const ring = (y: number, rx: number, rz: number, dz = 0): Vec3[] => {
      const sx = y < 1.1 ? Math.sin(y * 6 + swayPh) * sway * (1.1 - y) : 0;
      return Array.from({ length: N }, (_, i) => {
        const a = (i / N) * Math.PI * 2, k = 1 + rf(-0.05, 0.05);
        return [sx + Math.sin(a) * rx * k, y, dz + Math.cos(a) * rz * k];
      });
    };
    loft(m, [
      ring(0.16, 0.025, 0.025), ring(0.42, 0.06, 0.05), ring(0.72, 0.1, 0.08), ring(0.98, 0.17, 0.13),
      ring(1.18, 0.3, 0.2, 0.02), ring(1.4, 0.44, 0.25, 0.03), ring(1.6, 0.49, 0.27, 0.04), ring(1.76, 0.43, 0.26, 0.05),
      ring(1.88, 0.29, 0.2, 0.05), ring(1.94, 0.1, 0.08, 0.04),
    ], fire, { ...ETHEREAL, bandCenters: true });

    // Wisps peeling off the tail and rising like flames
    const wispTips: Vec3[] = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + rf(-0.4, 0.4), y = rf(0.3, 0.7);
      const out: Vec3 = [Math.sin(a), 0, Math.cos(a) * 0.7];
      wispTips.push(tendril(m, [out[0] * 0.05, y, out[2] * 0.05], norm([out[0], 0.5, out[2]]), rf(0.16, 0.24), 3, 0.035,
        (t) => mixC(ORANGE, EMBER, t), { ...ETHEREAL, bend: (t) => [0, t * 0.1, 0] }));
    }

    // White-hot chunks floating inside the see-through body, like the Burning Spirit's: a larger one in the chest
    // and a small one lower down, where the body narrows (kept well inside it)
    const core: Vec3 = [rf(-0.08, 0.08), rf(1.3, 1.42), 0.04];
    blob(m, core, [0.09, 0.11, 0.08], 0, 0.2, WHITE, { e: 1, j: 0.05 });
    const lowY = rf(0.95, 1.08);
    const low: Vec3 = [rf(-0.04, 0.04), lowY, 0.02];
    blob(m, low, [0.05, 0.065, 0.045], 0, 0.2, WHITE, { e: 1, j: 0.05 });

    // Halos: around the two chunks, then yellow and orange glows at points over the body: the crown, a couple of
    // spots on the chest and dome (seeded), and the wisps' tips
    m.halo(core, 0.28, PALE);
    m.halo(low, 0.15, PALE);
    m.halo([0, 1.9, 0.05], 0.2, YELLOW);
    for (let i = 0; i < 2; i++) {
      const [y, rx, rz] = c.pick([[1.4, 0.44, 0.25], [1.6, 0.49, 0.27], [1.76, 0.43, 0.26]] as const);
      const a = rf(-2.2, 2.2); // anywhere but straight behind
      m.halo([Math.sin(a) * rx, y, 0.04 + Math.cos(a) * rz], rf(0.1, 0.14), c.pick([YELLOW, ORANGE]));
    }
    for (const tip of wispTips.slice(0, 2)) m.halo(tip, rf(0.07, 0.09), ORANGE);

    // Face, on the front of the dome: two white, slanted eyes with a white glow around them
    m.part('head', [0, 1.7, 0.1]);
    const fy = 1.64, fz = 0.3;
    for (const sx of [-1, 1]) {
      const eye: Vec3 = [sx * 0.1, fy - 0.04, fz + 0.01];
      blob(m, eye, [0.055, 0.026, 0.022], 0, 0.05, EYE, { e: 1 });
      m.halo(add(eye, [0, 0, 0.02]), 0.11, EYE_HALO);
    }

    // Arms: from broad shoulders out and down to the elbows, then thick forearms swinging forward to the hands,
    // held out at the sides about waist-high. Hands open, the clawed fingers curling down.
    for (const sx of [-1, 1]) {
      const sh: Vec3 = [sx * 0.44, 1.58, 0.02];
      const elbow: Vec3 = [sx * rf(0.64, 0.68), rf(1.28, 1.34), rf(-0.06, 0)];
      const wrist: Vec3 = [sx * rf(0.68, 0.72), rf(1.04, 1.1), rf(0.18, 0.24)];
      m.part(sx > 0 ? 'arm_l' : 'arm_r', sh);
      blob(m, sh, [0.17, 0.15, 0.16], 0, 0.1, fire, ETHEREAL); // shoulder
      frustum(m, sh, elbow, 0.14, 0.11, 6, fire, { ...ETHEREAL, caps: false });
      blob(m, elbow, [0.11, 0.11, 0.11], 0, 0.1, fire, ETHEREAL);
      frustum(m, elbow, wrist, 0.13, 0.09, 6, fire, { ...ETHEREAL, caps: false }); // the thick forearm
      const palm = add(wrist, [sx * 0.02, -0.06, 0.05]);
      blob(m, palm, [0.07, 0.08, 0.075], 0, 0.12, ORANGE, ETHEREAL);
      // Four claws: out from the palm, then hooking down, orange-red at the points
      for (let f = 0; f < 4; f++) {
        const spread = (f - 1.5) * 0.45;
        const dir = norm([sx * (0.35 + Math.sin(spread) * 0.4), -0.35, 0.6 + Math.cos(spread) * 0.3 - 0.3]);
        const knuckle = add(palm, mul(dir, rf(0.09, 0.11)));
        const tip = add(knuckle, [dir[0] * 0.04, -rf(0.08, 0.1), dir[2] * 0.03]);
        frustum(m, palm, knuckle, 0.026, 0.02, 4, ORANGE, { ...ETHEREAL, caps: false });
        frustum(m, knuckle, tip, 0.02, 0.003, 4, EMBER, { ...ETHEREAL, a: 0.9, caps: false });
      }
      m.anchor(sx > 0 ? 'hand_l' : 'hand_r', palm);
      m.halo(palm, rf(0.09, 0.12), ORANGE);
    }

    return 'Fire Elemental';
  },
};
export default design;
