import type { Design } from '../../core/types';
import type { ColorFn } from '../../core/mesh';
import { bipyr, blob, box, frustum, loft, tube } from '../../core/primitives';
import { add, cross, dot, mul, mulC, norm, sub, type RGB, type Vec3 } from '../../core/vec';
import { band, ell } from '../_armor';
import { swordBlade, swordGrip, swordGuard } from '../_sword';

// Identity: a skeleton in fine heavy plate, near-black with purple and dark teal accents, its skull bare under a
// circlet, ice-blue eyes glowing. Caught mid-stride (left foot forward, knees bent), dragging a big claymore behind
// its right hand, the blade trailing straight back with its tip on the floor. Seeds vary the bone's shade, the
// pauldrons' size, the circlet (plain or spiked) and the claymore's guard.
const PLATE: RGB = [30, 30, 38];
const PLATE_TOP: RGB = [58, 55, 70]; // tops catch the light, so the outline separates from the floor
const PLATE_DEEP: RGB = [18, 18, 24];
const PURPLE: RGB = [94, 50, 128];
const TEAL: RGB = [24, 92, 98];
const SOCKET: RGB = [16, 14, 20];
const EYE: RGB = [130, 215, 255];
const EYE_HALO: RGB = [205, 242, 255]; // hotter than the eye, so it blooms onto the dark around it
const ICE_LINE: RGB = [120, 205, 245];

/** Near-black plate, shaded by the face's normal: lighter on top, deeper underneath. */
const plate: ColorFn = (_c, n) => (n[1] > 0.5 ? PLATE_TOP : n[1] < -0.35 ? PLATE_DEEP : PLATE);

const design: Design = {
  id: 'creature.wight',
  source: { table: 'enemies', key: 'wight' }, // data/units/enemies.ts › wight
  category: 'creature',
  label: 'Wight',
  fit: { kind: 'standing', height: 1.2, maxRadius: 0.6 },
  budget: 1500,
  build(c) {
    const m = c.mesh;
    const { rf } = c;
    const bone = mulC([200, 193, 174], rf(0.92, 1.04));
    const boneDark = mulC(bone, 0.6);
    const pauldron = rf(0.95, 1.12);
    const spiked = c.chance(0.5);
    m.anchor('feet', [0, 0, -0.03]); // between the stride's feet: this point goes to the tile center

    /** The body leans a little forward as it rises (walking, hauling the blade). */
    const lean = (y: number) => Math.max(0, y - 0.9) * 0.1;

    // Legs: mid-stride, the left (+x) forward and the right back on its toes, both knees bent. Bare femurs show
    // between the cuisse and the knee cop; greaves and sabatons below.
    const legs: { sx: number; hip: Vec3; knee: Vec3; ankle: Vec3; toe: Vec3 }[] = [
      { sx: 1, hip: [0.13, 0.9, 0.03], knee: [0.15, 0.52, 0.27], ankle: [0.15, 0.12, 0.15], toe: [0.15, 0.05, 0.35] },
      { sx: -1, hip: [-0.13, 0.9, -0.03], knee: [-0.15, 0.5, -0.01], ankle: [-0.16, 0.2, -0.36], toe: [-0.16, 0.04, -0.19] },
    ];
    for (const { sx, hip, knee, ankle, toe } of legs) {
      m.part(sx > 0 ? 'leg_l' : 'leg_r', hip);
      frustum(m, hip, knee, 0.034, 0.03, 5, bone); // femur
      frustum(m, hip, add(hip, mul(sub(knee, hip), 0.55)), 0.085, 0.07, 6, plate); // cuisse
      blob(m, add(knee, [0, 0, 0.025]), [0.065, 0.06, 0.06], 0, 0.12, PURPLE); // knee cop
      frustum(m, knee, ankle, 0.062, 0.048, 6, plate, { caps: false }); // greave
      frustum(m, ankle, toe, 0.055, 0.04, 4, plate); // sabaton
    }

    // Torso: a shaped breastplate swelling at the chest, a purple belt, overlapping faulds flaring over the hips
    // with a purple edge, a teal ridge down the front and a gorget at the neck
    m.part('torso', [0, 1.0, 0]);
    const chest: [number, number, number, number][] = [ // y, rx, rz, forward swell
      [1.04, 0.17, 0.13, 0], [1.2, 0.19, 0.14, 0.01], [1.44, 0.29, 0.2, 0.04], [1.62, 0.31, 0.18, 0.02], [1.75, 0.18, 0.12, 0],
    ];
    loft(m, chest.map(([y, rx, rz, f]) => ell(y, rx, rz, 10, 0, lean(y) + f)), plate, { bandCenters: true, j: 0.12 });
    tube(m, chest.slice(0, 4).map(([y, , rz, f]): Vec3 => [0, y, lean(y) + f + rz]), 0.02, 0.016, 3, TEAL, { caps: false });
    band(m, 1.0, 1.09, 0.185, 0.145, 0.185, 0.145, PURPLE); // belt
    box(m, [0, 1.045, 0.155], [0.07, 0.07, 0.03], TEAL, 0.05); // its buckle
    loft(m, [ell(1.02, 0.2, 0.15, 10), ell(0.9, 0.25, 0.19, 10)], plate, { caps: false });
    loft(m, [ell(0.92, 0.25, 0.19, 10, 0, 0.01), ell(0.8, 0.28, 0.22, 10, 0, 0.01)], (cen, n) => (cen[1] < 0.84 ? PURPLE : plate(cen, n)), { caps: false });
    // A purple tabard hanging in front between the legs, its end torn
    box(m, [0, 0.72, 0.21], [0.15, 0.3, 0.02], PURPLE, 0.1);
    box(m, [0.035, 0.53, 0.215], [0.07, 0.1, 0.02], mulC(PURPLE, 0.8), 0.25);
    band(m, 1.74, 1.82, 0.14, 0.11, 0.11, 0.09, PURPLE); // gorget rim
    loft(m, [ell(1.7, 0.16, 0.12, 8, 0, lean(1.7)), ell(1.8, 0.12, 0.09, 8, 0, lean(1.8))], plate); // gorget

    // Skull, bare, pushed forward on its neck: a heavy brow over deep sockets, ice-blue eyes with a glow around them
    m.part('head', [0, 1.82, 0.08]);
    frustum(m, [0, 1.78, 0.06], [0, 1.9, 0.09], 0.035, 0.03, 5, boneDark); // neck
    const H: Vec3 = [0, 1.99, 0.12];
    blob(m, H, [0.155, 0.175, 0.165], 1, 0.05, bone);
    box(m, add(H, [0, -0.15, 0.06]), [0.17, 0.08, 0.13], bone, 0.12); // jaw
    box(m, add(H, [0, 0.045, 0.135]), [0.2, 0.035, 0.05], mulC(bone, 0.85), 0.1); // brow
    for (const sx of [-1, 1]) {
      const eye = add(H, [sx * 0.065, -0.005, 0.15]);
      blob(m, eye, [0.05, 0.042, 0.03], 0, 0.05, SOCKET);
      blob(m, add(eye, [0, 0, 0.022]), [0.026, 0.02, 0.012], 0, 0.05, EYE, { e: 1 });
      m.halo(add(eye, [0, 0, 0.03]), 0.11, EYE_HALO);
    }
    // Circlet: a near-black band around the crown, purple-rimmed, a teal stone at the brow; spiked on some
    loft(m, [ell(H[1] + 0.085, 0.152, 0.162, 10, 0, H[2]), ell(H[1] + 0.1, 0.148, 0.158, 10, 0, H[2])], PURPLE, { caps: false });
    loft(m, [ell(H[1] + 0.1, 0.148, 0.158, 10, 0, H[2]), ell(H[1] + 0.13, 0.13, 0.14, 10, 0, H[2])], plate, { caps: false });
    bipyr(m, add(H, [0, 0.11, 0.175]), 0.022, 0.03, 4, TEAL);
    if (spiked)
      for (let i = -2; i <= 2; i++) {
        const a = i * 0.45, base: Vec3 = add(H, [Math.sin(a) * 0.16, 0.12, Math.cos(a) * 0.17]);
        frustum(m, base, add(base, [Math.sin(a) * 0.02, i === 0 ? 0.11 : 0.075, Math.cos(a) * 0.02]), 0.022, 0.003, 4, plate);
      }

    // Arms: bare bone from the shoulder to the elbow, under layered pauldrons; plate couters, vambraces and
    // gauntlets. The left swings forward with the stride; the right hangs low behind, hauling the claymore.
    const handR: Vec3 = [-0.43, 0.98, -0.06];
    for (const sx of [-1, 1]) {
      const sh: Vec3 = [sx * 0.34, 1.68, lean(1.68)];
      const elbow: Vec3 = sx > 0 ? [0.39, 1.37, 0.1] : [-0.4, 1.34, -0.04];
      const hand: Vec3 = sx > 0 ? [0.37, 1.1, 0.24] : handR;
      m.part(sx > 0 ? 'arm_l' : 'arm_r', sh);
      frustum(m, sh, elbow, 0.03, 0.026, 5, bone); // humerus
      blob(m, elbow, [0.058, 0.058, 0.058], 0, 0.12, plate); // couter
      frustum(m, elbow, hand, 0.05, 0.044, 6, plate, { caps: false }); // vambrace
      const cuff = add(elbow, mul(sub(hand, elbow), 0.8));
      frustum(m, cuff, add(cuff, mul(sub(hand, elbow), 0.12)), 0.056, 0.056, 6, PURPLE, { caps: false });
      blob(m, hand, [0.06, 0.055, 0.06], 0, 0.15, plate); // gauntlet
      m.anchor(sx > 0 ? 'hand_l' : 'hand_r', hand);

      // Pauldron: a big domed plate over the shoulder with two lames below it, teal-rimmed, reaching out sideways
      // (width reads at full size under the camera)
      m.part(sx > 0 ? 'pauldron_l' : 'pauldron_r', sh);
      const k = pauldron;
      const top: Vec3 = [sx * 0.36, 1.76, lean(1.76)];
      blob(m, top, [0.16 * k, 0.1 * k, 0.16 * k], 1, 0.06, plate);
      blob(m, add(top, [0, -0.045 * k, 0]), [0.168 * k, 0.03 * k, 0.168 * k], 0, 0.04, TEAL);
      for (let l = 1; l <= 2; l++)
        blob(m, add(top, [sx * 0.03 * l * k, -0.07 * l * k, 0]), [0.14 * k - l * 0.012, 0.045 * k, 0.15 * k - l * 0.012], 0, 0.06, l === 2 ? PURPLE : plate);
    }

    // Claymore: the sword family's blade, guard and grip, near-black with a purple guard, a teal grip and a teal
    // stone, a thin ice-blue line glowing up the middle of each flat. Gripped in the right fist near the guard, the
    // blade trails straight back behind it (as asked, though the Camera rules favor sideways), its edges up and down,
    // with its tip dragging on the floor.
    m.part('weapon');
    const s0 = m.faces.length;
    const L = rf(3.5, 3.8), w = 0.31, t = 0.07, gy = -0.04, gl = 0.85;
    swordBlade(m, L, w, t, [50, 52, 64]); // a shade above the plate, so the blade separates from a dark floor
    for (const sz of [-1, 1]) box(m, [0, L * 0.46, sz * (t * 1.25 + 0.005)], [0.06, L * 0.72, 0.01], ICE_LINE, 0, { e: 1 }); // over the fuller
    swordGuard(m, c.pick(['bar', 'wing', 'hook'] as const), 0.63, gy, PURPLE);
    swordGrip(m, gy, gl, 3, TEAL, PURPLE);
    bipyr(m, [0, gy, 0.11], 0.05, 0.06, 4, TEAL);
    const g0: Vec3 = [0, gy - 0.12, 0]; // where the fist closes, just below the guard
    const tip: Vec3 = [-0.45, 0.01, -0.82];
    const Y = norm(sub(tip, handR));
    const s = Math.hypot(...sub(tip, handR)) / (L - g0[1]);
    const X = norm(sub([0, 1, 0], mul(Y, dot([0, 1, 0], Y)))); // the edges up and down, the flats facing sideways
    const Z = cross(X, Y);
    m.xf(s0, (p) => {
      const q = sub(p, g0);
      return add(handR, mul(add(add(mul(X, q[0]), mul(Y, q[1])), mul(Z, q[2])), s));
    });
    m.anchor('weapon_tip', tip);

    return spiked ? 'Crowned Wight' : 'Wight';
  },
};
export default design;
