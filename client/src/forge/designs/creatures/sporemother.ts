import type { Design } from '../../core/types';
import type { ColorFn } from '../../core/mesh';
import { bipyr, blob, box, fibSphere, frustum, loft, onEllipsoid, tendril, wobbleRing } from '../../core/primitives';
import { add, hslRGB, lerp3, mixC, mul, mulC, norm, type RGB, type Vec3 } from '../../core/vec';
import { antler, mush, shelf } from '../_fungal';

// Identity: a fungal hag, the Fungal Forest's boss. A squat, stout, hunched crone: a broad, heavy body under a
// dull, weathered mustard-yellow robe that pools on the floor, a bent back, her gnarled grey-green head
// thrust low and forward under long, stringy grey hair, a hooked nose, glowing amber eyes. She leans on
// a gnarled staff (in her right hand, planted out to the side) topped with Sporetender antlers, a glowing orange
// globule hanging on a cord just beneath them; her left hand reaches forward, clawed. Fungus infests her back and
// shoulders like the Mirehulk's (shelves, sprouting caps, pale dull yellow to orange), and a grander set of
// antlers is mounted on her back, charms dangling from their tines. A cowl of her robe rises behind her head and
// envelops the back of it. Orange motes drift around her.
// Seeds vary the robe's and skin's tones, her hair, the fungus, the antlers' tines, the charms and her build.
const BONE: RGB = [206, 196, 170];
const BARK: RGB = [62, 46, 34];
const HAIR: RGB[] = [[194, 192, 184], [170, 168, 162], [214, 210, 200]];
const GLOW: RGB = [255, 146, 46]; // her light: amber-orange (the globule, the antler tips, her eyes)
const MUSH_PALE: RGB = [196, 182, 118], MUSH_ORANGE: RGB = [204, 118, 52];
const CHARMS: RGB[] = [[150, 40, 34], [52, 104, 96], [196, 186, 160], [96, 70, 120]];

const design: Design = {
  id: 'creature.sporemother',
  source: { table: 'enemies', key: 'sporemother' }, // data/units/enemies.ts › BOSS_CLASSES › sporemother
  category: 'creature',
  label: 'Sporemother',
  // A boss, but squat: the staff's topper and the back antlers rise above her; she is broad (the staff out to the side)
  fit: { kind: 'standing', height: 1.3, maxRadius: 0.75 },
  budget: 3900, // a boss with a lot on her: two pairs of antlers, fungus, hair, a cowl, charms
  build(c) {
    const m = c.mesh;
    const { rf, ri, pick } = c;
    const robe = hslRGB(rf(42, 48), rf(38, 48), rf(36, 43)); // dull, weathered mustard yellow
    const grime = mixC(robe, [52, 44, 30], 0.55);
    const skin = hslRGB(rf(70, 95), rf(10, 18), rf(26, 32));
    const W = rf(1.0, 1.1); // build: her girth
    const capColor = () => mixC(MUSH_PALE, MUSH_ORANGE, rf(0, 1));
    m.anchor('feet', [0, 0, 0.06]); // the middle of her pooled robe: this point goes to the tile center

    // ─── Body: a robe pooling on the floor, broad and heavy, hunched forward ────────────────────────────
    // Weathered: grime toward the hem and in patches (a slow wave through space, so neighbouring faces agree)
    const phase: Vec3 = [rf(0, 6.28), rf(0, 6.28), rf(0, 6.28)];
    const robeColor: ColorFn = (cen) => {
      const patch = Math.sin(cen[0] * 9 + phase[0]) + Math.sin(cen[1] * 7 + phase[1]) + Math.sin(cen[2] * 8 + phase[2]);
      const hem = Math.max(0, 1 - cen[1] / 0.35);
      return mixC(robe, grime, Math.min(1, hem * 0.8 + (patch > 1.2 ? 0.45 : 0)));
    };
    m.part('torso', [0, 0.6, 0]);
    // Short and broad: flaring wide at the hem, the shoulders low and bent forward. Its profile, ring by ring from
    // the hem: height, half-width, half-depth, how far forward (the hunch), how much its edge wobbles
    const PROFILE: [number, number, number, number, number][] = [
      [0.01, 0.44, 0.4, 0.04, 0.12], [0.16, 0.4, 0.36, 0.05, 0.08], [0.36, 0.34, 0.3, 0.08, 0.06],
      [0.54, 0.35, 0.3, 0.14, 0.05], [0.66, 0.33, 0.26, 0.22, 0.05], [0.72, 0.15, 0.13, 0.3, 0.04],
    ];
    loft(m, PROFILE.map(([y, rx, rz, dz, jag]) => wobbleRing([0, y, dz], rx * W, rz * W, 12, jag, c.R)), robeColor, { j: 0.16 });
    /** The robe's outline at height y (between its rings): half-width, half-depth, and its center's forward offset. */
    const robeAt = (y: number) => {
      const i = Math.max(0, Math.min(PROFILE.length - 2, PROFILE.findIndex((p) => p[0] > y) - 1));
      const [y0, rx0, rz0, dz0] = PROFILE[i], [y1, rx1, rz1, dz1] = PROFILE[i + 1];
      const t = Math.max(0, Math.min(1, (y - y0) / (y1 - y0)));
      return { rx: (rx0 + (rx1 - rx0) * t) * W, rz: (rz0 + (rz1 - rz0) * t) * W, dz: dz0 + (dz1 - dz0) * t };
    };
    // Where things grow from her (the robe's surface, set `sink` into it so nothing floats over its wobble):
    /** A point on her back at height y, `x` to the side. */
    const onBack = (x: number, y: number, sink = 0.03): Vec3 => {
      const { rx, rz, dz } = robeAt(y), k = Math.sqrt(Math.max(0, 1 - (x / rx) ** 2));
      return [x, y, dz - rz * k + sink];
    };
    /** A point on top of her (the shoulders and upper back, the robe's top slope) at x, z. */
    const onTop = (x: number, z: number, sink = 0.03): Vec3 => {
      for (let y = 0.72; y > 0.3; y -= 0.01) {
        const { rx, rz, dz } = robeAt(y);
        if ((x / rx) ** 2 + ((z - dz) / rz) ** 2 <= 1) return [x, y - sink, z];
      }
      return [x, 0.3, z];
    };

    // ─── Head: thrust low and forward, gnarled; a hooked nose, a pointed chin, amber glints for eyes ─────
    m.part('head', [0, 0.72, 0.36]);
    const H: Vec3 = [0, 0.8, 0.5], HEAD_R: Vec3 = [0.13, 0.15, 0.13];
    blob(m, H, HEAD_R, 1, 0.16, skin, { j: 0.2 });
    box(m, [0, H[1] + 0.055, H[2] + 0.1], [0.19, 0.035, 0.05], mulC(skin, 0.8), 0.3); // heavy brow
    frustum(m, [0, H[1] + 0.01, H[2] + 0.12], [0, H[1] - 0.075, H[2] + 0.25], 0.032, 0.007, 4, mulC(skin, 0.9)); // hooked nose
    blob(m, [rf(-0.01, 0.01), H[1] - 0.13, H[2] + 0.09], [0.05, 0.05, 0.055], 0, 0.15, skin); // pointed chin
    for (const sx of [-1, 1]) {
      const eye: Vec3 = [sx * 0.05, H[1] + 0.02, H[2] + 0.115];
      // Fully glowing orange (no dark socket), with a strong halo a little hotter than the eye
      blob(m, eye, [0.028, 0.02, 0.016], 0, 0.05, GLOW, { e: 1, j: 0.03 });
      m.halo([eye[0], eye[1], eye[2] + 0.025], 0.08, mixC(GLOW, [255, 220, 150], 0.35));
    }
    // Long, stringy grey hair from the crown and the sides of her head, hanging down past her face and over her
    // shoulders (not from the back of her head: the cowl covers it)
    for (const d of fibSphere(ri(46, 50), rf(0, 6.28))) {
      if (d[1] < -0.1 || d[2] > 0.6 || d[2] < -0.15) continue; // not the face, not under the chin, not the back
      const root = onEllipsoid(H, HEAD_R, d, -0.01);
      // Straight down, close to her (a hair's breadth outward and back), lank and fine
      const out = norm([d[0], 0, d[2] - 0.3]);
      tendril(m, root, [out[0] * 0.1, -1, out[2] * 0.1 - 0.12], rf(0.34, 0.5), 3, rf(0.014, 0.019), pick(HAIR),
        { sides: 3, j: 0.2, bend: (t) => [out[0] * Math.sin(t * Math.PI) * 0.03, 0, out[2] * t * 0.03] });
    }

    // ─── The cowl: her robe rising behind her head, enveloping the back half of it ──────────────────────
    // A hood: a run of arches from the opening around her face back to her shoulders. The first is the opening, a
    // plain arch over the top of her head; each one behind it is lower and a little wider, so the hood slopes
    // gently down and back into the robe. A thick shell: a robe-colored outside, a darker lining, joined by lips
    // along the opening and down its sides. Each arch: depth (z), half-width, top height, the height its sides
    // come down to.
    m.part('torso');
    const COWL: [number, number, number, number][] = [
      [0.56, 0.17, 1.0, 0.66], [0.46, 0.18, 0.99, 0.64], [0.36, 0.19, 0.93, 0.62],
      [0.26, 0.2, 0.83, 0.6], [0.16, 0.22, 0.72, 0.58], [0.06, 0.24, 0.64, 0.56], // the last ones into the robe
    ];
    const ARC = 10, THICK = 0.025;
    /** How far the whole hood sits back from the arches above (z): pulled back to show a little more of her head. */
    const COWL_BACK = 0.04;
    const cowlColor = (y: number) => robeColor([0, y, 0.3], [0, 0, -1]);
    const lining = mulC(robe, 0.45);
    /** A point of arch k, step i over it (0 = her left side's foot, ARC = her right's), `dr` in from the outside. */
    const arch = (k: number, i: number, dr = 0): Vec3 => {
      const [z, w, top, foot] = COWL[k], t = (i / ARC - 0.5) * Math.PI; // -90deg (left foot) .. 0 (top) .. 90deg
      return [H[0] - Math.sin(t) * (w - dr), foot + Math.cos(t) * (top - foot - dr), z - COWL_BACK];
    };
    for (let k = 0; k < COWL.length - 1; k++) {
      // The hood's axis between these two arches (low, at their feet): the outside faces away from it
      const axis: Vec3 = [H[0], (COWL[k][3] + COWL[k + 1][3]) / 2, (COWL[k][0] + COWL[k + 1][0]) / 2];
      for (let i = 0; i < ARC; i++) {
        m.quad(arch(k, i), arch(k, i + 1), arch(k + 1, i + 1), arch(k + 1, i), cowlColor(COWL[k][2]), axis, { j: 0.16 });
        // The lining faces in, toward her head (oriented away from a point out past the outside)
        const mid = lerp3(arch(k, i), arch(k + 1, i + 1), 0.5), out = add(mid, mul(norm([mid[0] - axis[0], mid[1] - axis[1], 0]), 1));
        m.quad(arch(k, i, THICK), arch(k, i + 1, THICK), arch(k + 1, i + 1, THICK), arch(k + 1, i, THICK), lining, out, { j: 0.12 });
      }
      // Lips down its sides, at the feet of the arches
      for (const i of [0, ARC]) {
        const below = add(lerp3(arch(k, i), arch(k + 1, i), 0.5), [0, 1, 0]);
        m.quad(arch(k, i), arch(k + 1, i), arch(k + 1, i, THICK), arch(k, i, THICK), cowlColor(COWL[k][3]), below, { j: 0.12 });
      }
    }
    // The lip along the opening (the first arch), facing forward
    for (let i = 0; i < ARC; i++) {
      const behind = add(lerp3(arch(0, i), arch(0, i + 1), 0.5), [0, 0, -1]);
      m.quad(arch(0, i), arch(0, i + 1), arch(0, i + 1, THICK), arch(0, i, THICK), cowlColor(COWL[0][2]), behind, { j: 0.12 });
    }

    // ─── Arms: the right holds the staff out to the side; the left reaches forward, clawed ────────────────
    const fingers = (hand: Vec3, dir: Vec3, spread: number) => {
      for (const k of [-1.5, -0.5, 0.5, 1.5]) {
        const tip = add(hand, [dir[0] + k * spread, dir[1], dir[2] + Math.abs(k) * -0.01]);
        frustum(m, hand, tip, 0.012, 0.003, 3, mulC(skin, 0.9), { caps: false });
      }
    };
    // Right (-x): wide sleeve to the staff
    const GRIP: Vec3 = [-0.5, 0.44, 0.38];
    m.part('arm_r', [-0.3, 0.62, 0.18]);
    frustum(m, [-0.3, 0.62, 0.18], [-0.45, 0.5, 0.28], 0.075, 0.065, 6, robeColor);
    frustum(m, [-0.45, 0.5, 0.28], [GRIP[0] + 0.03, GRIP[1] + 0.03, GRIP[2] - 0.02], 0.06, 0.075, 6, robeColor);
    blob(m, GRIP, [0.04, 0.045, 0.04], 0, 0.15, skin);
    m.anchor('hand_r', GRIP);
    // Left (+x): reaching forward, the clawed hand turned down
    m.part('arm_l', [0.3, 0.62, 0.18]);
    const HAND_L: Vec3 = [0.36, 0.44, 0.56];
    frustum(m, [0.3, 0.62, 0.18], [0.4, 0.5, 0.34], 0.075, 0.065, 6, robeColor);
    frustum(m, [0.4, 0.5, 0.34], [HAND_L[0], HAND_L[1] + 0.02, HAND_L[2] - 0.04], 0.06, 0.07, 6, robeColor);
    blob(m, HAND_L, [0.038, 0.03, 0.045], 0, 0.15, skin);
    fingers(HAND_L, [0, -0.07, 0.07], 0.018);
    m.anchor('hand_l', HAND_L);

    // ─── The staff: gnarled, planted out to her right, leaning a little outward ───────────────────────────
    m.part('staff', GRIP);
    const BASE: Vec3 = [-0.44, 0, 0.44], TOP: Vec3 = [-0.56, 1.02, 0.36];
    const knots = [0, 0.22, 0.45, 0.68, 0.86, 1].map((t, i, all) => {
      const p = lerp3(BASE, TOP, t);
      return i === 0 || i === all.length - 1 ? p : add(p, [rf(-0.025, 0.025), 0, rf(-0.025, 0.025)]);
    });
    for (let i = 0; i < knots.length - 1; i++) {
      frustum(m, knots[i], knots[i + 1], 0.03 - i * 0.002, 0.028 - i * 0.002, 5, BARK, { j: 0.2 });
      if (i > 0) blob(m, knots[i], [0.034, 0.03, 0.034], 0, 0.25, mulC(BARK, 1.15));
    }
    // Topped with Sporetender antlers, glowing at their tips
    const capTop = capColor(), capGill = mixC(capTop, [230, 220, 190], 0.6);
    for (const sx of [-1, 1]) antler(c, TOP, sx, 0.42, 2, BONE, capTop, capGill, GLOW, { capSides: 5 });
    // Just beneath them, a glowing orange globule hanging on a cord
    const tie: Vec3 = add(TOP, [-0.035, -0.07, 0.01]);
    const bulb = tendril(m, tie, [-0.15, -1, 0.05], 0.12, 2, 0.006, [40, 30, 22], { sides: 3 });
    const globule = add(bulb, [0, -0.06, 0]);
    blob(m, globule, [0.064, 0.075, 0.064], 1, 0.1, GLOW, { e: 1, j: 0.08 });
    m.halo(globule, 0.23, GLOW);

    // ─── On her back: fungus like the Mirehulk's, and a grander set of antlers hung with charms ─────────
    m.part('torso');
    // Shelves clustered high on her back, under her shoulders
    for (let i = 0, n = ri(9, 12); i < n; i++) {
      const sx = i % 2 === 0 ? 1 : -1;
      shelf(c, onBack(sx * rf(0.02, 0.26) * W, rf(0.42, 0.66), 0.04), Math.PI / 2 + sx * rf(0.3, 0.7), rf(0.096, 0.144), mulC(capColor(), rf(0.75, 1)));
    }
    // Caps sprouting from her back and shoulders, one larger
    for (let i = 0, n = ri(5, 7); i < n; i++) {
      const onShoulder = i >= n - 2, sx = i % 2 === 0 ? 1 : -1;
      const base = onShoulder
        ? onTop(sx * rf(0.2, 0.28) * W, rf(0.14, 0.24))
        : onTop(sx * rf(0.04, 0.22) * W, rf(-0.04, 0.08));
      const big = i === 0, r = big ? rf(0.12, 0.15) : rf(0.05, 0.08), top = capColor();
      mush(c, base, big ? rf(0.1, 0.13) : rf(0.04, 0.07), r, top, mixC(top, [230, 220, 190], 0.6),
        { lean: [sx * 0.35, onShoulder ? 0 : -0.3], spots: big ? ri(2, 4) : 0, sides: big ? 9 : 6 });
    }
    // The grand antlers, mounted high on her back, spreading out to the sides
    const charmsOn: Vec3[] = [];
    for (const sx of [-1, 1]) {
      const B = onTop(sx * 0.12 * W, 0.02, 0.04);
      const a = antler(c, B, sx, rf(0.8, 0.92), ri(3, 4), BONE, capTop, capGill, GLOW, { capSides: 6 });
      charmsOn.push(...a.tines.slice(2), lerp3(B, a.tip, 0.5));
    }
    // Charms: cords hanging from the antlers, each ending in a bead, a crystal or a little bone
    for (const at of charmsOn) {
      const end = tendril(m, at, [rf(-0.1, 0.1), -1, rf(-0.1, 0.1)], rf(0.08, 0.16), 2, 0.005, [44, 34, 26], { sides: 3 });
      const kind = pick(['bead', 'crystal', 'bone'] as const), col = pick(CHARMS);
      if (kind === 'bead') blob(m, add(end, [0, -0.02, 0]), [0.022, 0.022, 0.022], 0, 0.1, col, { j: 0.15 });
      else if (kind === 'crystal') bipyr(m, add(end, [0, -0.025, 0]), 0.016, 0.03, 4, col, { j: 0.1 });
      else frustum(m, add(end, [-0.025, -0.012, 0]), add(end, [0.025, -0.02, 0]), 0.008, 0.008, 4, BONE, { j: 0.1 });
    }

    // Motes: small orange lights drifting beside and above her (never inside her), each with a faint halo
    for (let i = 0, n = ri(9, 11); i < n; i++) {
      const y = rf(0.12, 1.15), a = rf(0, Math.PI * 2);
      const { rx, rz, dz } = robeAt(Math.min(y, 0.72));
      const d = y > 0.75 ? rf(0.05, 0.35) : Math.max(rx, rz) + rf(0.08, 0.22);
      const p: Vec3 = [Math.cos(a) * d, y, dz + Math.sin(a) * d];
      bipyr(m, p, rf(0.01, 0.015), rf(0.015, 0.022), 4, GLOW, { e: 1 });
      m.halo(p, 0.05, GLOW);
    }

    return 'Sporemother';
  },
};

export default design;
