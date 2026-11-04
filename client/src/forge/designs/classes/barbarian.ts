// Model for Barbarian (data/units/classes.ts › barbarian). Holds the member's weapon (src/forge/equip.ts): a two-hander
// rests on his right shoulder.
// A little taller than the Knight and Rogue, broad-shouldered, with thick bare arms; a dark brown leather
// chestpiece and sloped brown leather pauldrons (the Knight's shape, a little bigger), dark khaki trousers, thick boots in the chestpiece's leather; dark brown hair in a ponytail.
import type { Design } from '../../core/types';
import { mulC, type RGB } from '../../core/vec';
import { CHARACTER_HEIGHT } from '../../core/stage-config';
import { TORSO, armJoints, buildBody, classEntry, classHold, leatherChestpiece, pauldron, ponytailHair, type BodyBuild } from '../_character';

const LEATHER: RGB = [53, 36, 24];
const STRAP: RGB = [35, 24, 19];
const SKIN: RGB = [206, 158, 120];

// A carried two-hander rests a little higher, on his bigger pauldrons rather than through them
const BUILD: BodyBuild = { shoulderX: 0.27, arms: 1.2, boots: 1.32, carryLift: 0.035 };

const { id, label, source } = classEntry('barbarian');

const design: Design = {
  id, label, source,
  category: 'character',
  fit: { kind: 'standing', height: CHARACTER_HEIGHT * 1.06, maxRadius: 0.6 }, // slightly taller
  budget: 1200,
  build(c) {
    const m = c.mesh;
    const build: BodyBuild = { ...BUILD, hold: classHold(c, 'barbarian') };
    buildBody(m, {
      skin: SKIN,
      pants: [140, 124, 92], // dark khaki
      boots: LEATHER, // the chestpiece's dark brown
      sleeves: SKIN, // bare arms
      gloves: STRAP, // leather hand wraps
    }, build);
    ponytailHair(m, [71, 48, 30], STRAP);

    // Chestpiece: heavy dark leather, with a wide belt and an iron buckle
    leatherChestpiece(m, { leather: LEATHER, strap: STRAP, buckle: [150, 146, 136] });

    // Sloped brown leather pauldrons, the Knight's shape a little bigger (his broader build), in the chestpiece's leather with a darker rim, the lames close together
    m.part('armor', [0, TORSO.shoulder, 0]);
    for (const sx of [-1, 1] as const)
      pauldron(m, sx, armJoints(sx, build).shoulder, { plate: LEATHER, rim: STRAP, lames: [mulC(LEATHER, 1.06), mulC(LEATHER, 0.87)] }, 1.12, 0.6);
    return label;
  },
};

export default design;
