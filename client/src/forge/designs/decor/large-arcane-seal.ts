// Model for Large Arcane Seal (data/world/decorObjects.ts › large-arcane-seal): ground clutter, 5 x 5 tiles. An ancient
// arcane seal carved into the floor, in the manner of the enchanter's rune circle: a ring around its rim, a dotted
// ring and a dashed one inside it, leylines running out to the rim, two crossed squares around a small circle and a
// center mark, diamond runes at the four points and a ring of rune glyphs. Black grooves, never glowing: old and worn,
// its lines broken off here and there, some pieces gone.
// Placed, true size: its 5 x 5 tiles centered on the origin, flat on the floor.
import type { Design } from '../../core/types';
import { mulC, type RGB, type Vec3 } from '../../core/vec';
import { decorEntry } from '../_decor';
import { sigilPen, type P } from '../_sigil';

/** The grooves: near-black, a little lighter or darker from stroke to stroke. */
const GROOVE: RGB = [14, 13, 16];
/** Its scale: the enchanter's motif is drawn 122 units to its rim; this seal's rim is 2.3 tiles out. */
const S = 2.3 / 122;
/** How far above the floor its grooves lie (just enough to draw over it). */
const Y = 0.004;
/** A groove's width (tiles). */
const W = 0.034;

const design: Design = {
  ...decorEntry('large-arcane-seal'),
  category: 'decor',
  fit: { kind: 'placed', height: 0.02 },
  budget: 900,
  build(c) {
    const m = c.mesh;
    const { rf, chance } = c;
    m.anchor('feet', [0, 0, 0]);
    // The motif (its units, x right and y down as drawn) carved into the floor
    const { carve, ring, dashed, diamond, polygon, runeRing } = sigilPen(m, c, {
      at: ([u, v]: P): Vec3 => [u * S, Y, v * S], scale: S, width: W,
      shade: () => mulC(GROOVE, rf(0.75, 1.3)), behind: [0, -1, 0],
    });


    // Rings: the rim, a dotted ring (dots, a few worn away), a dashed ring
    ring(122, 96, 0.12, W * 1.2);
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      if (!chance(0.18)) diamond([Math.cos(a) * 108, Math.sin(a) * 108], 1.6);
    }
    dashed(84, [14, 5, 3, 5]);
    // Leylines out to the rim, each broken somewhere along it
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, steps = 5;
      carve(Array.from({ length: steps + 1 }, (_, i): P => { const r = 84 + (38 * i) / steps; return [Math.cos(a) * r, Math.sin(a) * r]; }), 0.2);
    }
    // Two crossed squares, a small circle and the center mark
    for (const turn of [0, Math.PI / 4]) {
      const corners = [[-44, -44], [44, -44], [44, 44], [-44, 44]].map(([u, v]): P => [u * Math.cos(turn) - v * Math.sin(turn), u * Math.sin(turn) + v * Math.cos(turn)]);
      polygon(corners, 4, 0.12);
    }
    ring(14, 12, 0.1);
    diamond([0, 0], 4);
    // Diamond runes at the four points of the rim
    for (const [u, v] of [[0, -122], [0, 122], [-122, 0], [122, 0]] as P[]) diamond([u, v], 5.5);
    // A ring of rune glyphs between the dashed ring and the dots: each two or three short strokes, some worn away
    runeRing(96, 16);
    return this.label;
  },
};

export default design;
