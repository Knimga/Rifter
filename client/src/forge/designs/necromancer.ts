import type { Design } from '../core/types';
import { bipyr, blob, box, frustum, loft } from '../core/primitives';
import { add, hslRGB, mixC, mulC, rotZ, type RGB, type Vec3 } from '../core/vec';

// Identity: tall hooded caster in a dark robe with a scythe and a glowing, empty hood.
// A dark violet robe, skull pauldrons and a green necrotic glow. Seeds vary the robe's tone and the
// soul orbs around it.
const GLOW: RGB = [120, 255, 140];
const ROBE_HUE = 250;

const design: Design = {
  id: 'creature.necromancer',
  source: { table: 'enemies', key: 'necromancer' }, // data/units/enemies.ts › necromancer
  category: 'creature',
  label: 'Necromancer',
  fit: { kind: 'standing', height: 1.6, maxRadius: 0.75 },
  budget: 900,
  build(c) {
    const m = c.mesh;
    const { R, rf } = c;
    const orbs = c.ri(0, 3);
    const glow = GLOW;
    const robe = hslRGB(ROBE_HUE, rf(22, 34), rf(18, 24));
    const robeHi = mulC(robe, 1.45);
    const trim = mixC(robe, glow, 0.35);
    const bone: RGB = [222, 210, 184];
    m.anchor('feet', [0, 0, 0]); // center of the robe hem: this point goes to the tile center (not the scythe-widened box)

    // Robe: a flared, slightly ragged cone from the hem to the chest; trim band near the hem
    m.part('torso', [0, 1.0, 0]);
    const ring = (y: number, r: number, jag: number): Vec3[] =>
      Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2;
        const k = r * (1 + (R() - 0.5) * jag);
        return [Math.sin(a) * k, y + (R() - 0.5) * jag * 0.3, Math.cos(a) * k * 0.85];
      });
    loft(m, [ring(0.02, 0.62, 0.25), ring(0.25, 0.54, 0.1), ring(1.1, 0.34, 0.05), ring(1.75, 0.38, 0.04)], (cen, n) => (cen[1] < 0.3 && n[1] < 0.5 ? trim : n[2] > 0.3 ? robeHi : robe));
    box(m, [0, 1.08, 0.24], [0.5, 0.08, 0.18], mixC(robe, [40, 30, 20], 0.5), 0.1); // belt

    // Hood: deep cowl with a dark void and two burning eyes
    m.part('head', [0, 1.85, 0]);
    blob(m, [0, 2.05, -0.02], [0.3, 0.32, 0.3], 1, 0.08, robe);
    blob(m, [0, 2.0, 0.16], [0.19, 0.22, 0.1], 0, 0.06, [12, 8, 16]);
    for (const sx of [-1, 1]) bipyr(m, [sx * 0.07, 2.02, 0.26], 0.035, 0.03, 4, glow, { e: 1, j: 0.05 });
    frustum(m, [0, 2.3, -0.08], [0, 2.52, -0.22], 0.12, 0.01, 6, robe); // hood point

    // Shoulders: skull pauldrons
    for (const sx of [-1, 1]) {
      const sh: Vec3 = [sx * 0.42, 1.74, 0];
      blob(m, sh, [0.17, 0.13, 0.17], 0, 0.15, robeHi);
      blob(m, add(sh, [sx * 0.04, 0.12, 0.04]), [0.1, 0.1, 0.1], 0, 0.08, bone);
      blob(m, add(sh, [sx * 0.04, 0.12, 0.13]), [0.03, 0.03, 0.02], 0, 0.05, glow, { e: 0.9 });
    }

    // Left arm (+x) raised with a glowing hand; right arm (-x) holds the scythe
    m.part('arm_l', [0.42, 1.74, 0]);
    frustum(m, [0.42, 1.74, 0], [0.62, 1.55, 0.18], 0.12, 0.1, 6, robe);
    frustum(m, [0.62, 1.55, 0.18], [0.7, 1.9, 0.26], 0.1, 0.13, 6, robeHi); // sleeve flares at the wrist
    blob(m, [0.72, 2.0, 0.28], [0.07, 0.07, 0.07], 0, 0.2, bone);
    blob(m, [0.72, 2.13, 0.28], [0.1, 0.1, 0.1], 0, 0.3, glow, { e: 1 });
    m.anchor('hand_l', [0.72, 2.0, 0.28]);

    m.part('arm_r', [-0.42, 1.74, 0]);
    const handR: Vec3 = [-0.66, 1.3, 0.22];
    frustum(m, [-0.42, 1.74, 0], [-0.62, 1.48, 0.14], 0.12, 0.1, 6, robe);
    frustum(m, [-0.62, 1.48, 0.14], handR, 0.1, 0.12, 6, robeHi);
    blob(m, handR, [0.06, 0.06, 0.06], 0, 0.2, bone);
    m.anchor('hand_r', handR);

    // Scythe: upright haft beside the body (leaning outward only, so it reads from every facing)
    m.part('weapon');
    const s0 = m.faces.length;
    const wood: RGB = [70, 52, 44];
    frustum(m, [0, -1.25, 0], [0, 1.15, 0], 0.035, 0.03, 5, wood);
    const blade: RGB = [168, 172, 182];
    const bp: Vec3[][] = [
      [[0, 1.1, -0.025], [0, 1.1, 0.025], [0, 1.2, 0.025], [0, 1.2, -0.025]],
      [[0.35, 1.18, -0.02], [0.35, 1.18, 0.02], [0.35, 1.26, 0.02], [0.35, 1.26, -0.02]],
      [[0.7, 1.1, -0.01], [0.7, 1.1, 0.01], [0.7, 1.14, 0.01], [0.7, 1.14, -0.01]],
      [[0.95, 0.88, 0], [0.95, 0.88, 0], [0.95, 0.88, 0], [0.95, 0.88, 0]],
    ];
    loft(m, bp, blade, { j: 0.08 });
    box(m, [0, 1.12, 0], [0.09, 0.08, 0.09], trim, 0.1);
    m.xf(s0, (p) => add(rotZ([-p[0], p[1], p[2]], 0.12), handR));

    // Floating soul orbs around the boss
    m.part('orbs');
    for (let i = 0; i < orbs; i++) {
      const a = (i / Math.max(1, orbs)) * Math.PI * 2 + rf(0, 1);
      bipyr(m, [Math.sin(a) * 0.8, rf(1.2, 1.9), Math.cos(a) * 0.55], 0.07, 0.09, 4, glow, { e: 1, j: 0.1 });
    }

    return 'Necromancer';
  },
};
export default design;
