// Model for Ileena (data/world/npcs.ts › ileena), an arcanist. The class characters' body (buildBody) in its female
// figure, as Lynn's, standing with both arms at her sides, robed like the Arcanist (casterRobe): a black robe trimmed
// in purple, worn open in front over a gray shirt and the gray dress beneath it (the robe shaped over her bust, as
// Lynn's blouse is), its hood down her back; black boots. The Knight's skin; red hair in a short bob framing her face, its
// two points curving in over her cheeks.
// One person, so one look: everything here is fixed.
import type { Design } from '../../core/types';
import type { RGB } from '../../core/vec';
import { CHARACTER_HEIGHT } from '../../core/stage-config';
import { bobHair, casterRobe, type BodyBuild } from '../_character';

const SKIN: RGB = [222, 180, 148]; // the Knight's
const ROBE: RGB = [22, 20, 26]; // black
const TRIM: RGB = [118, 62, 168]; // purple
const GRAY: RGB = [104, 104, 110]; // her shirt and dress
const BOOTS: RGB = [20, 18, 20]; // black
const LINING: RGB = [34, 18, 46]; // the hood's inside, a dark purple
const HAIR: RGB = [168, 72, 34]; // a natural red: orange-red

const design: Design = {
  id: 'npc.ileena',
  source: { table: 'npcs', key: 'ileena' }, // data/world/npcs.ts › ileena
  category: 'npc',
  label: 'Ileena',
  fit: { kind: 'standing', height: CHARACTER_HEIGHT, maxRadius: 0.54 },
  budget: 1700,
  build(c) {
    const build: BodyBuild = { figure: 'female', restArms: true };
    // Under the open robe: the gray shirt above the hips, the gray dress below
    casterRobe(c.mesh, c.rf, {
      skin: SKIN, hair: HAIR, robe: ROBE, trim: TRIM, sash: ROBE, pants: GRAY, boots: BOOTS, lining: LINING,
      drawHair: (m) => bobHair(m, HAIR),
      open: { shirt: GRAY },
    }, build);
    return 'Ileena';
  },
};

export default design;
