// Model for Denisel (data/world/npcs.ts › denisel), the Sanctum's vendor. The class characters' body
// (buildBody) standing as the Knight and Rogue do, but holding nothing: both arms hang loosely at his sides.
// A dark slate blue-gray Chesterfield coat, a little below mid-thigh, worn open over a dark gray shirt, with black
// accents (lapels, collar, pocket flaps, the hem's and cuffs' edging); dark red trousers, black boots. Tanned
// skin. Thick black hair with spiky bangs (the Acolyte's cut, fuller and down the back of the neck), and a black
// chinstrap beard along the jaw.
// One person, so one look: everything here is fixed (no seeded variety beyond the hair's faceting).
import type { Design } from '../../core/types';
import { tube } from '../../core/primitives';
import { add, type RGB, type Vec3 } from '../../core/vec';
import { CHARACTER_HEIGHT } from '../../core/stage-config';
import { HEAD, buildBody, capWithBangs, chesterfieldCoat, type BodyBuild } from '../_character';

const SKIN: RGB = [198, 152, 118]; // a little darker than the Knight's
const COAT: RGB = [44, 52, 66]; // dark slate blue-gray
const TRIM: RGB = [18, 18, 22]; // black
const SHIRT: RGB = [84, 84, 86]; // dark gray
const PANTS: RGB = [104, 30, 32]; // dark red
const BOOTS: RGB = [26, 24, 26];
const HAIR: RGB = [24, 22, 26]; // black

/** The coat's hem: a little below mid-thigh (the default is 0.64). */
const HEM = 0.55;

const design: Design = {
  id: 'npc.denisel',
  source: { table: 'npcs', key: 'denisel' }, // data/world/npcs.ts › denisel
  category: 'npc',
  label: 'Denisel',
  fit: { kind: 'standing', height: CHARACTER_HEIGHT, maxRadius: 0.54 },
  budget: 1500,
  build(c) {
    const m = c.mesh;
    const build: BodyBuild = { restArms: true };
    buildBody(m, { skin: SKIN, pants: PANTS, boots: BOOTS, sleeves: COAT, gloves: SKIN }, build);
    chesterfieldCoat(m, { coat: COAT, trim: TRIM, shirt: SHIRT, pants: PANTS, hem: HEM }, build);
    capWithBangs(m, HAIR, c.rf, { volume: 1.12, nape: 0.8 });

    // A chinstrap beard: a band along the jaw from below one ear, under the chin, to below the other, standing just
    // off the face
    const { center: h, rx, ry } = HEAD;
    m.part('head', [0, h[1], 0]);
    const side = (sx: number): Vec3[] => [
      [sx * rx * 1.02, -ry * 0.25, -0.012], // below the ear
      [sx * rx * 0.9, -ry * 0.68, 0.046], // the jaw's corner
      [sx * rx * 0.44, -ry * 0.96, 0.088], // toward the chin
    ];
    const path = [...side(1), [0, -ry * 1.02, 0.098] as Vec3, ...side(-1).reverse()].map((p) => add(h, p));
    tube(m, path, 0.022, 0.022, 5, HAIR);
    return 'Denisel';
  },
};

export default design;
