// Model for Occultist (data/classes.ts › occultist). Holds the member's weapon (src/forge/equip.ts): a
// wand, held in the standard pose like the Knight's sword.
// Identical to the Arcanist (robes fitted at the waist, bell sleeves, hood pushed back, spiky hair) except:
// black hair, tawny skin, and a muted dark purple robe.
import type { Design } from '../core/types';
import { CHARACTER_HEIGHT } from '../core/stage-config';
import { casterRobe, classEntry, classHold } from '../designs/_character';

const { id, label, source } = classEntry('occultist');

const design: Design = {
  id, label, source,
  category: 'character',
  fit: { kind: 'standing', height: CHARACTER_HEIGHT, maxRadius: 0.54 },
  budget: 1300,
  build(c) {
    casterRobe(c.mesh, c.rf, {
      skin: [178, 124, 80], // tawny
      hair: [26, 24, 24], // black
      robe: [66, 50, 78], // muted dark purple
      trim: [200, 188, 154], // linen, as the Arcanist's
      sash: [120, 86, 58],
      pants: [60, 58, 62],
      boots: [52, 42, 36],
      lining: [30, 32, 40],
    }, { hold: classHold(c, 'occultist') });
    return label;
  },
};

export default design;
