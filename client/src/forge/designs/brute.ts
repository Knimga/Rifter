// Model for Brute (data/units/classes.ts › brute). Holds the member's weapon (src/forge/equip.ts): a two-hander
// rests on his right shoulder.
// A little taller than the Knight and Rogue, broad-shouldered, with thick bare arms; a dark brown leather
// chestpiece and brown leather pauldrons, beige trousers, thick brown boots; brown hair in a ponytail.
import type { Design } from '../core/types';
import { blob, box, loft } from '../core/primitives';
import { mulC, type RGB } from '../core/vec';
import { CHARACTER_HEIGHT } from '../core/stage-config';
import { band, ell } from './_armor';
import { TORSO, armJoints, buildBody, classEntry, classHold, ponytailHair, type BodyBuild } from './_character';

const LEATHER: RGB = [74, 50, 34];
const PAULDRON: RGB = [112, 76, 50];
const STRAP: RGB = [48, 34, 26];
const SKIN: RGB = [206, 158, 120];

const BUILD: BodyBuild = { shoulderX: 0.27, arms: 1.2, boots: 1.32 };

const { id, label, source } = classEntry('brute');

const design: Design = {
  id, label, source,
  category: 'character',
  fit: { kind: 'standing', height: CHARACTER_HEIGHT * 1.06, maxRadius: 0.6 }, // slightly taller
  budget: 1200,
  build(c) {
    const m = c.mesh;
    const build: BodyBuild = { ...BUILD, hold: classHold(c, 'brute') };
    buildBody(m, {
      skin: SKIN,
      pants: [186, 170, 138], // beige
      boots: [96, 66, 44], // brown
      sleeves: SKIN, // bare arms
      gloves: STRAP, // leather hand wraps
    }, build);
    ponytailHair(m, [98, 66, 42], STRAP);

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

    // Brown leather pauldrons capping the shoulders, each with a darker rim
    m.part('armor', [0, T.shoulder, 0]);
    for (const sx of [-1, 1] as const) {
      const sh = armJoints(sx, build).shoulder;
      blob(m, [sh[0] * 1.03, sh[1] + 0.035, 0], [0.1, 0.08, 0.115], 1, 0.03, PAULDRON, { floorY: sh[1] - 0.02 });
      blob(m, [sh[0] * 1.05, sh[1] - 0.012, 0], [0.098, 0.018, 0.112], 0, 0, STRAP); // rim
    }
    return label;
  },
};

export default design;
