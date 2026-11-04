// Model for Ardas (data/world/npcs.ts › ardas), an old sage of the Sanctum (a quest-giver, later). The class
// characters' body (buildBody) robed like the Arcanist (casterRobe), but his dark blue robe is worn open in front over
// a brown shirt and dark gray trousers, edged in gray, its hood hanging down his back; black boots. Dark brown skin,
// bald, a long gray beard falling over his chest. He holds a gnarled wooden staff as the Arcanist and Acolyte
// hold theirs (the staff hold: planted like a walking stick), a smooth oval bright blue gem on its top, glowing.
// One person, so one look: everything here is fixed (no seeded variety beyond the beard's and staff's faceting).
import type { Design } from '../../core/types';
import { blob, frustum, loft } from '../../core/primitives';
import { add, mul, norm, sub, type RGB, type Vec3 } from '../../core/vec';
import { CHARACTER_HEIGHT } from '../../core/stage-config';
import { ell } from '../_armor';
import { HEAD, armJoints, casterRobe, type BodyBuild } from '../_character';
import { gnarledStaff } from '../_staff';

const SKIN: RGB = [84, 55, 38]; // dark brown
const BEARD: RGB = [170, 170, 174]; // gray: his only hair (he is bald)
const ROBE: RGB = [35, 41, 76]; // dark blue, a little muted
const TRIM: RGB = [140, 140, 146]; // gray
const SHIRT: RGB = [96, 64, 40]; // brown
const PANTS: RGB = [58, 58, 62]; // dark gray
const BOOTS: RGB = [24, 22, 24]; // black
const LINING: RGB = [16, 18, 36]; // the hood's inside
const BARK: RGB = [90, 64, 42];
const GEM: RGB = [86, 146, 255]; // a bright blue
const GEM_HALO: RGB = [20, 60, 255]; // a pure, rich blue

/** The height of the staff's top (local units), under its gem, and of the gem's top: above his head. */
const STAFF_TOP = 1.72;
const GEM_TOP = STAFF_TOP + 0.08 + 0.062;
/**
 * His height (the top of his head) as the other characters are fit to it (CHARACTER_HEIGHT): the staff rising above
 * it, the model is fit to the gem's top, scaled up to match, so he stands as tall as they do.
 */
const HEIGHT = CHARACTER_HEIGHT * (GEM_TOP / (HEAD.center[1] + HEAD.ry));

const design: Design = {
  id: 'npc.ardas',
  source: { table: 'npcs', key: 'ardas' }, // data/world/npcs.ts › ardas
  category: 'npc',
  label: 'Ardas',
  fit: { kind: 'standing', height: HEIGHT, maxRadius: 0.54 },
  budget: 1600,
  build(c) {
    const m = c.mesh;
    const build: BodyBuild = { hold: 'staff' };
    casterRobe(m, c.rf, {
      skin: SKIN, hair: BEARD, robe: ROBE, trim: TRIM, sash: ROBE, pants: PANTS, boots: BOOTS, lining: LINING,
      drawHair: () => {}, // bald
      open: { shirt: SHIRT },
    }, build);

    // A long beard: full and wide over the jaw and chin, falling in a tapering point over his chest
    const { center: h, rx, ry, rz } = HEAD;
    m.part('beard', h);
    blob(m, add(h, [0, -ry * 0.6, rz * 0.3]), [rx * 1.22, ry * 0.52, rz * 0.86], 1, 0.04, BEARD);
    const fall: [y: number, rx: number, rz: number, z: number][] = [
      [h[1] - ry * 0.85, 0.11, 0.062, 0.075], [1.42, 0.09, 0.05, 0.12], [1.3, 0.055, 0.035, 0.138], [1.2, 0.03, 0.022, 0.142],
    ];
    loft(m, fall.map(([y, wx, wz, z]) => ell(y, wx, wz, 8, 0, z)), BEARD, { j: 0.1 });
    const tip: Vec3 = [0, 1.13, 0.14];
    const last = ell(1.2, 0.03, 0.022, 8, 0, 0.142);
    for (let i = 0; i < 8; i++) m.tri(tip, last[i], last[(i + 1) % 8], BEARD, [0, 1.25, 0.12]);

    // The staff, through his right fist and planted on the ground (the staff hold's walking stick: upright, its top
    // leaning a little back)
    m.part('staff');
    const fist = armJoints(-1, build).fist;
    const axis = norm([0, 1, -0.06]);
    const base = sub(fist, mul(axis, fist[1] / axis[1]));
    const top = add(base, mul(axis, STAFF_TOP / axis[1]));
    gnarledStaff(m, c.rf, base, top, BARK, false); // smooth: no knots
    // Three short twigs curling up around the gem's foot
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      frustum(m, add(top, [0, -0.02, 0]), add(top, [Math.cos(a) * 0.04, 0.06, Math.sin(a) * 0.04]), 0.014, 0.006, 4, BARK);
    }
    // The gem: a smooth oval (unlit and unjittered, so no facets show), standing upright, with a blue halo
    const gem = add(top, [0, 0.08, 0]);
    blob(m, gem, [0.04, 0.062, 0.038], 1, 0, GEM, { e: 1, j: 0 });
    m.halo(gem, 0.22, GEM_HALO);
    return 'Ardas';
  },
};

export default design;
