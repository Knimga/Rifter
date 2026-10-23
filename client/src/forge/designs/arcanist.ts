// Model for Arcanist (data/units/classes.ts › arcanist). Holds the member's weapon (src/forge/equip.ts): a staff
// is held like a walking stick, its foot planted on the ground.
// Same body and pose as the Knight. Gentle blue robes fitted at the waist, flaring to the ankles, with
// bell sleeves widening toward the hands and linen edging; short spiky gray hair; the Knight's skin.
// His hood is pushed back, hanging behind the neck.
import type { Design } from '../core/types';
import { CHARACTER_HEIGHT } from '../core/stage-config';
import { casterRobe, classEntry, classHold } from './_character';

const { id, label, source } = classEntry('arcanist');

const design: Design = {
  id, label, source,
  category: 'character',
  fit: { kind: 'standing', height: CHARACTER_HEIGHT, maxRadius: 0.54 },
  budget: 1300,
  build(c) {
    casterRobe(c.mesh, c.rf, {
      skin: [222, 180, 148], // the Knight's
      hair: [150, 150, 152], // gray
      robe: [88, 100, 134], // gentle blue, as the Apprentice Robes
      trim: [200, 188, 154], // linen
      sash: [120, 86, 58],
      pants: [60, 58, 62],
      boots: [52, 42, 36],
      lining: [30, 32, 40],
    }, { hold: classHold(c, 'arcanist') });
    return label;
  },
};

export default design;
