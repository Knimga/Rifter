// Model for Arcane Research Table (data/world/decorObjects.ts › arcane-research-table): an arcanist's worktable over two
// tiles. The table is a plain, featureless rectangular slab of dark stone, standing solid from the floor; its top is
// littered with work, left and right as seen standing in front of it:
// - the left: a stack of books, a book lying open beside it as a tome with a glowing glyph, a loose book, scrolls;
// - the middle: a brass armillary (_arcana.ts), a lens on a stand, brass
//   dividers lying open, an inkwell with its quill;
// - the right: small glowing things (jars, a dish of crystals, an orb on a little stand) and a candle.
// Built in tile units over its two tiles (span 2), along x: its `feet` anchor at its placed tile's center (x = 0), its
// second tile at x = 1 (the model's left, spanTiles). Its front faces +z.
import type { Design } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { bipyr, blob, box, frustum, tube } from '../../core/primitives';
import { add, mulC, type RGB, type Vec3 } from '../../core/vec';
import { decorEntry } from '../_decor';
import { LEATHER, PARCHMENT, book, bookStack, candle, openTome, scroll } from '../_books';
import { BRASS, JAR_GLOW, armillary, jar } from '../_arcana';

const STONE: RGB = [30, 30, 38];
const STONE_TOP: RGB = [40, 40, 50]; // its top, catching the light
const STONE_DEEP: RGB = [20, 20, 26];
const INK: RGB = [16, 16, 22];
const QUILL: RGB = [214, 208, 196];
const LENS: RGB = [120, 150, 170];
/** The glyph on the open tome, and its halo. */
const GLYPH: RGB = [120, 200, 255], GLYPH_HALO: RGB = [60, 130, 220];

/** The slab: its ends (x), back (−z) and front (+z), and its top. */
const X0 = -0.44, X1 = 1.44, Z0 = -0.36, Z1 = 0.32, TOP = 0.5;
/** How far it reaches from its feet (a far corner): its fit, so it keeps its built size. */
const REACH = Math.hypot(X1 + 0.02, Z0 - 0.02);

/** Brass dividers lying open on the top at `c`, turned `yaw`: two thin legs from a hinge. */
function dividers(m: Mesh, c: Vec3, yaw: number): void {
  const leg = (a: number): Vec3 => add(c, [Math.cos(yaw + a) * 0.13, 0.008, Math.sin(yaw + a) * 0.13]);
  for (const a of [-0.22, 0.22]) frustum(m, add(c, [0, 0.012, 0]), leg(a), 0.007, 0.003, 4, BRASS, { j: 0.08 });
  blob(m, add(c, [0, 0.014, 0]), [0.014, 0.01, 0.014], 0, 0.05, BRASS, { j: 0.06 });
}

/** A lens on a little brass stand at `c`: a foot, a stem, a ring holding a pale glass disc, tipped toward the front. */
function lensStand(m: Mesh, c: Vec3): void {
  frustum(m, c, add(c, [0, 0.015, 0]), 0.04, 0.034, 6, BRASS, { j: 0.1 });
  frustum(m, add(c, [0, 0.015, 0]), add(c, [0, 0.13, 0]), 0.007, 0.006, 4, BRASS, { j: 0.08 });
  const ctr = add(c, [0, 0.17, 0]);
  tube(m, Array.from({ length: 11 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return add(ctr, [Math.cos(a) * 0.045, Math.sin(a) * 0.045 * 0.94, Math.sin(a) * 0.015]); }), 0.006, 0.006, 4, BRASS, { j: 0.1, caps: false });
  frustum(m, add(ctr, [0, 0, -0.003]), add(ctr, [0, 0, 0.003]), 0.042, 0.042, 10, LENS, { a: 0.5, j: 0.04 });
}

const design: Design = {
  ...decorEntry('arcane-research-table'),
  category: 'decor',
  fit: { kind: 'standing', height: 5, maxRadius: REACH },
  budget: 2600,
  build(c) {
    const m = c.mesh;
    const { rf } = c;
    m.anchor('feet', [0, 0, 0]);

    // The slab: one plain block of dark stone from the floor to its top, paler on top and darker underneath
    m.part('table');
    box(m, [(X0 + X1) / 2, TOP / 2, (Z0 + Z1) / 2], [X1 - X0, TOP, Z1 - Z0], (_p, n) => (n[1] > 0.5 ? STONE_TOP : n[1] < -0.5 ? STONE_DEEP : STONE), 0.004, { j: 0.05 });

    // The left: a stack of books, an open tome with a glowing glyph, a loose book, scrolls
    m.part('left', [-0.1, TOP, 0]);
    bookStack(m, [-0.26, TOP, -0.2], [
      { size: [0.26, 0.05, 0.19], yaw: 0.12, cover: LEATHER[2] },
      { size: [0.24, 0.05, 0.18], yaw: -0.18, cover: LEATHER[0] },
      { size: [0.23, 0.045, 0.17], yaw: 0.3, cover: LEATHER[3] },
      { size: [0.2, 0.04, 0.15], yaw: -0.05, cover: LEATHER[1] },
    ]);
    openTome(m, [0.06, TOP, 0.06], 0.25, LEATHER[1], { color: GLYPH, halo: GLYPH_HALO });
    book(m, [-0.24, TOP, 0.14], [0.21, 0.04, 0.16], -0.6, LEATHER[0]);
    scroll(m, [0.02, TOP, -0.24], 0.26, 0.024, 0.15);
    scroll(m, [-0.3, TOP, 0.22], 0.2, 0.02, 0.3);

    // The middle: the armillary, a lens on its stand, dividers, ink and quill
    m.part('middle', [0.5, TOP, 0]);
    armillary(m, [0.68, TOP, -0.2], JAR_GLOW[1]);
    lensStand(m, [0.44, TOP, -0.22]);
    dividers(m, [0.76, TOP, 0.16], 2.6);
    frustum(m, [0.94, TOP, 0.0], [0.94, TOP + 0.05, 0.0], 0.03, 0.022, 6, INK, { j: 0.06 });
    frustum(m, [0.94, TOP + 0.03, 0.0], [1.06, TOP + 0.13, 0.05], 0.004, 0.012, 4, QUILL, { j: 0.06 }); // leaning out to the side

    // The right: small glowing things (jars, a dish of crystals, an orb on a little stand), a candle
    m.part('right', [1.1, TOP, 0]);
    jar(m, [1.16, TOP, -0.22], 0.13, 0.04, JAR_GLOW[0]);
    jar(m, [1.3, TOP, -0.16], 0.09, 0.034, JAR_GLOW[2]);
    // The dish of crystals: a shallow brass dish, a few violet crystals in it, softly glowing
    const dish: Vec3 = [1.2, TOP, 0.12];
    frustum(m, dish, add(dish, [0, 0.02, 0]), 0.05, 0.075, 8, BRASS, { j: 0.08 });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + rf(-0.3, 0.3);
      bipyr(m, add(dish, [Math.cos(a) * 0.03, 0.03, Math.sin(a) * 0.03]), rf(0.012, 0.018), rf(0.022, 0.032), 4, JAR_GLOW[1], { e: 0.9, j: 0.05 });
    }
    m.halo(add(dish, [0, 0.05, 0]), 0.12, mulC(JAR_GLOW[1], 0.7));
    // The orb: a small glowing sphere on a three-pronged brass stand
    const orb: Vec3 = [1.0, TOP + 0.09, -0.24];
    frustum(m, [orb[0], TOP, orb[2]], [orb[0], TOP + 0.04, orb[2]], 0.03, 0.012, 5, BRASS, { j: 0.08 });
    blob(m, orb, [0.04, 0.04, 0.04], 1, 0.02, JAR_GLOW[0], { e: 0.95, j: 0.04 });
    m.halo(orb, 0.13, mulC(JAR_GLOW[0], 0.75));
    candle(m, [1.32, TOP, 0.22]);
    scroll(m, [1.06, TOP, 0.2], 0.2, 0.02, -0.4);
    box(m, [1.32, TOP + 0.002, -0.02], [0.14, 0.004, 0.11], PARCHMENT, 0.004, { j: 0.06 });

    return this.label;
  },
};

export default design;
