// Model for Warded Stone Door (data/world/interactiveObjects.ts › warded-stone-door): the door between the Dark Tunnel
// and the Sanctum. A slab of stone with an arched top, set in an arch of wedge stones under a keystone, in the
// Sanctum's stone: greys tinted blue-violet, each stone its own shade. A worn, dark rune is carved in the middle of
// the slab on both faces, in the Sanctum's sigil manner (_sigil.ts): a seal of rings, spokes and runes.
// Its surround is flat-topped and square-sided outside (arched only inside), the size of a heavy door's frame: the
// terrain's doorway (thin jambs at its sides, a lintel from LINTEL_Y up) closes around it with no gaps.
// Built in tiles, facing +z (its front), width along x, standing on the floor; it sits in a wall tile, turned to face
// the floor tile it opens onto. Both faces are dressed (it is seen from either side).
import type { Design } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { box } from '../../core/primitives';
import { mixC, mulC, type RGB, type Vec3 } from '../../core/vec';
import { interactiveEntry } from '../_interactive';
import { sigilPen, type P } from '../_sigil';

/** The Sanctum's stone (its walls are [40, 40, 70]): lighter greys, tinted blue-violet. */
const STONE: RGB = [70, 70, 92];
const STONE_DARK: RGB = [54, 54, 76];
const STONE_LIGHT: RGB = [84, 83, 106];
/** The slab: darker than its surround, so the arch's outline reads against it from above. */
const SLAB: RGB = [44, 44, 64];
/** The stone filling the arch's upper corners: darker than the arch's ring, so the ring stands out. */
const SPANDREL: RGB = [50, 50, 70];
/** The rune's grooves: from a deep blue-black toward the slab (worn). */
const RUNE_DEEP: RGB = [12, 12, 22];

/** The surround's outside: half its width, its height (flat-topped: the doorway's lintel rests on it), half its depth. */
const OW = 0.46, TOP = 1.4, OD = 0.13;
/** The arched opening: half its width (the arch's radius), the height its arch springs from (its crown at SPRING + A). */
const A = 0.29, SPRING = 0.98;
/** The arch's ring of wedge stones: how far out from the opening it reaches, and how many stones (odd: a keystone in the middle). */
const RING = 0.1, STONES = 7;
/** The slab's half thickness (set back in the surround). */
const SD = 0.045;

/**
 * A flat stone piece, `poly` (x, y) its outline (a fan from `from`, default its first point, must see every edge),
 * standing between z = -d and +d (or z0..z1), its edges walled: a block of the surround, the slab.
 */
function slab(m: Mesh, poly: [number, number][], col: RGB, z0: number, z1: number, from = 0): void {
  const n = poly.length, cz = (z0 + z1) / 2;
  const cx = poly.reduce((s, p) => s + p[0], 0) / n, cy = poly.reduce((s, p) => s + p[1], 0) / n;
  const C: Vec3 = [cx, cy, cz];
  const o = poly[from];
  for (let k = 1; k < n - 1; k++) {
    const b = poly[(from + k) % n], c = poly[(from + k + 1) % n];
    for (const z of [z0, z1]) m.tri([o[0], o[1], z], [b[0], b[1], z], [c[0], c[1], z], col, C, { j: 0.05 });
  }
  for (let k = 0; k < n; k++) {
    const a = poly[k], b = poly[(k + 1) % n];
    m.quad([a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1], mulC(col, 0.9), C, { j: 0.05 });
  }
}

const design: Design = {
  ...interactiveEntry('warded-stone-door'),
  category: 'interactive',
  fit: { kind: 'standing', height: TOP, maxRadius: 0.5 },
  budget: 900,
  build(c) {
    const m = c.mesh;
    const { rf } = c;
    m.anchor('feet', [0, 0, 0]); // the middle of the doorway: this point goes to the tile center
    const shade = () => mixC(STONE_DARK, STONE_LIGHT, rf(0.15, 0.85));
    // The arch's wedge stones: the palest of the surround, so its curve reads
    const archShade = () => mixC(STONE, STONE_LIGHT, rf(0.3, 1));
    const arc = (r: number, t: number): [number, number] => [Math.cos(t) * r, SPRING + Math.sin(t) * r];

    // The surround. Jambs: a pillar each side up to where the arch springs, in three courses
    m.part('frame');
    for (const sx of [-1, 1]) {
      const COURSES = 3;
      for (let k = 0; k < COURSES; k++) {
        const y0 = (SPRING * k) / COURSES, y1 = (SPRING * (k + 1)) / COURSES;
        box(m, [sx * (A + OW) / 2, (y0 + y1) / 2, 0], [OW - A - 0.004, y1 - y0 - 0.008, OD * 2], shade(), 0.01, { j: 0.06 });
      }
    }
    // The arch: a ring of wedge stones around the opening, the middle one the keystone (paler, standing a little
    // proud of the face), each from the opening out to RING beyond it
    for (let k = 0; k < STONES; k++) {
      const t0 = Math.PI - (k / STONES) * Math.PI, t1 = Math.PI - ((k + 1) / STONES) * Math.PI;
      const key = k === (STONES - 1) / 2, proud = key ? 0.02 : 0;
      const inner0 = arc(A, t0), inner1 = arc(A, t1), outer0 = arc(A + RING + (key ? 0.03 : 0), t0), outer1 = arc(A + RING + (key ? 0.03 : 0), t1);
      slab(m, [inner0, inner1, outer1, outer0], key ? mulC(STONE_LIGHT, 1.08) : archShade(), -OD - proud, OD + proud);
    }
    // The spandrels: the stone filling each upper corner, from the arch's ring out to the surround's square outline
    // (a fan from the corner, which sees all of it)
    for (const sx of [-1, 1]) {
      const ring: [number, number][] = Array.from({ length: 6 }, (_, i) => {
        const t = sx > 0 ? (i / 5) * (Math.PI / 2) : Math.PI - (i / 5) * (Math.PI / 2);
        return arc(A + RING, t);
      });
      slab(m, [[sx * OW, TOP], [sx * OW, SPRING], ...ring, [0, TOP]], SPANDREL, -OD, OD);
    }

    // The door: a slab filling the arch, set back in it
    m.part('door');
    const outline: [number, number][] = [[-A, 0], [A, 0], ...Array.from({ length: 9 }, (_, i) => arc(A - 0.002, (i / 8) * Math.PI))];
    slab(m, outline, SLAB, -SD, SD);

    // The rune on both faces: a small worn seal in the slab's middle, its grooves dark
    const R = 100, radius = 0.17, cy = 0.78, S = radius / R;
    for (const face of [1, -1]) {
      const pen = sigilPen(m, c, {
        at: ([u, v]: P): Vec3 => [face * u * S, cy - v * S, face * (SD + 0.003)],
        scale: S, width: 0.016,
        shade: () => mixC(RUNE_DEEP, SLAB, rf(0.05, 0.4)),
        behind: [0, cy, -face],
      });
      const { carve, ring, runeRing, diamond } = pen;
      const GONE = 0.18;
      ring(R, 32, GONE);
      ring(R * 0.6, 22, GONE);
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        carve([0, 1, 2].map((i): P => [Math.cos(a) * R * (0.6 + 0.2 * i), Math.sin(a) * R * (0.6 + 0.2 * i)]), GONE);
      }
      runeRing(R * 0.8, 8, 1.2, GONE);
      diamond([0, 0], 9);
    }

    // A worn threshold stone under it, a little wider than the opening
    m.part('frame');
    box(m, [0, 0.015, 0], [A * 2 + 0.06, 0.03, OD * 2 + 0.04], STONE_DARK, 0.004, { j: 0.06 });

    return this.label;
  },
};

export default design;
