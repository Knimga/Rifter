// Model for Archer (data/units/classes.ts › archer). Holds the member's bow (src/forge/equip.ts): low in front
// of the body in the left hand, its arrow line pointing toward the ground, the right hand at the string.
// Same body and stance as the Knight (only the arms differ). Brown leather jerkin, dark green trousers,
// black boots; a dark green shawl over the shoulders (not over the face) with a hood hanging behind; a
// brown quiver across the back. Short spiky dark brown hair, the Rogue's tawny skin.
import type { Design } from '../core/types';
import { box, frustum } from '../core/primitives';
import { add, mulC, type RGB, type Vec3 } from '../core/vec';
import { CHARACTER_HEIGHT } from '../core/stage-config';
import { TORSO, buildBody, classEntry, classHold, fittedJerkin, hoodDown, shawl, spikyHair } from './_character';

const LEATHER: RGB = [112, 76, 48];
const GREEN: RGB = [40, 64, 44];
const QUIVER: RGB = [104, 70, 44];
const STRAP: RGB = [62, 44, 32];
const FLETCH: RGB = [214, 206, 188];

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

    // Quiver strap across the chest, from the right shoulder to the left hip
    m.part('quiver', [0, TORSO.chest, -0.14]);
    frustum(m, [-0.15, TORSO.shoulder + 0.02, 0.118], [0.16, TORSO.hip + 0.08, 0.112], 0.017, 0.017, 4, STRAP);
    // Quiver across the back, its mouth over the right shoulder, with arrow fletchings showing
    const bottom: Vec3 = [0.08, TORSO.waist - 0.04, -0.13];
    const top: Vec3 = [-0.13, TORSO.shoulder + 0.09, -0.16];
    frustum(m, bottom, top, 0.052, 0.062, 7, QUIVER);
    frustum(m, top, add(top, [-0.01, 0.025, -0.002]), 0.068, 0.068, 7, STRAP, { caps: false }); // rim
    for (const [dx, dz] of [[-0.02, 0.012], [0.015, -0.01], [-0.005, -0.03]] as const) {
      const base = add(top, [dx, 0.02, dz]);
      frustum(m, base, add(base, [-0.025, 0.07, -0.004]), 0.008, 0.008, 3, [92, 70, 48]); // shaft
      box(m, add(base, [-0.03, 0.08, -0.004]), [0.012, 0.06, 0.034], FLETCH); // fletching
    }

    // Dark green shawl over the shoulders (the face left clear), with its hood hanging behind
    shawl(m, GREEN, false);
    hoodDown(m, { cloth: mulC(GREEN, 0.95), lining: [22, 30, 24], trim: mulC(GREEN, 1.35) });
    return label;
  },
};

export default design;
