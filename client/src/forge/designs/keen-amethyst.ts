// Model for Keen Amethyst (data/gear/offhands.ts › focus drops keen-amethyst); the starting Cracked Amethyst
// borrows it. A natural purple crystal prism, bound at its top end in a leather thong. Held by the thong in
// the left hand, it dangles just beneath it, the prism's point down (equip.ts: its 'dangle_grip', the top of
// the thong, goes to the fist; 'dangle_tip', the point, hangs straight below).
// Built hanging: the thong's top at the origin, the crystal below it along −y. The prism is a rough
// six-sided column, a little irregular (natural), its faces catching the light in deeper and paler violets.
import type { Design } from '../core/types';
import { frustum, loft } from '../core/primitives';
import { mulC, type RGB, type Vec3 } from '../core/vec';
import { DANGLE_UNIT } from './_character';

const AMETHYST: RGB = [142, 84, 196];
const DEEP: RGB = [88, 46, 140];
const LEATHER: RGB = [96, 64, 40];

const design: Design = {
  id: 'offhand.keen-amethyst',
  source: { table: 'offhands', key: 'keen-amethyst' },
  category: 'offhand',
  label: 'Keen Amethyst',
  fit: { kind: 'item', size: 0.5 },
  budget: 300,
  build(c) {
    const m = c.mesh;
    const { rf } = c;
    const cord = 0.06;                  // the short thong between the fist and the crystal
    const top = -cord;                  // the crystal's flat top, bound by the thong
    const crystal = 0.8;                // the crystal's length, as a share of its first version's
    const length = rf(0.14, 0.16) * crystal; // its column, top to where the point begins
    const point = rf(0.045, 0.055) * crystal; // its pointed end, below the column
    const r = 0.026;                    // its radius

    // The crystal: a six-sided column, each corner a little off (a natural crystal, not a cut one), narrowing
    // slightly toward its point; faces alternate deeper and paler violet
    m.part('crystal', [0, top, 0]);
    const N = 6;
    const turn = rf(0, Math.PI / N);
    const ring = (y: number, k: number, jitter: number): Vec3[] => Array.from({ length: N }, (_, i) => {
      const a = turn + (i / N) * Math.PI * 2, rr = r * k * (1 + rf(-jitter, jitter));
      return [Math.cos(a) * rr, y, Math.sin(a) * rr];
    });
    const face = (cen: Vec3): RGB => (Math.atan2(cen[2], cen[0]) + Math.PI) % (Math.PI / 1.5) < Math.PI / 3 ? AMETHYST : mulC(AMETHYST, 0.82);
    const bottom = top - length;
    loft(m, [ring(top, 0.92, 0.06), ring(top - length * 0.5, 1, 0.08), ring(bottom, 0.9, 0.06)], face, { j: 0.1 });
    // The point: the column tapering to a tip below, deeper toward its end
    frustum(m, [0, bottom, 0], [rf(-0.004, 0.004), bottom - point, rf(-0.004, 0.004)], r * 0.9, 0.002, N, DEEP, { caps: false });

    // The leather thong: bound twice around the crystal's top, then a short cord up to where it is held
    m.part('thong', [0, 0, 0]);
    frustum(m, [0, top + 0.004, 0], [0, top - 0.012, 0], r * 1.04, r * 1.04, 7, LEATHER, { caps: false });
    frustum(m, [0, top - 0.02, 0], [0, top - 0.03, 0], r * 1.06, r * 1.06, 7, mulC(LEATHER, 0.85), { caps: false });
    frustum(m, [0, top + 0.004, 0], [0, 0, 0], 0.006, 0.006, 4, LEATHER);

    // Where it is held (the thong's top) and where it points (the crystal's tip): equip hangs it between them
    m.anchor('dangle_grip', [0, 0, 0]);
    m.anchor('dangle_tip', [0, bottom - point, 0]);
    // A fixed length below the grip (DANGLE_UNIT): equip sizes it by this, so its own length shows as built
    m.anchor('dangle_unit', [0, -DANGLE_UNIT, 0]);
    return 'Keen Amethyst';
  },
};

export default design;
