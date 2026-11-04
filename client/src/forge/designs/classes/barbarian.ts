// Model for Barbarian (data/units/classes.ts › barbarian). Holds the member's weapon (src/forge/equip.ts): a two-hander
// rests on his right shoulder.
// A little taller than the Knight and Rogue, broad-shouldered, with thick bare arms; a dark brown leather
// chestpiece and sloped brown leather pauldrons (the Knight's shape, a little bigger), dark khaki trousers, thick boots in the chestpiece's leather; dark brown hair in a ponytail.
import type { Design } from '../../core/types';
import { box, loft } from '../../core/primitives';
import { mulC, type RGB } from '../../core/vec';
import { CHARACTER_HEIGHT } from '../../core/stage-config';
import { band, ell } from '../_armor';
import { TORSO, armJoints, buildBody, classEntry, classHold, pauldron, ponytailHair, type BodyBuild } from '../_character';

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

    // Chestpiece: heavy dark leather, broad across the shoulders, narrowing to the waist and flaring
    // into a short hem over the tops of the thighs
    const T = TORSO;
    m.part('torso', [0, T.waist, 0]);
    loft(m, [
      ell(T.hip - 0.1, 0.235, 0.15), ell(T.hip + 0.02, 0.21, 0.136), ell(T.waist, 0.178, 0.112),
      ell(T.chest, 0.228, 0.136), ell(T.shoulder + 0.01, 0.288, 0.142), ell(T.collar, 0.16, 0.104),
    ], LEATHER);
    band(m, T.chest + 0.03, T.chest - 0.02, 0.23, 0.138, 0.229, 0.137, mulC(LEATHER, 1.25)); // stitched seam
    // Wide belt with an iron buckle
    band(m, T.hip + 0.07, T.hip, 0.212, 0.138, 0.214, 0.139, STRAP);
    box(m, [0, T.hip + 0.035, 0.138], [0.06, 0.05, 0.014], [150, 146, 136]);

    // Sloped brown leather pauldrons, the Knight's shape a little bigger (his broader build), in the chestpiece's leather with a darker rim, the lames close together
    m.part('armor', [0, T.shoulder, 0]);
    for (const sx of [-1, 1] as const)
      pauldron(m, sx, armJoints(sx, build).shoulder, { plate: LEATHER, rim: STRAP, lames: [mulC(LEATHER, 1.06), mulC(LEATHER, 0.87)] }, 1.12, 0.6);
    return label;
  },
};

export default design;
