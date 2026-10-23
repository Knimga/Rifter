import type { Design } from '../core/types';
import { blob, box, frustum } from '../core/primitives';
import { add, mixC, mulC, rotZ, type RGB, type Vec3 } from '../core/vec';

// Identity: always ivory bone (narrow range), armed, with a shield and no helmet. Seeds vary build,
// weapon and eye glow.
const EYES = {
  ember: [255, 120, 40],
  frost: [120, 220, 255],
  void: [190, 110, 255],
  bile: [170, 255, 80],
} as const satisfies Record<string, RGB>;
const RUST: RGB = [128, 82, 58];

const design: Design = {
  id: 'creature.skeleton',
  source: { table: 'enemies', key: 'skeleton' }, // data/units/enemies.ts › skeleton
  category: 'creature',
  label: 'Skeleton',
  fit: { kind: 'standing', height: 1.12, maxRadius: 0.54 }, // ~12% bigger (uniform: height is the limiting fit)
  budget: 900,
  build(c) {
    const m = c.mesh;
    const { rf } = c;
    const eyeKey = c.pick(Object.keys(EYES) as (keyof typeof EYES)[]);
    const weapon = c.pick(['sword', 'cleaver'] as const);
    const bone = mulC([226, 214, 186], rf(0.92, 1.04));
    const boneDark = mulC(bone, 0.62);
    const eye: RGB = [...EYES[eyeKey]];
    const lean = rf(0.9, 1.1); // limb thickness
    m.anchor('feet', [0, 0, 0.04]); // middle of the stance: this point goes to the tile center

    // Legs: thin femur + tibia with a knobbly knee, small flat feet
    for (const sx of [-1, 1]) {
      const x = sx * 0.15;
      m.part(sx > 0 ? 'leg_l' : 'leg_r', [x, 0.95, 0]);
      frustum(m, [x, 0.95, 0], [x * 1.05, 0.52, 0.03], 0.034 * lean, 0.028 * lean, 5, bone);
      blob(m, [x * 1.05, 0.5, 0.04], [0.055, 0.055, 0.055], 0, 0.15, bone);
      frustum(m, [x * 1.05, 0.48, 0.03], [x * 1.1, 0.08, 0], 0.028 * lean, 0.024 * lean, 5, bone);
      box(m, [x * 1.1, 0.04, 0.07], [0.1, 0.06, 0.22], bone, 0.15);
    }

    // Pelvis, spine, and a ribcage of separate curved ribs around a dark cavity. The ribs wrap from the
    // spine around the sides to the sternum, so from the 60° game camera they show as nested curves.
    // (Flat bars across the front nearly vanish from above, since the camera compresses vertical spacing.)
    m.part('torso', [0, 1.0, 0]);
    box(m, [0, 1.0, 0], [0.27, 0.11, 0.17], bone, 0.12); // pelvis
    frustum(m, [0, 1.05, -0.08], [0, 1.78, -0.1], 0.03, 0.026, 5, boneDark); // spine
    blob(m, [0, 1.46, -0.02], [0.14, 0.25, 0.13], 0, 0.06, [36, 30, 34]); // dark chest cavity
    const RIBS = 4;
    for (let k = 0; k < RIBS; k++) {
      const y = 1.68 - k * 0.14; // top rib first
      const w = 0.225 - Math.abs(k - 1) * 0.022; // barrel shape, widest at the second rib
      const d = 0.21 - k * 0.012; // depth, back to front
      for (const sx of [-1, 1]) {
        // Half ring: back center (spine) -> side -> front center (sternum), sloping down toward the front
        const pts: Vec3[] = [0, 1, 2, 3].map((i) => {
          const t = (i / 3) * Math.PI;
          return [sx * w * Math.sin(t), y - (i / 3) * 0.07, -d * Math.cos(t) - 0.02];
        });
        for (let i = 0; i < 3; i++) frustum(m, pts[i], pts[i + 1], 0.024, 0.024, 3, bone, { caps: false }); // 3-sided: ~1.5 px wide in game
      }
    }
    box(m, [0, 1.47, 0.19], [0.05, 0.36, 0.03], bone, 0.1); // sternum
    box(m, [0, 1.76, -0.02], [0.44, 0.05, 0.12], bone, 0.08); // collarbones

    // Skull with glowing sockets and a jaw
    m.part('head', [0, 1.8, 0]);
    blob(m, [0, 2.0, 0.02], [0.17, 0.19, 0.18], 1, 0.05, bone);
    box(m, [0, 1.85, 0.08], [0.2, 0.08, 0.14], bone, 0.1);
    for (const sx of [-1, 1]) {
      blob(m, [sx * 0.07, 2.0, 0.16], [0.05, 0.045, 0.03], 0, 0.05, [24, 18, 22]);
      blob(m, [sx * 0.07, 2.0, 0.18], [0.025, 0.022, 0.012], 0, 0.05, eye, { e: 1 });
    }
    // Arms: the right arm (-x) holds the weapon forward, the left carries a shield
    for (const sx of [-1, 1]) {
      // Shoulders sit just outside the ribcage so the thin arms stay visible beside it
      const sh: Vec3 = [sx * 0.29, 1.72, -0.02];
      m.part(sx > 0 ? 'arm_l' : 'arm_r', sh);
      blob(m, sh, [0.055, 0.055, 0.055], 0, 0.15, bone);
      const elbow: Vec3 = [sx * 0.34, 1.38, sx > 0 ? 0.02 : 0.1];
      const hand: Vec3 = sx > 0 ? [sx * 0.35, 1.06, 0.06] : [sx * 0.33, 1.18, 0.32];
      frustum(m, sh, elbow, 0.026 * lean, 0.022 * lean, 5, bone);
      blob(m, elbow, [0.038, 0.038, 0.038], 0, 0.15, bone);
      frustum(m, elbow, hand, 0.022 * lean, 0.018 * lean, 5, bone);
      blob(m, hand, [0.045, 0.045, 0.045], 0, 0.2, bone);
      m.anchor(sx > 0 ? 'hand_l' : 'hand_r', hand);
    }

    // Weapon in the right hand, pointing forward and up
    m.part('weapon');
    const grip: Vec3 = [-0.33, 1.18, 0.32]; // = hand_r
    const s0 = m.faces.length;
    frustum(m, [0, -0.1, 0], [0, 0.12, 0], 0.025, 0.025, 5, [70, 52, 40]);
    box(m, [0, 0.13, 0], [0.16, 0.03, 0.05], RUST, 0.1);
    if (weapon === 'sword') box(m, [0, 0.46, 0], [0.06, 0.62, 0.02], mixC(RUST, [150, 150, 150], 0.35), 0.15);
    else box(m, [0.04, 0.38, 0], [0.16, 0.46, 0.02], mixC(RUST, [120, 120, 124], 0.25), 0.18);
    // Raised and leaning OUTWARD only. Under the top-down camera any forward/back lean points the
    // blade at the viewer from some facing and it collapses to a stub (see style guide, "Camera").
    m.xf(s0, (p) => add(rotZ(p, 0.45), grip));

    m.part('shield');
    const at: Vec3 = [0.4, 1.18, 0.1]; // beside hand_l
    blob(m, at, [0.04, 0.22, 0.2], 0, 0.12, mixC(RUST, [96, 72, 52], 0.5));
    blob(m, add(at, [0.03, 0, 0]), [0.02, 0.05, 0.05], 0, 0.1, RUST);

    const title = eyeKey[0].toUpperCase() + eyeKey.slice(1);
    return `${title}-Eyed Skeleton${weapon === 'cleaver' ? ' Butcher' : ''}`;
  },
};
export default design;
