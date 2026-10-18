// Model for Knight (data/classes.ts › knight). Holds the member's weapon and shield (src/forge/equip.ts).
// Lean and solid: dark gray plate over the chest, small pauldrons and vambraces, dull trousers, dark boots,
// no helmet, short spiky brown hair.
import type { Design } from '../core/types';
import { frustum } from '../core/primitives';
import { mulC, type RGB } from '../core/vec';
import { CHARACTER_HEIGHT } from '../core/stage-config';
import { armJoints, buildBody, classEntry, classHold, cuirass, pauldron, spikyHair, type BodyBuild } from '../designs/_character';

const PLATE: RGB = [112, 116, 124];const PLATE_EDGE: RGB = [138, 142, 150];
const LEATHER: RGB = [88, 62, 42];
const BUCKLE: RGB = [176, 178, 184];

const { id, label, source } = classEntry('knight');

const design: Design = {
  id, label, source,
  category: 'character',
  fit: { kind: 'standing', height: CHARACTER_HEIGHT, maxRadius: 0.54 },
  budget: 1200,
  build(c) {
    const m = c.mesh;
    const build: BodyBuild = { hold: classHold(c, 'knight') };
    buildBody(m, {
      skin: [222, 180, 148],
      pants: [84, 92, 106], // dull blue-gray
      boots: [50, 40, 34],
      sleeves: [92, 96, 104], // padded gambeson under the plate
      gloves: LEATHER,
    }, build);
    spikyHair(m, [98, 66, 42], c.rf); // short brown hair, spiked up and forward

    // Breastplate with a center ridge, plate skirt and sword belt
    cuirass(m, { plate: PLATE, edge: PLATE_EDGE, faulds: mulC(PLATE, 0.9), belt: LEATHER, buckle: BUCKLE }, true);

    // Small pauldrons capping the shoulders, and vambraces over the forearms
    m.part('armor', [0, 1.5, 0]);
    for (const sx of [-1, 1] as const) {
      const a = armJoints(sx, build);
      pauldron(m, a.shoulder, mulC(PLATE, 0.94));
      frustum(m, [a.elbow[0], a.elbow[1] - 0.04, a.elbow[2] + 0.02], [a.wrist[0], a.wrist[1] + 0.03, a.wrist[2] - 0.01], 0.056, 0.05, 6, PLATE);
    }
    return label;
  },
};

export default design;
