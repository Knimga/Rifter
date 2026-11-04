// Model for Knight (data/units/classes.ts › knight). Holds the member's weapon and shield (src/forge/equip.ts).
// Lean and solid: dark gray plate over the chest, sloped pauldrons and vambraces, dull trousers, dark boots,
// no helmet, short spiky blonde hair.
import type { Design } from '../../core/types';
import { frustum } from '../../core/primitives';
import { mulC, type RGB } from '../../core/vec';
import { CHARACTER_HEIGHT } from '../../core/stage-config';
import { armJoints, buildBody, classEntry, classHold, cuirass, pauldron, spikyHair, spikyScalp, type BodyBuild } from '../_character';

const PLATE: RGB = [98, 102, 110];
const PLATE_EDGE: RGB = [124, 128, 136];
const LEATHER: RGB = [88, 62, 42];
const BUCKLE: RGB = [176, 178, 184];
const HAIR: RGB = [200, 164, 96];

const { id, label, source } = classEntry('knight');

const design: Design = {
  id, label, source,
  category: 'character',
  fit: { kind: 'standing', height: CHARACTER_HEIGHT, maxRadius: 0.54 },
  budget: 1400,
  build(c) {
    const m = c.mesh;
    const build: BodyBuild = { hold: classHold(c, 'knight') };
    buildBody(m, {
      skin: [222, 180, 148],
      pants: [72, 88, 120], // muted blue
      boots: [50, 40, 34],
      sleeves: [92, 96, 104], // padded gambeson under the plate
      gloves: LEATHER,
    }, build);
    spikyHair(m, HAIR, c.rf); // short blonde hair, spiked up and forward

    // Breastplate with a center ridge, plate skirt and sword belt
    cuirass(m, { plate: PLATE, edge: PLATE_EDGE, faulds: mulC(PLATE, 0.9), belt: LEATHER, buckle: BUCKLE }, true);

    // Sloped plate pauldrons over the shoulders, and vambraces over the forearms
    m.part('armor', [0, 1.5, 0]);
    for (const sx of [-1, 1] as const) {
      const a = armJoints(sx, build);
      pauldron(m, sx, a.shoulder, { plate: mulC(PLATE, 0.94), rim: PLATE_EDGE, lames: [PLATE, mulC(PLATE, 0.82)] }, 1.15);
      frustum(m, [a.elbow[0], a.elbow[1] - 0.04, a.elbow[2] + 0.02], [a.wrist[0], a.wrist[1] + 0.03, a.wrist[2] - 0.01], 0.056, 0.05, 6, PLATE);
    }
    // A smooth scalp under the hair (built last)
    spikyScalp(m, HAIR);
    return label;
  },
};

export default design;
