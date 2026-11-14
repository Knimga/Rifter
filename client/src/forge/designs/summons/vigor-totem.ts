import type { Design } from '../../core/types';
import { blob, box, frustum, loft } from '../../core/primitives';
import { hslRGB, mixC, mulC, rotX, rotY, rotZ, type RGB, type Vec3 } from '../../core/vec';

// Identity: the Primalist's Vigor Totem, a small, squat wooden post about knee-high on a character, standing in a
// little mound of earth. Gray-brown weathered wood, carved with a few simple marks in dark green: two bands, a face
// on the front (slit eyes and a mouth) and chevrons on the back. At its top two wooden flanges stick out to either
// side, swept a little upward, as on a totem pole. It never stands quite straight: each seed leans it a few degrees
// in its own direction. It faces south-southwest, give or take a few degrees. Seeds vary the wood's shade, the lean,
// the facing and the post's girth.
const GREEN: RGB = [38, 84, 44];
const EARTH: RGB = [34, 27, 22];

/** The post's height (model units, before the fit scales it to knee height). */
const H = 1;

const design: Design = {
  id: 'summon.vigor-totem',
  source: { table: 'summons', key: 'vigor-totem' }, // data/units/summons.ts › vigor-totem
  category: 'summon',
  label: 'Vigor Totem',
  fit: { kind: 'standing', height: 0.38, maxRadius: 0.3 }, // knee-high on a character (CHARACTER_HEIGHT 1.12)
  budget: 400,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    const wood = hslRGB(ri(24, 30), rf(17, 22), rf(24, 28)); // brownish gray-brown, kept dim
    const woodTop = mixC(wood, [150, 140, 125], 0.12);
    const shade = mulC(wood, 0.78);
    const grain = (_c: Vec3, n: Vec3): RGB => (n[1] > 0.5 ? woodTop : n[1] < -0.5 ? shade : wood);
    const R = 0.22 * rf(0.94, 1.06); // girth

    m.anchor('feet', [0, 0, 0]);

    // A low mound of earth it is planted in (stays level: only the post leans)
    m.part('base');
    blob(m, [0, 0, 0], [R * 1.7, 0.09, R * 1.7], 0, 0.18, EARTH, { floorY: 0 });

    const start = m.faces.length;
    m.part('totem', [0, 0, 0]);

    // The post: an octagonal column, a little wider at the foot, bevelled in at its top
    const ring = (y: number, r: number): Vec3[] =>
      Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        return [Math.cos(a) * r, y, Math.sin(a) * r] as Vec3;
      });
    const PROFILE: [number, number][] = [[-0.06, 1.08], [0.3, 1], [H - 0.06, 0.97], [H, 0.8]]; // (y, radius × R)
    loft(m, PROFILE.map(([y, k]) => ring(y, R * k)), grain);
    /** The post's radius at a height (between its profile's rings). */
    const radiusAt = (y: number) => {
      for (let i = 0; i < PROFILE.length - 1; i++) {
        const [y0, k0] = PROFILE[i], [y1, k1] = PROFILE[i + 1];
        if (y <= y1) return R * (k0 + ((y - y0) / (y1 - y0)) * (k1 - k0));
      }
      return R * PROFILE[PROFILE.length - 1][1];
    };

    // Carved marks in dark green, laid proud of the surface (simple and bold: the totem is small on screen):
    // two bands, octagons hugging the post
    for (const y of [0.17, 0.75]) loft(m, [ring(y - 0.035, radiusAt(y - 0.035) * 1.06), ring(y + 0.035, radiusAt(y + 0.035) * 1.06)], GREEN, { caps: false, j: 0.08 });
    // ... a face on the front: slanted slit eyes and a wide mouth with a fang down its middle
    const fz = R * 0.94; // the front face's flat (the octagon's apothem), plus a hair
    for (const sx of [-1, 1]) {
      const from = m.faces.length;
      box(m, [0, 0, 0], [0.11, 0.042, 0.05], GREEN, 0, { j: 0.08 });
      m.xf(from, (p) => { const q = rotZ(p, sx * 0.3); return [q[0] + sx * 0.08, q[1] + 0.59, q[2] + fz]; });
    }
    box(m, [0, 0.44, fz], [0.2, 0.045, 0.05], GREEN, 0, { j: 0.08 });
    box(m, [0, 0.39, fz], [0.045, 0.09, 0.05], GREEN, 0, { j: 0.08 });
    // ... and chevrons down the back
    const chevrons = ri(2, 3);
    for (let k = 0; k < chevrons; k++) {
      const y = 0.62 - k * 0.14;
      for (const sx of [-1, 1]) {
        const from = m.faces.length;
        box(m, [0, 0, 0], [0.12, 0.042, 0.05], GREEN, 0, { j: 0.08 });
        m.xf(from, (p) => { const q = rotZ(p, -sx * 0.55); return [q[0] + sx * 0.04, q[1] + y, q[2] - fz]; });
      }
    }

    // Two wooden flanges near the top, out to either side (sideways, never toward the camera), swept a little up:
    // thick at the post, tapering to a thinner, shallower tip
    const rect = (x: number, y0: number, y1: number, t: number): Vec3[] => [[x, y0, -t], [x, y0, t], [x, y1, t], [x, y1, -t]];
    for (const sx of [-1, 1]) {
      loft(m, [
        rect(sx * R * 0.7, 0.66, 0.88, 0.07),
        rect(sx * (R + 0.14), 0.72, 0.9, 0.06),
        rect(sx * (R + 0.26), 0.82, 0.94, 0.04),
      ], grain);
      frustum(m, [sx * (R + 0.08), 0.79, 0.062], [sx * (R + 0.08), 0.79, 0.075], 0.03, 0.03, 4, GREEN, { j: 0.08 }); // a dot carved on its face
    }

    // Facing: south-southwest (turned from south, +z, toward west, -x), give or take a few degrees per seed
    const DEG = Math.PI / 180;
    const facing = (-22.5 + rf(-8, 8)) * DEG;
    // The lean: a few degrees off upright, in a seeded direction (never quite straight)
    const tilt = rf(4, 10) * DEG, dir = rf(0, Math.PI * 2);
    m.xf(start, (p) => {
      const tz = Math.cos(dir) * tilt, tx = Math.sin(dir) * tilt;
      return rotZ(rotX(rotY(p, facing), tz), tx);
    });

    return 'Vigor Totem';
  },
};

export default design;
