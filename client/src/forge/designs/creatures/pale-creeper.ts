import type { Design } from '../../core/types';
import { bipyr, blob, frustum, jointedLimb } from '../../core/primitives';
import { add, hslRGB, lerp3, mul, norm, type RGB, type Vec3 } from '../../core/vec';
import type { Mesh } from '../../core/mesh';

// Identity: an albino cave spider with a black widow's silhouette: a small cephalothorax and a big, near-round
// abdomen riding high behind it, eight long spindly legs arching high over it and splayed out sideways to the floor,
// the front pair longest. Ivory to bone white, lighter on top, its undersides and joints a warmer, duller bone. Two
// stout chelicerae under the front end in dark, curved fangs, with a short pedipalp beside each; a cluster of small
// glossy black eyes on its brow, and a faint green glow of venom about its fangs. Seeds vary its build, its legs'
// spread and arch, and its shade of white.

/** Glossy black eyes, unlit (they catch only a little light on their facets). */
const EYE: RGB = [14, 12, 14];
/** The faint venom glow about each fang: small and subtle, a poison green. */
const VENOM_HALO: RGB = [150, 236, 112];
const VENOM_HALO_R = 0.022;
/** The fangs: dark, so they read against the pale body. */
const FANG: RGB = [46, 34, 30], FANG_TIP: RGB = [22, 16, 14];

/** A leg (or pedipalp) through its joints (jointedLimb), tapering from `w` at the hip; each segment its own color. */
function jointed(m: Mesh, joints: Vec3[], w: number, cols: RGB[]): void {
  const r = joints.map((_, i) => w * (1 - (i / joints.length) * 0.75));
  jointedLimb(m, joints, r, cols, { sides: 4, j: 0.12 });
}

const design: Design = {
  id: 'creature.pale-creeper',
  source: { table: 'enemies', key: 'pale-creeper' }, // data/units/enemies.ts › pale-creeper
  category: 'creature',
  label: 'Pale Creeper',
  // Its legs' reach sets its size: their feet at about the tile's edge
  fit: { kind: 'standing', height: 1, maxRadius: 0.5 },
  budget: 1300,
  build(c) {
    const m = c.mesh;
    const { rf } = c;
    m.anchor('feet', [0, 0, -0.03]); // the middle of its stance (between the legs), a little behind the head

    // Colors: ivory to bone white, lighter on top, its undersides and joints a warmer, duller bone
    const hue = rf(36, 48), sat = rf(16, 28);
    const TOP = hslRGB(hue, sat, rf(80, 86)), SIDE = hslRGB(hue, sat, rf(66, 72)), UNDER = hslRGB(hue - 8, sat * 0.8, rf(46, 52));
    const JOINT = hslRGB(hue - 6, sat, rf(56, 62));
    const byLight = (_: Vec3, n: Vec3) => (n[1] > 0.4 ? TOP : n[1] < -0.3 ? UNDER : SIDE);

    // ─── Body: the cephalothorax in front, the big round abdomen high behind it, joined by a narrow waist ───
    const CEPH: Vec3 = [0, 0.15, 0.05];
    const ab = rf(0.95, 1.08);
    const ABD: Vec3 = [0, 0.22, -0.19 * ab];
    m.part('torso', CEPH);
    blob(m, CEPH, [0.075, 0.052, 0.085], 1, 0.06, byLight);
    frustum(m, add(CEPH, [0, 0.01, -0.07]), add(ABD, [0, -0.03, 0.12 * ab]), 0.022, 0.03, 5, JOINT, { caps: false });
    blob(m, ABD, [0.15 * ab, 0.14 * ab, 0.16 * ab], 1, 0.035, byLight);

    // ─── Legs: four a side, from the cephalothorax's edge up into a high knee, then down and out to the floor ───
    // Their directions round from forward to back; the front pair longest (a widow's), the third shortest
    const ANGLES = [32, 66, 104, 144], REACH = [1.12, 1, 0.9, 1.02];
    for (const s of [1, -1]) {
      ANGLES.forEach((deg, k) => {
        const a = ((deg + rf(-6, 6)) * Math.PI) / 180, r = REACH[k] * rf(0.95, 1.05);
        const d: Vec3 = [s * Math.sin(a), 0, Math.cos(a)];
        const at = (out: number, y: number): Vec3 => add([CEPH[0], y, CEPH[2]], mul(d, out));
        const hip = at(0.055, CEPH[1] - 0.01);
        const knee = at(0.17 * r, CEPH[1] + rf(0.14, 0.19)); // arching high over the body
        const ankle = at(0.36 * r, rf(0.07, 0.1));
        const foot = at(0.47 * r, 0);
        jointed(m, [hip, knee, ankle, foot], 0.016, [SIDE, TOP, JOINT]);
      });
    }

    // ─── The front: chelicerae with dark curved fangs, a pedipalp beside each, and the eyes ───
    m.part('head', add(CEPH, [0, 0, 0.08]));
    for (const s of [1, -1]) {
      // Chelicera: stout, hanging down and forward from under the front edge
      const base: Vec3 = [s * 0.028, 0.13, 0.115], mid: Vec3 = [s * 0.034, 0.078, 0.158];
      frustum(m, base, mid, 0.024, 0.018, 6, byLight, { j: 0.1 });
      // Fang: long, curving down and in, dark, to a sharp black tip
      const bend: Vec3 = [s * 0.03, 0.042, 0.18], tip: Vec3 = [s * 0.012, 0.018, 0.17];
      frustum(m, mid, bend, 0.012, 0.008, 5, FANG, { caps: false, j: 0.08 });
      frustum(m, bend, tip, 0.008, 0.001, 5, FANG_TIP, { j: 0.05 });
      m.halo(lerp3(bend, tip, 0.4), VENOM_HALO_R, VENOM_HALO);
      // Pedipalp: a short feeler beside it, reaching forward and down
      const palpDir = norm([s * 0.5, 0, 1]);
      const p0: Vec3 = [s * 0.05, 0.135, 0.1];
      jointed(m, [p0, add(add(p0, mul(palpDir, 0.06)), [0, 0.03, 0]), add(add(p0, mul(palpDir, 0.11)), [0, -0.05, 0])], 0.011, [SIDE, JOINT]);
    }
    // Eyes: two big ones in front, a row of small ones over them, on the brow
    for (const s of [1, -1]) {
      bipyr(m, [s * 0.017, 0.193, 0.118], 0.0085, 0.008, 4, EYE, { j: 0.2 });
      for (const k of [0.034, 0.052]) bipyr(m, [s * k, 0.2, 0.098 - k * 0.4], 0.0055, 0.005, 3, EYE, { j: 0.2 });
    }

    return 'Pale Creeper';
  },
};

export default design;
