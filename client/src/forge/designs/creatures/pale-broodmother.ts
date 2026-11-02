import type { Design } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { blob, frustum } from '../../core/primitives';
import { add, cross, mul, norm, sub, type RGB, type Vec3 } from '../../core/vec';
import { spiderEyes, spiderJointed, spiderMouthparts, spiderPalette } from '../_spider';

// Identity: the Pale Creepers' broodmother, a large (2x2) albino cave spider of their kind and colors, grown huge and
// menacing: the same black widow body (a cephalothorax, and a heavy near-round abdomen riding high behind it, faint
// bone chevrons down its top) at about twice the size, and eight very long, angular legs splayed wide around it:
// each rises from the body into a sharp knee above it, bends again, then reaches down and out to a pointed foot,
// straight-sided between hard joints and bristling with spines; its stance spreads to the edges of its square. Its
// front is the creepers' (dark curved fangs with a faint venom glow, pedipalps) and so are its black eyes, each in a
// halo of darkness. Ivory to bone white. Seeds vary its build, its legs' spread and how high they rise, and its shade
// of white.

/** How much bigger than a Pale Creeper its body is drawn (its front end and eyes too: designs/_spider.ts). */
const S = 1.9;
/** It rides a little higher than a creeper, on its long legs. */
const LIFT: Vec3 = [0, 0.05, 0];
/** A creeper-sized point on its body, as drawn on the broodmother. */
const place = (q: Vec3): Vec3 => add(mul(q, S), LIFT);

/** The darkness around each eye: a dark, see-through shell (a black halo can't be drawn: halos add light). */
const EYE_DARK: RGB = [6, 4, 8];

/** A spine on a leg: from `at`, a thin dark-tipped point out along `dir`. */
function spine(m: Mesh, at: Vec3, dir: Vec3, len: number, base: RGB, tip: RGB): void {
  const mid = add(at, mul(dir, len * 0.55)), end = add(at, mul(dir, len));
  frustum(m, at, mid, 0.009, 0.005, 3, base, { caps: false, j: 0.1 });
  frustum(m, mid, end, 0.005, 0.0004, 3, tip, { j: 0.1 });
}

const design: Design = {
  id: 'creature.pale-broodmother',
  source: { table: 'enemies', key: 'pale-broodmother' }, // data/units/bosses.ts › pale-broodmother
  category: 'creature',
  label: 'Pale Broodmother',
  // Large: its legs' reach fills its 2x2 square, its farthest foot just inside the square's edge (0.93-0.995 of the
  // way to it, by seed)
  fit: { kind: 'standing', height: 1.8, maxRadius: 1.07 },
  budget: 2600,
  build(c) {
    const m = c.mesh;
    const { rf } = c;
    const p = spiderPalette(c);

    // ─── Body: the cephalothorax in front, the heavy abdomen high behind it on a narrow waist ───
    const CEPH = place([0, 0.15, 0.05]);
    const ab = rf(1, 1.1);
    const ABD = place([0, 0.23, -0.2 * ab]);
    m.part('torso', CEPH);
    blob(m, CEPH, mul([0.078, 0.054, 0.088], S), 1, 0.05, p.byLight);
    frustum(m, add(CEPH, [0, 0.015, -0.11]), add(ABD, [0, -0.05, 0.19 * ab]), 0.035, 0.05, 6, p.JOINT, { caps: false });
    // The abdomen: faint bone chevrons down its top, pointing forward (a darker band where a slow wave along it
    // crosses the top)
    const chevrons = (cen: Vec3, n: Vec3): RGB => {
      const along = (cen[2] - ABD[2]) * 26 + Math.abs(cen[0] - ABD[0]) * 18;
      return n[1] > 0.3 && Math.sin(along) > 0.6 ? p.UNDER : p.byLight(cen, n);
    };
    blob(m, ABD, mul([0.16 * ab, 0.15 * ab, 0.17 * ab], S), 2, 0.025, chevrons);

    // ─── Legs: four a side, long and splayed wide: up into a sharp knee above the body, a short bend, then down and
    //     out to a pointed foot. Straight between hard joints (no knobs), spines along the upper two segments ───
    // Their directions round from forward to back, fanned wide; the front pair and the rear pair longest (the rear
    // reaching back to the square's edge), the third shortest
    const ANGLES = [26, 62, 112, 156], REACH = [1.24, 1.1, 1.02, 1.3];
    for (const s of [1, -1]) {
      ANGLES.forEach((deg, k) => {
        const a = ((deg + rf(-5, 5)) * Math.PI) / 180, r = REACH[k] * rf(0.96, 1.04);
        const d: Vec3 = [s * Math.sin(a), 0, Math.cos(a)];
        const at = (out: number, y: number): Vec3 => add([CEPH[0], y, CEPH[2]], mul(d, out));
        const rise = rf(0.4, 0.48);
        const hip = at(0.1, CEPH[1] - 0.02);
        const knee = at(0.3 * r, CEPH[1] + rise); // above the body
        const bend = at(0.45 * r, CEPH[1] + rise - rf(0.06, 0.1)); // a short bend past it
        const ankle = at(0.7 * r, rf(0.08, 0.12)); // down and out
        const foot = at(0.9 * r, 0); // out to its pointed foot
        spiderJointed(m, [hip, knee, bend, ankle, foot], 0.034, [p.SIDE, p.TOP, p.TOP, p.JOINT], 5);
        // Spines along the upper segments, standing out from the leg's top and outer side
        const side = norm(cross([0, 1, 0], d)); // across the leg
        for (const [from, to] of [[hip, knee], [bend, ankle]] as const) {
          const along = norm(sub(to, from));
          const out = norm(add(cross(along, side), mul(d, 0.6))); // up off the leg, leaning out
          for (const t of [0.3, 0.55, 0.8]) spine(m, add(from, mul(sub(to, from), t)), out, rf(0.06, 0.08), p.TOP, p.UNDER);
        }
      });
    }

    // ─── The front: the creepers' chelicerae and fangs, pedipalps and eyes, at its size ───
    m.part('head', add(CEPH, [0, 0, 0.08 * S]));
    // Her venom glows half again as strong as a creeper's, and a little wider
    for (const s of [1, -1]) spiderMouthparts(m, s, p, place, S, { strength: 1.5, size: 1.4 });
    // Each eye in a halo of darkness: a dark, see-through shell around it
    for (const e of spiderEyes(m, place, S)) blob(m, e.at, [e.r * 2.8, e.r * 2.8, e.r * 2.8], 0, 0, EYE_DARK, { a: 0.55, j: 0 });

    // Centered on its square: the middle of everything's reach (its legs' feet, front and back) goes to the feet
    // anchor, so its stance spreads evenly to the square's edges
    const pts = m.faces.flatMap((f) => f.v);
    const mid = (i: 0 | 2) => (Math.min(...pts.map((q) => q[i])) + Math.max(...pts.map((q) => q[i]))) / 2;
    m.anchor('feet', [mid(0), 0, mid(2)]);

    return 'Pale Broodmother';
  },
};

export default design;
