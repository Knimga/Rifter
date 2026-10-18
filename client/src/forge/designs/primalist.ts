// Model for Primalist (data/classes.ts › primalist). Holds the member's weapon and shield
// (src/forge/equip.ts), the same way as the Knight: wand held forward in the right hand, shield strapped
// to the left forearm.
// Standard pose. Brown hardened-leather cuirass, a dark green capelet over the shoulders, dark green
// trousers, thick dark brown boots; dark brown hair in a ponytail, tawny skin.
import type { Design } from '../core/types';
import { blob, loft } from '../core/primitives';
import { mulC, type RGB, type Vec3 } from '../core/vec';
import { CHARACTER_HEIGHT } from '../core/stage-config';
import { ell } from '../designs/_armor';
import { TORSO, buildBody, classEntry, classHold, cuirass, ponytailHair, type BodyBuild } from '../designs/_character';

const LEATHER: RGB = [118, 80, 50];
const DARK_LEATHER: RGB = [70, 48, 34];
const GREEN: RGB = [40, 64, 44];
const BUILD: BodyBuild = { boots: 1.32 }; // thick boots, as the Brute's

const { id, label, source } = classEntry('primalist');

const design: Design = {
  id, label, source,
  category: 'character',
  fit: { kind: 'standing', height: CHARACTER_HEIGHT, maxRadius: 0.54 },
  budget: 1300,
  build(c) {
    const m = c.mesh;
    buildBody(m, {
      skin: [178, 124, 80], // tawny
      pants: [44, 62, 44], // dark green
      boots: [64, 44, 32], // dark brown
      sleeves: mulC(LEATHER, 0.8),
      gloves: DARK_LEATHER,
    }, { ...BUILD, hold: classHold(c, 'primalist') });
    ponytailHair(m, [62, 42, 30], DARK_LEATHER); // dark brown

    // Brown hardened-leather cuirass (no ridge), leather skirt and belt
    cuirass(m, { plate: LEATHER, edge: mulC(LEATHER, 1.2), faulds: mulC(LEATHER, 0.88), belt: DARK_LEATHER, buckle: [150, 146, 136] }, false);

    // Capelet: over the shoulders, gathered at the neck, hanging a little lower at the back; a clasp at the throat
    const T = TORSO;
    m.part('capelet', [0, T.collar, 0]);
    const N = 12;
    const backDrop = (ring: Vec3[], drop: number, rz: number): Vec3[] => ring.map(([x, y, z]) => [x, y - drop * Math.max(0, -z / rz), z]);
    loft(m, [
      backDrop(ell(T.shoulder - 0.13, 0.31, 0.17, N), 0.12, 0.17), // lower edge, longer behind
      ell(T.shoulder + 0.045, 0.3, 0.152, N), // over the shoulders
      ell(T.collar + 0.03, 0.135, 0.112, N), // gathered at the neck
      ell(T.collar + 0.075, 0.13, 0.108, N), // soft collar
    ], GREEN, { caps: false });
    blob(m, [0, T.collar + 0.02, 0.118], [0.022, 0.022, 0.012], 0, 0, [150, 120, 70]); // clasp
    return label;
  },
};

export default design;
