// Model for Archer (data/units/classes.ts › archer). Holds the member's bow (src/forge/equip.ts): low in front
// of the body in the left hand, its arrow line pointing toward the ground, the right hand at the string.
// Same body and stance as the Knight (only the arms differ). Brown leather jerkin, dark green trousers,
// black boots; a dark green shawl over the shoulders (not over the face) with a hood hanging behind. Short
// spiky dark brown hair, the Rogue's tawny skin. Its quiver is gear now (the equipped quiver, worn on the back:
// drafts/leather-quiver.ts), so with none equipped its back is bare.
import type { Design } from '../core/types';
import { mulC, type RGB } from '../core/vec';
import { CHARACTER_HEIGHT } from '../core/stage-config';
import { buildBody, classEntry, classHold, fittedJerkin, hoodDown, shawl, spikyHair } from './_character';

const LEATHER: RGB = [112, 76, 48];
const GREEN: RGB = [40, 64, 44];
const STRAP: RGB = [62, 44, 32];

const { id, label, source } = classEntry('archer');

const design: Design = {
  id, label, source,
  category: 'character',
  fit: { kind: 'standing', height: CHARACTER_HEIGHT, maxRadius: 0.54 },
  budget: 1300,
  build(c) {
    const m = c.mesh;
    buildBody(m, {
      skin: [178, 124, 80], // tawny, as the Rogue
      pants: [44, 62, 44], // dark green
      boots: [26, 24, 24], // black
      sleeves: mulC(LEATHER, 0.85),
      gloves: STRAP,
    }, { hold: classHold(c, 'archer') });
    spikyHair(m, [62, 42, 30], c.rf); // dark brown
    fittedJerkin(m, LEATHER, STRAP, [150, 146, 136]);

    // Dark green shawl over the shoulders (the face left clear), with its hood hanging behind
    shawl(m, GREEN, false);
    hoodDown(m, { cloth: mulC(GREEN, 0.95), lining: [22, 30, 24], trim: mulC(GREEN, 1.35) });
    return label;
  },
};

export default design;
