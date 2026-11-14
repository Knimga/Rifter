// Model for Serivae (data/world/npcs.ts › serivae), a priestess. The class characters' body (buildBody) in its female
// figure, as Lynn's and Ileena's, standing with both arms at her sides, holding nothing, robed like the Acolyte
// (casterRobe): an off-white robe edged in orange, worn open in front over a pale yellow shirt and the pale yellow dress
// beneath it (the robe shaped over her bust, as Ileena's is), its hood up over her head (hiding her hair), lined in deep
// orange, its lip orange, over a pale yellow cowl at her neck. Small light brown boots; the Knight's skin.
// One person, so one look: everything here is fixed.
import type { Design } from '../../core/types';
import type { RGB } from '../../core/vec';
import { CHARACTER_HEIGHT } from '../../core/stage-config';
import { casterRobe, type BodyBuild } from '../_character';

const SKIN: RGB = [222, 180, 148]; // the Knight's
const ROBE: RGB = [228, 222, 206]; // off-white: the robe and its hood
const YELLOW: RGB = [232, 206, 112]; // pale yellow: her shirt, dress and the cowl at her neck
const ORANGE: RGB = [226, 108, 24]; // the accents: the robe's edging and the hood's lip
const LINING: RGB = [92, 36, 10]; // the hood's inside, a deep orange
const BOOTS: RGB = [96, 70, 48]; // light brown

const design: Design = {
  id: 'npc.serivae',
  source: { table: 'npcs', key: 'serivae' }, // data/world/npcs.ts › serivae
  category: 'npc',
  label: 'Serivae',
  fit: { kind: 'standing', height: CHARACTER_HEIGHT, maxRadius: 0.54 },
  budget: 1700,
  build(c) {
    const build: BodyBuild = { figure: 'female', restArms: true };
    casterRobe(c.mesh, c.rf, {
      skin: SKIN, hair: ROBE, robe: ROBE, trim: ORANGE, sash: ORANGE, pants: YELLOW, boots: BOOTS, lining: LINING,
      open: { shirt: YELLOW },
      hoodUp: true,
      cowl: YELLOW,
    }, build);
    return 'Serivae';
  },
};

export default design;
