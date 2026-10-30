// Model for Gold Coins (data/gear/loot.ts › gold): gold an enemy dropped, a loose scatter of flat gold coins over its
// tile, spread toward the edges (an item lying on the same tile leaves them showing around it), a small stack of
// them to one side and a couple tipped up against it. Each pile's scatter is its own (seeded by the pile).
// Lies on its tile; never moves.
import type { Design } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { frustum } from '../../core/primitives';
import { add, mixC, rotX, rotY, type RGB, type Vec3 } from '../../core/vec';
import { lootEntry } from '../_loot';

/** Gold: a coin's faces, catching light, and its darker rim. */
const GOLD: RGB = [226, 184, 84];
const RIM: RGB = [168, 124, 46];
/** A coin: its radius and thickness (tiles), and the sides of its outline. */
const R = 0.055, T = 0.014, SIDES = 7;
/** How many coins the stack holds: its top is the model's top. */
const STACK = 5;
/** A faint warmth, so the coins catch the eye on a dark floor (a lit face's partial glow, not a light). */
const WARM = 0.18;

/** A coin built lying flat, centered at the origin: faces lit gold, the rim darker. */
function coin(m: Mesh, shade: number): void {
  const face = mixC(GOLD, RIM, shade), rim = mixC(RIM, [90, 64, 24], shade);
  frustum(m, [0, -T / 2, 0], [0, T / 2, 0], R, R * 0.96, SIDES, (_, n) => (Math.abs(n[1]) > 0.7 ? face : rim), { j: 0.12, e: WARM });
}

const design: Design = {
  ...lootEntry('gold'),
  category: 'loot',
  // Built at its true size: the stack's top is the model's top
  fit: { kind: 'standing', height: STACK * T, maxRadius: 1 },
  budget: 600,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    m.anchor('feet', [0, 0, 0]);

    /** A coin tilted `tilt` about its own x, turned `yaw`, resting on the floor at (x, z), raised `lift`. */
    const place = (x: number, z: number, tilt: number, yaw: number, lift = 0) => {
      const from = m.faces.length;
      coin(m, rf(0, 0.35));
      // Its lowest point after the tilt goes to the floor (or to `lift`)
      const low = R * Math.sin(Math.abs(tilt)) + (T / 2) * Math.cos(tilt);
      m.xf(from, (p) => add(rotY(rotX(p, tilt), yaw), [x, low + lift, z]));
    };

    // The scatter: a few loose clumps away from the middle, and strays between them, each coin a little tilted
    // (lying over its neighbours)
    const nClumps = ri(2, 3);
    const clumps = Array.from({ length: nClumps }, (_, k) => {
      const a = (k / nClumps) * Math.PI * 2 + rf(-0.6, 0.6), d = rf(0.16, 0.27);
      return [Math.cos(a) * d, Math.sin(a) * d];
    });
    const n = ri(11, 14);
    for (let i = 0; i < n; i++) {
      const stray = i % 4 === 3;
      const [cx, cz] = stray ? [0, 0] : clumps[i % clumps.length];
      const a = rf(0, Math.PI * 2), d = stray ? rf(0.14, 0.36) : rf(0, 0.09);
      place(cx + Math.cos(a) * d, cz + Math.sin(a) * d, rf(0.04, 0.18), rf(0, Math.PI), i * 0.0012);
    }

    // A small stack to one side, and two coins tipped up against it
    const sa = rf(0, Math.PI * 2), sd = rf(0.06, 0.12);
    const stack: Vec3 = [Math.cos(sa) * sd, 0, Math.sin(sa) * sd];
    for (let k = 0; k < STACK; k++) {
      const from = m.faces.length;
      coin(m, rf(0, 0.3));
      const off: Vec3 = [stack[0] + rf(-0.008, 0.008), (k + 0.5) * T, stack[2] + rf(-0.008, 0.008)];
      m.xf(from, (p) => add(rotY(p, k * 0.7), off));
    }
    // Tipped no higher than the stack's top
    for (const s of [-1, 1]) {
      const a = sa + s * rf(1.2, 1.8);
      place(stack[0] + Math.cos(a) * R * 1.5, stack[2] + Math.sin(a) * R * 1.5, rf(0.38, 0.48), -a + Math.PI / 2);
    }

    return 'Gold Coins';
  },
};
export default design;
