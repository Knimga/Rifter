// Model for Acolyte (data/units/classes.ts › acolyte). Holds the member's weapon (src/forge/equip.ts): a staff
// is held like a walking stick (as the Arcanist's), a wand in the standard pose.
// Robed like the Arcanist and Occultist (casterRobe: fitted at the waist, bell sleeves, hood pushed back), in
// faded off-white with black and red accents: black edging, a red sash, the hood lined in deep red. The Knight's skin.
// Blonde hair: a smooth cap like the Barbarian's and Primalist's (no ponytail), with short spiky bangs along the
// forehead.
import type { Design } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { blob, frustum } from '../../core/primitives';
import { add, mul, norm, type RGB, type Vec3 } from '../../core/vec';
import { CHARACTER_HEIGHT } from '../../core/stage-config';
import { HEAD, casterRobe, classEntry, classHold } from '../_character';

const HAIR: RGB = [222, 194, 122]; // blonde

const { id, label, source } = classEntry('acolyte');

/**
 * A cap of hair, smooth over the crown and back of the head (as ponytailHair's, without the tail), and a
 * fringe of short spiky bangs along the forehead, pointing forward and down. `rf` jitters the bangs.
 */
function capWithBangs(m: Mesh, color: RGB, rf: (a: number, b: number) => number): void {
  const { center: h, rx, ry, rz } = HEAD;
  m.part('hair', h);
  blob(m, add(h, [0, ry * 0.28, 0.002]), [rx * 1.17, ry * 0.84, rz * 1.2], 1, 0.02, color, { floorY: h[1] + ry * 0.12 }); // crown
  blob(m, add(h, [0, ry * 0.05, -0.04]), [rx * 1.12, ry * 0.92, rz * 0.9], 1, 0.02, color, { floorY: h[1] - ry * 0.45 }); // back
  // Bangs: a row across the front hairline, each a short spike over the forehead, the outer ones fanning out
  const n = 5;
  for (let i = 0; i < n; i++) {
    const t = -1 + (2 * i) / (n - 1); // -1..1 across the forehead
    const base: Vec3 = add(h, [t * rx * 0.72, ry * (0.42 - Math.abs(t) * 0.1), rz * (0.98 - Math.abs(t) * 0.18)]);
    const dir = norm([t * 0.45, -0.75, 0.55]);
    frustum(m, base, add(base, mul(dir, rf(0.05, 0.065))), 0.03, 0.004, 4, color);
  }
}

const design: Design = {
  id, label, source,
  category: 'character',
  fit: { kind: 'standing', height: CHARACTER_HEIGHT, maxRadius: 0.54 },
  budget: 1300,
  build(c) {
    casterRobe(c.mesh, c.rf, {
      skin: [222, 180, 148], // the Knight's
      hair: HAIR,
      robe: [206, 198, 180], // faded off-white
      trim: [30, 28, 30], // black edging
      sash: [146, 34, 32], // red
      pants: [54, 50, 52],
      boots: [40, 34, 32],
      lining: [92, 22, 24], // deep red
      drawHair: (m) => capWithBangs(m, HAIR, c.rf),
    }, { hold: classHold(c, 'acolyte') });
    return label;
  },
};

export default design;
