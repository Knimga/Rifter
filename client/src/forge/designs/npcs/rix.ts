// Model for Rix (data/world/npcs.ts › rix). The class characters' body (buildBody), shorter and stouter than the other
// men: broad shoulders, thick arms and legs on a smaller frame. The Knight's short spiky hair, in brown; tawny skin. The
// Barbarian's heavy leather chestpiece and sloped leather pauldrons over a very dark green shirt (its sleeves on his
// arms), very dark green trousers and large brown boots. He holds his weapon (NpcData.holds: a plain mace) as a class
// holds its member's: posed for its hold (c.hold, from buildCharacter), the weapon's own model in his hand.
// One person, so one look: everything here is fixed (no seeded variety beyond the hair's faceting).
import type { Design } from '../../core/types';
import { mulC, type RGB } from '../../core/vec';
import { CHARACTER_HEIGHT } from '../../core/stage-config';
import { TORSO, armJoints, buildBody, leatherChestpiece, pauldron, spikyHair, spikyScalp, type BodyBuild, type Hold } from '../_character';

const SKIN: RGB = [178, 124, 80]; // tawny
const HAIR: RGB = [72, 50, 32]; // brown
const SHIRT: RGB = [26, 42, 30]; // very dark green
const PANTS: RGB = [24, 36, 28]; // very dark green
const BOOTS: RGB = [62, 44, 30]; // brown
const LEATHER: RGB = [53, 36, 24]; // the Barbarian's
const STRAP: RGB = [35, 24, 19];

/** Short and stout: broad shoulders, thick arms and legs, big boots (his height is his fit's). */
const BUILD: BodyBuild = { shoulderX: 0.26, arms: 1.18, legs: 1.22, boots: 1.4 };

const design: Design = {
  id: 'npc.rix',
  source: { table: 'npcs', key: 'rix' }, // data/world/npcs.ts › rix
  category: 'npc',
  label: 'Rix',
  fit: { kind: 'standing', height: CHARACTER_HEIGHT * 0.88, maxRadius: 0.54 }, // shorter than the other men
  budget: 1400,
  build(c) {
    const m = c.mesh;
    // Posed for what he holds (his mace: the one-handed hold), as buildCharacter builds him
    const build: BodyBuild = { ...BUILD, hold: (c.hold as Hold | undefined) ?? 'oneHand' };
    buildBody(m, { skin: SKIN, pants: PANTS, boots: BOOTS, sleeves: SHIRT, gloves: STRAP }, build);
    spikyHair(m, HAIR, c.rf);
    leatherChestpiece(m, { leather: LEATHER, strap: STRAP, buckle: [150, 146, 136] });
    // The Barbarian's sloped leather pauldrons
    m.part('armor', [0, TORSO.shoulder, 0]);
    for (const sx of [-1, 1] as const)
      pauldron(m, sx, armJoints(sx, build).shoulder, { plate: LEATHER, rim: STRAP, lames: [mulC(LEATHER, 1.06), mulC(LEATHER, 0.87)] }, 1.08, 0.6);
    spikyScalp(m, HAIR); // built last
    return 'Rix';
  },
};

export default design;
