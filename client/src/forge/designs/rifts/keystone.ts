// Model for Keystone (data/world/rifts.ts › keystone): every keystone in the game, painted when drawn in its
// dungeon's color (riftColor; a tinted model, core/tint.ts), the same color as the rift it opens. A fist-sized,
// squat glowing pill (a short cylinder with rounded ends), lying on its side: brightest on the side facing up,
// shading toward the tint's deep tone underneath (it is unlit, so the shading is in its color), with a wide halo
// in its color. Sized to sit in the Rifter's socket (its `socket` anchor) when a rift is opened.
// An item: one look. Built with its length along x, its outline in the x-y plane; lying as loot (pitched flat,
// +z up), its +z side is the top.
import type { Design, Tone } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { mulC, type RGB, type Vec3 } from '../../core/vec';
import { RIFT_MODELS } from '../../../data/world/rifts';

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
/** The pill: its round section's radius, and the half-length of its straight middle (before the fit scales it). */
const R = 0.31, HALF = 0.2;
const C: Vec3 = [0, 0, 0];

/**
 * The pill: rings along x (round ends of a few steps, a straight middle), each face tinted by how far it faces
 * up (+z, the top as it lies): the dungeon color at full strength on top, with a hint of white, deepening a
 * little below.
 */
function pill(m: Mesh): void {
  const SIDES = 10, CAP = [0, Math.PI / 6, Math.PI / 3, Math.PI / 2]; // angles from an end's tip to its rim
  // Profile along x: [x, ring radius], from the left tip to the right one
  const profile: [number, number][] = [
    ...CAP.map((a): [number, number] => [-(HALF + R * Math.cos(a)), R * Math.sin(a)]),
    ...[...CAP].reverse().map((a): [number, number] => [HALF + R * Math.cos(a), R * Math.sin(a)]),
  ];
  const at = (k: number, i: number): Vec3 => {
    const a = (i / SIDES) * 2 * Math.PI, [x, r] = profile[k];
    return [x, Math.cos(a) * r, Math.sin(a) * r];
  };
  for (let k = 0; k < profile.length - 1; k++)
    for (let i = 0; i < SIDES; i++) {
      const a = at(k, i), b = at(k, i + 1), c = at(k + 1, i + 1), d = at(k + 1, i);
      const up = Math.sin(((i + 0.5) / SIDES) * 2 * Math.PI); // -1 (underneath) .. 1 (top)
      const down = (1 - up) / 2;
      const tone: Tone = [1.05 - 0.2 * down, 0.2 * down];
      const lift = mulC(WHITE, 0.04 * (1 - down));
      // The tips are single points: their faces are triangles
      if (profile[k][1] === 0) m.tri(a, c, d, lift, C, { e: 1, j: 0.06, tint: tone });
      else if (profile[k + 1][1] === 0) m.tri(a, b, c, lift, C, { e: 1, j: 0.06, tint: tone });
      else m.quad(a, b, c, d, lift, C, { e: 1, j: 0.06, tint: tone });
    }
}

const design: Design = {
  id: 'rift.keystone',
  category: 'rift',
  label: RIFT_MODELS.keystone.name,
  source: { table: 'rifts', key: RIFT_MODELS.keystone.id },
  // Fist-sized (its length; about 0.085 across): it fits the Rifter's socket (about 0.13 tiles across). Lies flat
  // as loot (the default pitch), on its side, turned 45° first so its length runs along the grid, not across the
  // screen
  fit: { kind: 'item', size: 0.135, groundRollDeg: 45 },
  budget: 150,
  build(c) {
    const m = c.mesh;
    m.part('pill', C);
    pill(m);
    // A wide halo, half the dungeon color and half its deeper, more saturated shade: it glows well past its size and
    // keeps the hue where it adds onto the pill (a pale color would otherwise wash out to white there)
    m.halo(C, (HALF + R) * 3.2, BLACK, [0.5, 0.5]);
    return design.label;
  },
};
export default design;
