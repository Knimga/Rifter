// Identity: a small, amorphous thing of the void that slithers along the ground: a teardrop of purple see-through
// flesh leaning forward, with a violet glow deep inside it (a glowing core showing through, and a halo), long
// tentacles writhing out around it like an octopus's (curling along the ground, arching up, reaching, looping), and
// three glowing violet eyes on its front.
// Seeds vary the teardrop (its size, lean and wobble) and the tentacles (how many, how long, which way they curl).
import type { Design } from '../../core/types';
import { blob, jointedLimb, loft, wobbleRing } from '../../core/primitives';
import type { RGB, Vec3 } from '../../core/vec';

const BODY: RGB = [76, 42, 122]; // a rich purple: stands out on the Dark Tunnel's near-black violet floor
const TENTACLE: RGB = [60, 32, 98]; // a darker purple
const CORE: RGB = [150, 70, 255]; // the violet glow inside
const HALO: RGB = [150, 96, 255];
const EYE: RGB = [206, 150, 255];
const EYE_HALO: RGB = [170, 110, 255];
/** How see-through its flesh is (its alpha). */
const FLESH = 0.62;

const design: Design = {
  id: 'creature.voidling',
  source: { table: 'enemies', key: 'voidling' }, // data/units/enemies.ts › voidling
  category: 'creature',
  label: 'Voidling',
  fit: { kind: 'standing', height: 0.62, maxRadius: 0.62 }, // small and low: its spread tentacles set its size
  budget: 1300,
  build(c) {
    const m = c.mesh;
    const { rf, ri } = c;
    m.anchor('feet', [0, 0, 0]);

    // The body: a teardrop of see-through flesh, full and round where it sits on the ground, narrowing to a point that
    // leans forward (+z) over its front; its rings wobble a little, so it stays a shapeless thing. A violet core glows
    // through its full lower part
    const R = rf(0.28, 0.32), H = rf(0.62, 0.72), lean = rf(0.3, 0.38);
    // [height share, radius share, forward lean share]: the teardrop's rings, from the ground up
    const PROFILE: [number, number, number][] = [[0, 0.92, 0], [0.12, 1, 0.02], [0.3, 0.92, 0.1], [0.5, 0.68, 0.3], [0.7, 0.42, 0.58], [0.86, 0.2, 0.84]];
    const rings = PROFILE.map(([h, r, f]) => wobbleRing([0, H * h, lean * f], R * r, R * r * 1.08, 12, 0.08, c.R));
    const tip: Vec3 = [0, H, lean * 1.05];
    const core: Vec3 = [0, H * 0.24, 0.02];
    m.part('body', core);
    blob(m, core, [R * 0.42, H * 0.16, R * 0.42], 0, 0.3, CORE, { e: 0.9, j: 0.2 });
    loft(m, rings, BODY, { a: FLESH, j: 0.12 });
    const top = rings[rings.length - 1];
    for (let i = 0; i < top.length; i++) m.tri(tip, top[i], top[(i + 1) % top.length], BODY, core, { a: FLESH, j: 0.12 });
    m.halo(core, R * 1.25, HALO);

    // Tentacles spread out along the ground all around it, long, tapering and curling, their tips lifting a little
    m.part('tentacles', [0, 0.05, 0]);
    // Each grows segment by segment from the body's edge, turning (yaw) and rising or falling (pitch) its own way, like
    // an octopus's: some curl along the ground, some arch up off it and back down, some reach up into the air, some coil
    // up into a loop. Their turns vary from segment to segment, so no two bend alike; none goes below the floor.
    const SEGS = 8;
    type Style = 'curl' | 'arch' | 'reach' | 'loop';
    for (let i = 0, n = ri(7, 9); i < n; i++) {
      const style = c.pick<Style>(['curl', 'curl', 'arch', 'arch', 'reach', 'loop', 'loop']);
      const out = (i / n) * Math.PI * 2 + rf(-0.25, 0.25), len = rf(0.5, 0.75), step = len / SEGS;
      const side = c.chance(0.5) ? 1 : -1;
      let yaw = out + rf(-0.3, 0.3), pitch = style === 'curl' ? rf(-0.1, 0.15) : style === 'arch' ? rf(0.4, 0.7) : style === 'reach' ? rf(0.25, 0.5) : rf(-0.05, 0.1);
      // A loop twists sideways as it coils, so it rolls out beside the body as a helix instead of folding back over it
      const yawRate = side * (style === 'curl' ? rf(0.25, 0.55) : style === 'loop' ? rf(0.3, 0.45) : style === 'arch' ? rf(0.2, 0.4) : rf(0.08, 0.3));
      const pitchRate = style === 'arch' ? -rf(0.32, 0.45) : style === 'reach' ? rf(0.05, 0.15) : style === 'loop' ? rf(1.1, 1.3) : rf(-0.05, 0.05);
      let p: Vec3 = [Math.cos(out) * R * 0.85, 0.06, Math.sin(out) * R * 0.85];
      const pts: Vec3[] = [p];
      for (let k = 0; k < SEGS; k++) {
        yaw += yawRate * rf(0.5, 1.6);
        // A loop runs out flat first, then coils up into a tight loop over its outer half, away from the body
        if (style !== 'loop' || k >= SEGS - 5) pitch += pitchRate * rf(0.6, 1.4);
        // Rising, but never straight up like a stalk; its tip hooks sideways
        if (style === 'reach') { pitch = Math.min(pitch, 0.65); if (k >= SEGS - 3) yaw += side * rf(0.5, 0.8); }
        const flat = Math.cos(pitch);
        p = [p[0] + Math.cos(yaw) * flat * step, p[1] + Math.sin(pitch) * step, p[2] + Math.sin(yaw) * flat * step];
        // Never into the floor: along it instead, turning back up
        if (p[1] < 0.03) { p = [p[0], 0.03, p[2]]; pitch = Math.max(pitch, 0); }
        pts.push(p);
      }
      jointedLimb(m, pts, (seg) => [0.008 + 0.046 * (1 - seg / SEGS), 0.006 + 0.046 * (1 - (seg + 1) / SEGS)], TENTACLE, { sides: 5, j: 0.12, a: 0.78 });
    }

    // Three glowing violet eyes on its front, high on the teardrop where it leans over: one above, two below it, each
    // with a small halo
    m.part('eyes', core);
    const front = (ring: number, side: number): Vec3 => {
      const [h, r, f] = PROFILE[ring];
      const rr = R * r * 1.08, ang = Math.PI / 2 - side; // around the ring from straight ahead
      return [Math.cos(ang) * R * r, H * h, lean * f + Math.sin(ang) * rr * 0.98];
    };
    for (const at of [front(4, 0), front(3, 0.38), front(3, -0.38)]) {
      blob(m, at, [0.035, 0.035, 0.03], 0, 0.05, EYE, { e: 1, j: 0.05 });
      m.halo(at, 0.07, EYE_HALO);
    }
    return 'Voidling';
  },
};

export default design;
