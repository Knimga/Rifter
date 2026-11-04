// Model for Book Stacks (data/world/decorObjects.ts › book-stacks): books stacked on the floor of one tile. Three
// haphazard stacks, each book turned its own way, one stack much taller than the other two; and a book or two on their
// own: lying flat on the floor, or standing on end leaning against the tall stack.
// Seeds vary the books (how many, their sizes, covers and turns), where the stacks stand, and the loose books.
// Placed, true size: its tile's center at the origin, the floor at y = 0.
import type { Design } from '../../core/types';
import type { RGB, Vec3 } from '../../core/vec';
import { decorEntry } from '../_decor';
import { LEATHER, book, bookStack, uprightBook } from '../_books';

const design: Design = {
  ...decorEntry('book-stacks'),
  category: 'decor',
  fit: { kind: 'placed', height: 1.5 },
  budget: 700,
  build(c) {
    const m = c.mesh;
    const { rf, ri, pick, chance } = c;
    m.anchor('feet', [0, 0, 0]);
    const cover = (): RGB => pick(LEATHER);

    /** A stack of `n` books on `at`, each a little smaller than the one under it, turned haphazardly. */
    const stack = (at: Vec3, n: number) => {
      let w = rf(0.24, 0.28);
      bookStack(m, at, Array.from({ length: n }, () => {
        const b = { size: [w, rf(0.038, 0.058), w * rf(0.68, 0.76)] as Vec3, yaw: rf(-0.45, 0.45), cover: cover() };
        w *= rf(0.93, 1.0);
        return b;
      }));
    };

    // The tall stack toward the back, the two short ones in front of it, to either side
    const tall: Vec3 = [rf(-0.12, 0.0), 0, rf(-0.2, -0.12)];
    stack(tall, ri(6, 8));
    stack([rf(0.16, 0.24), 0, rf(-0.06, 0.04)], ri(2, 4));
    stack([rf(-0.26, -0.18), 0, rf(0.14, 0.22)], ri(2, 3));

    // One or two books on their own: one lying flat in front, and maybe one on end leaning against the tall stack
    book(m, [rf(0.06, 0.2), 0, rf(0.2, 0.3)], [rf(0.2, 0.24), rf(0.035, 0.05), rf(0.15, 0.17)], rf(0, Math.PI), cover());
    if (chance(0.6)) uprightBook(m, [tall[0] + 0.19, 0, tall[2] + rf(-0.03, 0.03)], [rf(0.04, 0.055), rf(0.22, 0.26), rf(0.16, 0.18)], rf(0.25, 0.4), cover());
    return this.label;
  },
};

export default design;
