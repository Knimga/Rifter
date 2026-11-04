// Model for Round Reading Table (data/world/decorObjects.ts › round-reading-table): a round wooden table on a turned
// pedestal with three splayed feet, set toward the back of its tile (against a wall), strewn with two open tomes and a
// stack of books, a single candle lit for reading. In front of it, a wooden chair pulled out and turned aside, as if
// someone just got up from it. Dark wood, as the Sanctum's other furniture.
// Built at a set size, then grown evenly until it fills its tile (FILL). Placed, true size: its tile centered on the origin, its front facing +z, its back (-z) against the wall.
// One fixed look.
import type { Design } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { blob, box, frustum } from '../../core/primitives';
import { add, mulC, rotY, type RGB, type Vec3 } from '../../core/vec';
import { DARK_WOOD, decorEntry } from '../_decor';
import { LEATHER, bookStack, candle, openTome } from '../_books';

/** The table's and chair's wood: the Sanctum furniture's dark wood. */
const WOOD: RGB = mulC(DARK_WOOD, 1.1);
const WOOD_TOP: RGB = mulC(DARK_WOOD, 1.25); // its top, catching the light
const WOOD_SHADE: RGB = mulC(DARK_WOOD, 0.85);

/** The table: its top's center (toward the back of the tile), radius and height. */
const TABLE: Vec3 = [0, 0, -0.1];
const R = 0.3, TOP = 0.46;
/** How much of its tile the whole set spans, across its wider way (tiles): nearly all of it. */
const FILL = 0.96;

/** A wooden chair standing on `at`, turned `yaw`: built facing -z (toward the table), its back toward +z. */
function chair(m: Mesh, at: Vec3, yaw: number): void {
  const from = m.faces.length;
  const SEAT = 0.26, W = 0.2, LEG = 0.024;
  box(m, [0, SEAT, 0], [W, 0.026, W], WOOD_TOP, 0.04, { j: 0.1 });
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(m, [x * (W / 2 - LEG), SEAT / 2, z * (W / 2 - LEG)], [LEG, SEAT, LEG], WOOD, 0.03, { j: 0.1 });
  // Its back: two posts rising from the back legs, a top rail and a slat between them
  for (const x of [-1, 1]) box(m, [x * (W / 2 - LEG), SEAT + 0.15, W / 2 - LEG], [LEG, 0.3, LEG], WOOD, 0.03, { j: 0.1 });
  box(m, [0, SEAT + 0.28, W / 2 - LEG], [W, 0.05, 0.022], WOOD_TOP, 0.03, { j: 0.1 });
  box(m, [0, SEAT + 0.16, W / 2 - LEG], [W - 0.06, 0.03, 0.016], WOOD_SHADE, 0.03, { j: 0.1 });
  m.xf(from, (p) => add(rotY(p, yaw), at));
}

const design: Design = {
  ...decorEntry('round-reading-table'),
  category: 'decor',
  fit: { kind: 'placed', height: 1 },
  budget: 600,
  build(c) {
    const m = c.mesh;

    // The pedestal: three splayed feet, a turned column with a knob, and the round top
    m.part('table', TABLE);
    for (let k = 0; k < 3; k++) {
      const a = Math.PI / 2 + (k * Math.PI * 2) / 3;
      frustum(m, add(TABLE, [0, 0.05, 0]), add(TABLE, [Math.cos(a) * 0.2, 0.012, Math.sin(a) * 0.2]), 0.03, 0.018, 5, WOOD, { j: 0.1 });
    }
    frustum(m, add(TABLE, [0, 0.03, 0]), add(TABLE, [0, TOP - 0.035, 0]), 0.05, 0.036, 7, WOOD, { j: 0.1 });
    blob(m, add(TABLE, [0, TOP * 0.45, 0]), [0.062, 0.04, 0.062], 0, 0, WOOD_SHADE);
    frustum(m, add(TABLE, [0, TOP - 0.08, 0]), add(TABLE, [0, TOP - 0.035, 0]), 0.06, 0.11, 7, WOOD_SHADE, { j: 0.1 }); // the top's support
    frustum(m, add(TABLE, [0, TOP - 0.035, 0]), add(TABLE, [0, TOP, 0]), R, R, 16, WOOD_TOP, { j: 0.08 });

    // On it: an open tome turned toward the chair, a smaller one beside it, a stack of books at the back and the candle
    m.part('books', add(TABLE, [0, TOP, 0]));
    const on = (x: number, z: number): Vec3 => add(TABLE, [x, TOP, z]);
    openTome(m, on(0.08, 0.1), 0.45, LEATHER[3]);
    openTome(m, on(-0.13, 0.05), -0.5, LEATHER[1], undefined, 0.72);
    bookStack(m, on(0.1, -0.15), [
      { size: [0.2, 0.045, 0.15], yaw: 0.2, cover: LEATHER[0] },
      { size: [0.19, 0.04, 0.14], yaw: -0.15, cover: LEATHER[2] },
      { size: [0.17, 0.04, 0.13], yaw: 0.35, cover: LEATHER[3] },
    ]);
    candle(m, on(-0.12, -0.15), 0.1, 0.16);

    // The chair, pulled out in front of the table and turned aside
    m.part('chair', [0.2, 0, 0.27]);
    chair(m, [0.2, 0, 0.27], 1.05);

    // Grown evenly in every proportion until the whole set (table and chair) fills its tile, centered on it
    const { min, max } = m.bounds();
    const k = FILL / Math.max(max[0] - min[0], max[2] - min[2]);
    const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2;
    m.xfAll((p) => [(p[0] - cx) * k, p[1] * k, (p[2] - cz) * k], k);
    m.anchor('feet', [0, 0, 0]);
    return this.label;
  },
};

export default design;
