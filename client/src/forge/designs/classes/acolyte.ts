// Model for Acolyte (data/units/classes.ts › acolyte). Holds the member's weapon (src/forge/equip.ts): a staff
// is held like a walking stick (as the Arcanist's), a wand in the standard pose.
// Robed like the Arcanist and Occultist (casterRobe: fitted at the waist, bell sleeves, hood pushed back), in
// faded off-white with black and red accents: black edging, a red sash, the hood lined in deep red. The Knight's skin.
// Blonde hair: a smooth cap like the Barbarian's and Primalist's (no ponytail), with short spiky bangs along the
// forehead.
import type { Design } from '../../core/types';
import type { RGB } from '../../core/vec';
import { CHARACTER_HEIGHT } from '../../core/stage-config';
import { capWithBangs, casterRobe, classEntry, classHold } from '../_character';

const HAIR: RGB = [222, 194, 122]; // blonde

const { id, label, source } = classEntry('acolyte');

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
