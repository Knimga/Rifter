// Model for Crate Stack (data/world/decorObjects.ts › crate-stack): obstacle, 1 tile, blocks sight. Goblin stores piled
// higher than a head: two crude plank crates side by side, a third set crooked on top of them, and in front of them
// usually a barrel, now and then a smaller crate; dark, grimy wood (each piece somewhere between dark brown and a
// brownish gray) bound with iron straps.
// Placed, true size: its tile centered on the origin.
import type { Design } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { box } from '../../core/primitives';
import { add, mixC, mulC, rotY, type RGB, type Vec3 } from '../../core/vec';
import { DECOR_IRON, barrel, decorEntry } from '../_decor';

/** The wood's two ends: each piece is a mix of them. */
const BROWN: RGB = [58, 40, 27];
const BROWN_GRAY: RGB = [54, 48, 42];

/** A crate of side `s` with its bottom at `at`, turned `turn` about y: planks, darker edge battens and an iron strap. */
function crate(m: Mesh, at: Vec3, s: number, turn: number, col: RGB): void {
  const s0 = m.faces.length;
  box(m, [0, s / 2, 0], [s, s, s], col, 0.03, { j: 0.16 });
  // Battens down its corners, and an iron strap around its middle
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(m, [x * s * 0.47, s / 2, z * s * 0.47], [s * 0.1, s * 1.01, s * 0.1], mulC(col, 0.7), 0.02, { j: 0.12 });
  box(m, [0, s * 0.5, 0], [s * 1.02, s * 0.08, s * 1.02], mulC(DECOR_IRON, 0.85), 0.01, { j: 0.08 });
  m.xf(s0, (p) => add(rotY(p, turn), at));
}

const design: Design = {
  ...decorEntry('crate-stack'),
  category: 'decor',
  fit: { kind: 'placed', height: 1.5 },
  budget: 700,
  build(c) {
    const m = c.mesh;
    const { rf, chance } = c;
    m.anchor('feet', [0, 0, 0]);
    // Each piece's wood: somewhere between dark brown and brownish gray, a little lighter or darker
    const wood = () => mulC(mixC(BROWN, BROWN_GRAY, rf(0, 1)), rf(0.88, 1.08));
    const s = rf(0.38, 0.42);
    crate(m, [-0.22, 0, -0.12], s, rf(-0.08, 0.08), wood());
    crate(m, [0.22, 0, -0.12], s, rf(-0.08, 0.08), wood());
    crate(m, [rf(-0.06, 0.06), s, -0.12], s * rf(0.85, 0.95), rf(-0.3, 0.3), wood());
    // In front: usually a barrel, now and then a smaller crate
    if (chance(0.8)) {
      const staves = wood();
      barrel(m, [rf(-0.2, 0.2), 0, 0.27], rf(0.36, 0.44), 0.13, staves, { lid: mulC(staves, 0.7) });
    } else crate(m, [rf(-0.2, 0.2), 0, 0.28], s * 0.6, rf(-0.4, 0.4), wood());
    return this.label;
  },
};

export default design;
