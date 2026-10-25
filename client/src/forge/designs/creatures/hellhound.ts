import type { Design } from '../../core/types';
import { blob, box, frustum } from '../../core/primitives';
import { hslRGB, mixC, mulC, type RGB, type Vec3 } from '../../core/vec';

// Identity: a hyena-like hound of the fire realms. Its coat is always red-tinted (hue locked to a
// narrow band, never plain brown) with darker spots, a sloping back (shoulders high, hindquarters low), a ridge of
// bristles along the spine burning orange and red, and a big head with its jaws open on white fangs and
// bright red glowing eyes. It walks: the legs are staggered (diagonal pairs forward / back), not squared.
// Seeds vary the coat, the spots, the build and the bristles' heights and colors.
const design: Design = {
  id: 'creature.hellhound',
  source: { table: 'enemies', key: 'hellhound' }, // data/units/enemies.ts › hellhound
  category: 'creature',
  label: 'Hellhound',
  fit: { kind: 'standing', height: 1.0, maxRadius: 0.62 }, // long body: the radius is the limiting fit
  budget: 900,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    // Coat: always red-tinted (never a plain brown)
    const coat = hslRGB(ri(8, 16), rf(55, 66), rf(31, 37));
    const spot = mulC(coat, rf(0.55, 0.68));
    const belly = mixC(coat, [196, 150, 104], 0.25);
    const dark = mulC(coat, 0.5); // lower legs, paws
    const mouth: RGB = [92, 20, 18];
    const fang: RGB = [236, 228, 208];
    const eye: RGB = [255, 34, 24]; // bright red, always
    const flames: RGB[] = [[255, 168, 48], [236, 84, 30], [196, 40, 26], [255, 214, 96]];
    const CHAR: RGB = [22, 16, 16]; // charred black bristles
    const bristleColors: RGB[] = [...flames, [224, 22, 16], CHAR]; // flames, pure red, black
    const W = rf(0.92, 1.08); // build: girth
    const spotPhase = rf(0, Math.PI * 2), spotScale = rf(16, 22);

    // Coat with dark spots (a hyena's), lighter underneath
    const hide = (cen: Vec3, n: Vec3): RGB =>
      n[1] < -0.55 ? belly : Math.sin(cen[2] * spotScale + spotPhase) * Math.sin(cen[0] * spotScale * 1.3 + cen[1] * 9) > 0.55 ? spot : coat;

    m.anchor('feet', [0, 0, 0.02]); // middle of the stance: this point goes to the tile center

    // Legs: front ones longer (sloping back), each in two segments bent at the knee. Staggered: diagonal
    // pairs, front-left and hind-right forward, front-right and hind-left back.
    const legs: { name: string; hip: Vec3; knee: Vec3; paw: Vec3; r: number }[] = [];
    for (const sx of [-1, 1]) {
      const fwd = sx > 0 ? 1 : -1; // +x (left) front leg steps forward
      legs.push({ name: sx > 0 ? 'leg_fl' : 'leg_fr', hip: [sx * 0.17 * W, 0.78, 0.42], knee: [sx * 0.18 * W, 0.4, 0.42 + fwd * 0.07], paw: [sx * 0.17 * W, 0.05, 0.42 + fwd * 0.16], r: 0.088 });
      legs.push({ name: sx > 0 ? 'leg_hl' : 'leg_hr', hip: [sx * 0.15 * W, 0.62, -0.42], knee: [sx * 0.16 * W, 0.32, -0.5 - fwd * 0.06], paw: [sx * 0.15 * W, 0.05, -0.42 - fwd * 0.15], r: 0.082 });
    }
    for (const l of legs) {
      m.part(l.name, l.hip);
      frustum(m, l.hip, l.knee, l.r * 1.25, l.r, 5, hide);
      frustum(m, l.knee, l.paw, l.r, l.r * 0.7, 5, mixC(coat, dark, 0.5));
      box(m, [l.paw[0], 0.035, l.paw[2] + 0.04], [0.11, 0.07, 0.15], dark, 0.2);
    }

    // Body: high shoulders, sloping down to small hindquarters
    m.part('torso', [0, 0.72, 0]);
    blob(m, [0, 0.62, -0.38], [0.2 * W, 0.2, 0.24], 0, 0.12, hide);  // hindquarters
    blob(m, [0, 0.7, -0.02], [0.22 * W, 0.22, 0.34], 0, 0.12, hide); // barrel
    blob(m, [0, 0.82, 0.36], [0.26 * W, 0.27, 0.28], 0, 0.12, hide); // chest and shoulders

    // Short bushy tail, tipped with flame
    frustum(m, [0, 0.66, -0.58], [0, 0.42, -0.8], 0.07, 0.05, 5, coat);
    frustum(m, [0, 0.42, -0.8], [0, 0.32, -0.88], 0.05, 0.01, 4, flames[1], { e: 0.6 });

    // Neck, then the big head held forward and a little low
    m.part('head', [0, 0.95, 0.55]);
    frustum(m, [0, 0.9, 0.5], [0, 0.98, 0.72], 0.17 * W, 0.13, 6, hide);
    const H: Vec3 = [0, 1.0, 0.82];
    blob(m, H, [0.19, 0.17, 0.18], 1, 0.1, coat);
    // Rounded ears, set wide
    for (const sx of [-1, 1]) blob(m, [sx * 0.13, H[1] + 0.17, H[2] - 0.05], [0.07, 0.09, 0.04], 0, 0.15, spot);
    // Glowing eyes
    for (const sx of [-1, 1]) blob(m, [sx * 0.09, H[1] + 0.06, H[2] + 0.15], [0.04, 0.03, 0.02], 0, 0.1, eye, { e: 0.9 });

    // Open jaws: the upper jaw (muzzle) tilts up, the lower one drops, a dark red mouth between them and
    // white fangs top and bottom
    const up0: Vec3 = [0, H[1] + 0.02, H[2] + 0.1], up1: Vec3 = [0, H[1] + 0.08, H[2] + 0.36];
    const lo0: Vec3 = [0, H[1] - 0.1, H[2] + 0.07], lo1: Vec3 = [0, H[1] - 0.24, H[2] + 0.28];
    blob(m, [0, H[1] - 0.06, H[2] + 0.19], [0.085, 0.09, 0.14], 0, 0.1, mouth);
    frustum(m, up0, up1, 0.11, 0.07, 5, coat);
    box(m, [0, up1[1] + 0.01, up1[2] + 0.01], [0.06, 0.05, 0.04], [26, 18, 18], 0.1); // nose
    frustum(m, lo0, lo1, 0.075, 0.045, 5, mixC(coat, belly, 0.5));
    for (const sx of [-1, 1]) {
      const fx = sx * 0.05;
      frustum(m, [fx, up1[1] - 0.04, up1[2] - 0.03], [fx, up1[1] - 0.16, up1[2] - 0.01], 0.024, 0.003, 4, fang);
      frustum(m, [fx * 0.9, lo1[1] + 0.03, lo1[2] - 0.03], [fx * 0.9, lo1[1] + 0.13, lo1[2] - 0.02], 0.02, 0.003, 4, fang);
    }

    // Bristles along the whole spine, from the back of the head down to the hindquarters: tallest at the
    // shoulders, shorter toward the tail, leaning back. Mostly burning orange, red and yellow (glowing), with
    // some charred black ones (not glowing). Open-ended cones: the base is buried in the body, the tip a point.
    m.part('torso', [0, 0.72, 0]);
    // The top of the back along its length (z, y), following the chest, barrel and hindquarters
    const SPINE: [number, number][] = [[0.66, 1.0], [0.36, 1.06], [-0.02, 0.89], [-0.4, 0.79], [-0.52, 0.74]];
    const spineY = (z: number) => {
      for (let k = 0; k < SPINE.length - 1; k++) {
        const [z0, y0] = SPINE[k], [z1, y1] = SPINE[k + 1];
        if (z <= z0 && z >= z1) return y0 + ((z0 - z) / (z0 - z1)) * (y1 - y0);
      }
      return SPINE[SPINE.length - 1][1];
    };
    const N = 13;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1); // 0 = head end, 1 = hindquarters
      const z = 0.66 - t * 1.18, y = spineY(z) - 0.03;
      const h = rf(0.16, 0.24) * (1.15 - Math.abs(t - 0.25) * 0.8);
      for (const sx of [-1, 1]) {
        const color = c.pick(bristleColors);
        frustum(m, [sx * 0.04, y, z], [sx * rf(0.05, 0.1), y + h, z - h * 0.55], 0.045, 0.004, 3, color, { e: color === CHAR ? 0 : 0.6, caps: false });
      }
    }

    return 'Hellhound';
  },
};

export default design;
