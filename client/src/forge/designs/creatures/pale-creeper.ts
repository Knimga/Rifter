import type { Design } from '../../core/types';
import { blob, frustum } from '../../core/primitives';
import { add, mul, type Vec3 } from '../../core/vec';
import { spiderEyes, spiderJointed, spiderMouthparts, spiderPalette } from '../_spider';

// Identity: an albino cave spider with a black widow's silhouette: a small cephalothorax and a big, near-round
// abdomen riding high behind it, eight long spindly legs arching high over it and splayed out sideways to the floor,
// the front pair longest. Ivory to bone white, lighter on top, its undersides and joints a warmer, duller bone. Two
// stout chelicerae under the front end in dark, curved fangs, with a short pedipalp beside each; a cluster of small
// glossy black eyes on its brow, and a faint green glow of venom about its fangs. Seeds vary its build, its legs'
// spread and arch, and its shade of white. Its palette, front end and eyes are every pale spider's (designs/_spider.ts).

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

    const p = spiderPalette(c);

    // ─── Body: the cephalothorax in front, the big round abdomen high behind it, joined by a narrow waist ───
    const CEPH: Vec3 = [0, 0.15, 0.05];
    const ab = rf(0.95, 1.08);
    const ABD: Vec3 = [0, 0.22, -0.19 * ab];
    m.part('torso', CEPH);
    blob(m, CEPH, [0.075, 0.052, 0.085], 1, 0.06, p.byLight);
    frustum(m, add(CEPH, [0, 0.01, -0.07]), add(ABD, [0, -0.03, 0.12 * ab]), 0.022, 0.03, 5, p.JOINT, { caps: false });
    blob(m, ABD, [0.15 * ab, 0.14 * ab, 0.16 * ab], 1, 0.035, p.byLight);

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
        spiderJointed(m, [hip, knee, ankle, foot], 0.016, [p.SIDE, p.TOP, p.JOINT]);
      });
    }

    // ─── The front: chelicerae with dark curved fangs, a pedipalp beside each, and the eyes ───
    m.part('head', add(CEPH, [0, 0, 0.08]));
    for (const s of [1, -1]) spiderMouthparts(m, s, p);
    spiderEyes(m);

    return 'Pale Creeper';
  },
};

export default design;
