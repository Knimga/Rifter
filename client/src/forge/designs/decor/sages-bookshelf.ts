// Model for Sage's Bookshelf (data/world/decorObjects.ts › sages-bookshelf): a waist-high bookshelf of dark wood, set at
// the back of its tile against a wall: two shelves of tomes and scrolls, the books standing in rows, one leaning at the
// end of a row, others held up by a bookend, and scrolls lying stacked. On top, a small crystal ball on a brass stand,
// glowing, a few small crystals beside it and a loose scroll or two.
// Placed, true size: its tile centered on the origin, its front facing +z, its back (-z) against the wall.
// Seeds vary the books (their sizes, covers, how many) and the crystals.
import type { Design } from '../../core/types';
import type { BuildCtx } from '../../core/ctx';
import { bipyr, blob, box, frustum } from '../../core/primitives';
import { add, mulC, type RGB, type Vec3 } from '../../core/vec';
import { DARK_WOOD, DARK_WOOD_SHADE, decorEntry } from '../_decor';
import { LEATHER, bookend, scroll, uprightBook } from '../_books';
import { PALE_CRYSTALS } from '../_weapon';

const WOOD: RGB = DARK_WOOD;
const WOOD_TOP: RGB = mulC(DARK_WOOD, 1.2); // its top board, catching the light
const WOOD_INSIDE: RGB = mulC(DARK_WOOD_SHADE, 0.8); // the back panel, in the shelves' shadow
const BRASS: RGB = [120, 96, 50];
const BALL: RGB = [176, 206, 255]; // the crystal ball's pale blue light
const BALL_HALO: RGB = [100, 140, 255];

/** The shelf: its width, depth, height (to under its top board), side and board thickness; its back on the wall. */
const W = 0.84, D = 0.3, H = 0.58, T = 0.035;
const BACK = -0.48, Z = BACK + D / 2, FRONT = BACK + D;
/** Where a book or bookend on a shelf stands: its front just inside the shelf's, so its spine shows from above. */
const atFront = (d: number) => FRONT - 0.012 - d / 2;
/** The shelves' surfaces: the bottom board's top and the middle shelf's top; the top board's surface. */
const ROW0 = 0.05, ROW1 = 0.3225, TOP = H + 0.03;
/** The inside's left edge (x). */
const X0 = -W / 2 + T;

/**
 * A row of books standing from `x` along the shelf at height `y`, `n` of them, each up to `maxH` tall; the last one
 * (`leanLast`) leaning back against the others. Returns where the row ends (x).
 */
function bookRow(c: BuildCtx, x: number, y: number, n: number, maxH: number, leanLast: boolean): number {
  const m = c.mesh;
  const cover = () => mulC(c.pick(LEATHER), c.rf(0.75, 1.02));
  for (let i = 0; i < n; i++) {
    const t = c.rf(0.034, 0.05), h = maxH * c.rf(0.78, 1), d = c.rf(0.15, 0.19);
    uprightBook(m, [x + t / 2, y, atFront(d)], [t, h, d], 0, cover());
    x += t + 0.002;
  }
  if (!leanLast) return x;
  // Leaning: its top resting on the last one standing
  const t = c.rf(0.034, 0.045), h = maxH * c.rf(0.8, 0.95), d = c.rf(0.15, 0.18), lean = c.rf(0.3, 0.45);
  const at = x + h * Math.sin(lean) + t / 2;
  uprightBook(m, [at, y, atFront(d)], [t, h, d], lean, cover());
  return at + t;
}

/** A small stack of scrolls lying on a shelf at (x, y), pointing out of it: two side by side and one on them. */
function scrollStack(c: BuildCtx, x: number, y: number): void {
  const r = 0.022, len = 0.2;
  for (const dx of [-r, r]) scroll(c.mesh, [x + dx * 1.05, y, atFront(len)], len, r, Math.PI / 2 + c.rf(-0.1, 0.1));
  scroll(c.mesh, [x, y + r * 1.7, atFront(len * 0.9)], len * 0.9, r, Math.PI / 2 + c.rf(-0.15, 0.15));
}

const design: Design = {
  ...decorEntry('sages-bookshelf'),
  category: 'decor',
  fit: { kind: 'placed', height: 1 },
  budget: 1500,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    m.anchor('feet', [0, 0, 0]);

    // The case: sides, back panel, plinth, the middle shelf and an overhanging top board
    m.part('case', [0, H / 2, Z]);
    for (const s of [-1, 1]) box(m, [s * (W / 2 - T / 2), H / 2, Z], [T, H, D], WOOD, 0.04, { j: 0.1 });
    box(m, [0, H / 2, BACK + 0.01], [W - 2 * T, H, 0.02], WOOD_INSIDE, 0.03, { j: 0.08 });
    box(m, [0, ROW0 / 2, Z], [W - 2 * T, ROW0, D], WOOD, 0.04, { j: 0.1 });
    box(m, [0, ROW1 - 0.0125, Z + 0.005], [W - 2 * T, 0.025, D - 0.01], WOOD, 0.04, { j: 0.1 });
    box(m, [0, H + 0.015, Z + 0.01], [W + 0.03, 0.03, D + 0.02], WOOD_TOP, 0.04, { j: 0.08 });

    // The bottom shelf: a row of tomes from the left, the last leaning on them, then a stack of scrolls
    m.part('shelves', [0, ROW1, Z]);
    bookRow(c, X0 + 0.005, ROW0, ri(6, 8), 0.2, true);
    scrollStack(c, W / 2 - T - 0.07, ROW0);
    // The middle shelf: scrolls at the left, then a bookend holding up a row of tomes, one leaning at its end
    scrollStack(c, X0 + 0.07, ROW1);
    const start = X0 + 0.16;
    bookend(m, [start, ROW1, atFront(0.12)], 0.13, 0.12, BRASS);
    bookRow(c, start + 0.01, ROW1, ri(5, 7), 0.22, true);

    // On top: the crystal ball on its brass stand, glowing; small crystals beside it; a loose scroll or two
    m.part('top', [0, TOP, Z]);
    const stand: Vec3 = [0.22, TOP, Z + 0.02];
    frustum(m, stand, add(stand, [0, 0.022, 0]), 0.05, 0.04, 7, BRASS, { j: 0.1 });
    const ball = add(stand, [0, 0.022 + 0.05, 0]);
    blob(m, ball, [0.055, 0.055, 0.055], 1, 0, BALL, { e: 0.7, j: 0.04 });
    m.halo(ball, 0.2, BALL_HALO);
    for (let i = 0; i < ri(2, 3); i++) {
      const at: Vec3 = [rf(0.0, 0.1), TOP, Z + rf(-0.06, 0.08)];
      bipyr(m, add(at, [0, 0.02, 0]), rf(0.018, 0.025), rf(0.035, 0.05), 4, c.pick(PALE_CRYSTALS), { e: 0.35, j: 0.08 });
    }
    scroll(m, [rf(-0.28, -0.18), TOP, Z + rf(-0.03, 0.04)], 0.22, 0.022, rf(-0.5, 0.5));
    if (c.chance(0.6)) scroll(m, [rf(-0.12, -0.04), TOP, Z + rf(-0.02, 0.06)], 0.18, 0.02, rf(1, 2.2));
    return this.label;
  },
};

export default design;
