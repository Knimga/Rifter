// Model for Faded Wall Sigil (data/world/decorObjects.ts › faded-wall-sigil): wall clutter, placed by hand in the
// Sanctum. An ancient ward carved into the wall by something powerful, to hold back the void pressing on the outer
// walls, in the Large Arcane Seal's manner (_sigil.ts), but faded almost to nothing: its grooves barely darker than
// the wall, many of its lines worn away. Each seed is one of several forms:
// - a seal: a rim, an inner ring, spokes between them and a ring of runes, a diamond at its heart;
// - a ward: a ring around one triangle, or two crossed into a star, a diamond at each point;
// - an eye: two arcs meeting in points, a ring as its pupil, rays fanning out;
// - rings: a dashed ring, a plain one, and two crossed squares inside;
// - a stave: an upright line with crossbars and diamonds, a small ring on top.
// Small ones fit within the wall's height, their circles usually missing whole arcs; large ones are cut off by the floor or by the wall's top.
// Placed, true size: against the wall plane z = -0.5 (its back), facing +z; centered along the wall on its tile,
// reaching up to 1.5 tiles either way (its entry's span, 3).
import type { Design } from '../../core/types';
import { mixC, type RGB, type Vec3 } from '../../core/vec';
import { WALL_HEIGHTS } from '../../terrain/build';
import { decorEntry } from '../_decor';
import { sigilPen, type P } from '../_sigil';

/** Its grooves: from a dark blue-black (the deepest) toward the Sanctum's wall stone (worn nearly away). */
const DEEP: RGB = [14, 14, 24];
const WALL: RGB = [40, 40, 70];
/** How far in front of the wall plane its grooves lie: clear of the rough wall's bulges. */
const OUT = 0.022;
/** The heights it is drawn between: just off the floor, and just under the Sanctum's (high) wall top. */
const CLIP: [number, number] = [0.004, WALL_HEIGHTS.high - 0.05];
/** A motif's radius (its units), whatever its size on the wall. */
const R = 100;

const design: Design = {
  ...decorEntry('faded-wall-sigil'),
  category: 'decor',
  fit: { kind: 'placed', height: WALL_HEIGHTS.high },
  budget: 350,
  build(c) {
    const m = c.mesh;
    const { rf, ri, pick, chance } = c;
    m.anchor('feet', [0, 0, 0]);

    // Its size and height on the wall: small, within the wall; or large, cut off by the floor or the wall's top (its
    // middle a little inside, so more than half of it shows)
    const large = chance(0.6);
    const radius = large ? rf(0.85, 1.35) : rf(0.3, 0.55);
    const top = CLIP[1];
    const cy = !large ? rf(radius + 0.15, top - radius - 0.1)
      : chance(0.5) ? radius * rf(0.08, 0.4) // sunk into the floor
        : top - radius * rf(0.08, 0.4); // running past the wall's top
    const S = radius / R;
    const pen = sigilPen(m, c, {
      at: ([u, v]: P): Vec3 => [u * S, cy - v * S, -0.5 + OUT],
      scale: S, width: Math.min(0.03, radius * 0.045),
      shade: () => mixC(DEEP, WALL, rf(0.2, 0.7)), // faded: some strokes nearly gone into the stone
      behind: [0, cy, -2], clipY: CLIP,
    });
    const { carve, ring, dashed, diamond, polygon, runeRing, arcGaps } = pen;
    const GONE = 0.3; // more worn than the seal: a third of each line gone
    // A small one's circles usually have whole arcs gone, one or two each (a large one's are cut off already)
    const gaps = () => (!large && chance(0.85) ? arcGaps(ri(1, 2)) : undefined);
    const polar = (r: number, a: number): P => [Math.cos(a) * r, Math.sin(a) * r];

    const form = pick(['seal', 'ward', 'eye', 'rings', 'stave'] as const);
    if (form === 'seal') {
      ring(R, 48, GONE, undefined, undefined, gaps());
      ring(R * 0.62, 32, GONE, undefined, undefined, gaps());
      const n = pick([6, 8]);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        carve([0, 1, 2, 3].map((i) => polar(R * (0.62 + (0.38 * i) / 3), a)), GONE);
      }
      runeRing(R * 0.81, n * 2, 1.4, GONE);
      diamond([0, 0], 6);
    } else if (form === 'ward') {
      ring(R, 48, GONE, undefined, undefined, gaps());
      const star = chance(0.5);
      for (const turn of star ? [-Math.PI / 2, Math.PI / 2] : [-Math.PI / 2]) {
        const corners = [0, 1, 2].map((k) => polar(R * 0.92, turn + (k * Math.PI * 2) / 3));
        polygon(corners, 5, GONE);
        for (const q of corners) diamond(q, 5);
      }
      ring(R * 0.22, 12, GONE);
    } else if (form === 'eye') {
      // Two arcs bulging up and down, meeting in points at either side
      const arc = (dir: number) => Array.from({ length: 13 }, (_, i): P => {
        const t = -1 + i / 6;
        return [t * R, dir * R * 0.45 * (1 - t * t)];
      });
      carve(arc(1), GONE);
      carve(arc(-1), GONE);
      ring(R * 0.24, 14, GONE * 0.5);
      diamond([0, 0], 5);
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI / 2 + ((k - 3) / 3) * 0.9;
        if (!chance(GONE)) carve([polar(R * 0.55, a), polar(R * 0.78, a), polar(R * 0.95, a)], 0.1);
      }
    } else if (form === 'rings') {
      dashed(R, [14, 5, 3, 5], GONE, gaps());
      ring(R * 0.8, 40, GONE, undefined, undefined, gaps());
      for (const turn of [0, Math.PI / 4]) polygon([0, 1, 2, 3].map((k) => polar(R * 0.55, turn + Math.PI / 4 + (k * Math.PI) / 2)), 4, GONE);
      ring(R * 0.14, 10, GONE);
    } else {
      // A stave: an upright line (taller than wide), crossbars and diamonds along it, a small ring on top
      carve(Array.from({ length: 13 }, (_, i): P => [0, -R + (2 * R * i) / 12]), GONE * 0.4);
      const bars = ri(4, 5);
      for (let k = 0; k < bars; k++) {
        const v = -R * 0.7 + (R * 1.5 * k) / (bars - 1), w = R * rf(0.18, 0.34);
        carve([[-w, v], [-w / 2, v + R * 0.05], [0, v + R * 0.08], [w / 2, v + R * 0.05], [w, v]], GONE * 0.5);
        diamond([0, v - R * 0.12], 5);
      }
      ring(R * 0.16, 10, GONE * 0.5, undefined, [0, -R * 1.05]);
    }
    return this.label;
  },
};

export default design;
