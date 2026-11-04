// Model for Lynn (data/world/npcs.ts › lynn), the Sanctum's enchanter. The class characters' body (buildBody) in
// its female figure (narrower shoulders, thinner arms, a softer jaw), standing as Denisel does, holding nothing: both
// arms hang loosely at her sides. A near-black blouse with a waist and a bosom, trimmed in ice blue at the neck and cuffs, a
// dark teal skirt to her ankles with an ice blue band along its hem, and small black boots (a female figure's, as are
// her thinner legs). Fair skin. Very dark brown hair pulled back in a ponytail, held by a large ice blue cuff.
// One person, so one look: everything here is fixed.
import type { Design } from '../../core/types';
import type { RGB } from '../../core/vec';
import { CHARACTER_HEIGHT } from '../../core/stage-config';
import { blouse, buildBody, ponytailHair, skirt, type BodyBuild } from '../_character';

const SKIN: RGB = [222, 182, 152]; // fair
const SHIRT: RGB = [28, 26, 32]; // near-black
const SKIRT: RGB = [19, 78, 94]; // dark teal, #134E5E
const ICE: RGB = [137, 199, 211]; // ice blue, #89C7D3: the blouse's and skirt's trim, and the hair's cuff
const BOOTS: RGB = [24, 22, 26]; // black
const HAIR: RGB = [40, 25, 16]; // very dark brown

const design: Design = {
  id: 'npc.lynn',
  source: { table: 'npcs', key: 'lynn' }, // data/world/npcs.ts › lynn
  category: 'npc',
  label: 'Lynn',
  fit: { kind: 'standing', height: CHARACTER_HEIGHT, maxRadius: 0.54 },
  budget: 1500,
  build(c) {
    const m = c.mesh;
    const build: BodyBuild = { figure: 'female', restArms: true };
    // Under the skirt: the body's trousers are her skin
    buildBody(m, { skin: SKIN, pants: SKIN, boots: BOOTS, sleeves: SHIRT, gloves: SKIN }, build);
    blouse(m, SHIRT, build, ICE);
    skirt(m, { cloth: SKIRT, trim: ICE });
    ponytailHair(m, HAIR, ICE, 1.6); // a large cuff, so it shows from the game's view
    return 'Lynn';
  },
};

export default design;
