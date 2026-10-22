// Model for Rogue (data/classes.ts › rogue). Holds the member's weapon (src/forge/equip.ts).
// Same body and pose as the Knight, but no armor: a slim dark gray jerkin, dark trousers and boots, and a
// near-black shawl wrapped around the shoulders and neck, pulled up over the mouth, with its black hood up
// over the head (a lip framing the face). Slightly darker skin.
import type { Design } from '../core/types';
import { box } from '../core/primitives';
import { add, mulC, rotZ, type RGB, type Vec3 } from '../core/vec';
import { CHARACTER_HEIGHT } from '../core/stage-config';
import { TORSO, buildBody, classEntry, classHold, fittedJerkin, hoodUp, shawl } from '../designs/_character';

const JERKIN: RGB = [72, 74, 80]; // dark gray, sleeves to match
const SHAWL: RGB = [32, 32, 36];
const BUCKLE: RGB = [150, 146, 136];

const { id, label, source } = classEntry('rogue');

const design: Design = {
  id, label, source,
  category: 'character',
  fit: { kind: 'standing', height: CHARACTER_HEIGHT, maxRadius: 0.54 },
  budget: 1200,
  build(c) {
    const m = c.mesh;
    buildBody(m, {
      skin: [178, 124, 80], // tawny
      pants: [36, 36, 40],
      boots: [34, 30, 28],
      sleeves: mulC(JERKIN, 0.9),
      gloves: [40, 34, 30],
    }, { hold: classHold(c, 'rogue') });

    fittedJerkin(m, JERKIN, [40, 32, 28], BUCKLE);

    // Shawl pulled up over the mouth, with a loose end hanging over the left shoulder
    shawl(m, SHAWL, true);
    const s0 = m.faces.length;
    box(m, [0, -0.13, 0], [0.075, 0.26, 0.022], SHAWL, 0.15);
    const tail: Vec3 = [0.12, TORSO.shoulder - 0.02, 0.13];
    m.xf(s0, (p) => add(rotZ(p, 0.15), tail)); // hanging end, angled slightly

    // The shawl's black hood, up over the head (it hides the hair): a lip around the face, lined inside
    hoodUp(m, { cloth: [24, 24, 28], lining: [12, 12, 14], trim: [30, 30, 34] });
    return label;
  },
};

export default design;
