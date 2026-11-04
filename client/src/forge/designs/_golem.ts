// Golems: hulks of rock (the Flame Golem, and the Mirehulk gone to the swamp): their weathered stone, their limbs of
// cracked rocks, their feet and their heads. What fills the cracks is each one's own (lava, moss and lichen).
// Files starting with "_" are NOT registered as designs.
import type { ColorFn, FaceOpts, Mesh } from '../core/mesh';
import { blob, box, crackedBlob } from '../core/primitives';
import { len, lerp3, mulC, sub, type RGB, type Vec3 } from '../core/vec';

/** A golem's rock: faces facing up catch more light (weathered tops), the rest stay dark. */
export const golemStone = (rock: RGB): ColorFn => {
  const rockHi = mulC(rock, 1.35);
  return (_cen: Vec3, n: Vec3): RGB => (n[1] > 0.6 ? rockHi : rock);
};

/**
 * A golem's limb builder: from `a` to `b`, a chain of `n` overlapping lumpy rocks (radius r0 tapering to r1), each
 * cracked (`share` of its faces `cracks`, `vein` their face options), so it reads bumpy instead of a smooth tube.
 */
export const golemLimb = (m: Mesh, stone: ColorFn, cracks: RGB | ColorFn, share: number, vein?: FaceOpts) =>
  (a: Vec3, b: Vec3, r0: number, r1: number, n: number) => {
    const l = len(sub(b, a));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, rr = r0 + (r1 - r0) * t;
      crackedBlob(m, lerp3(a, b, t), [rr, Math.max(rr, (l / n) * 0.78), rr], 0, 0.22, stone, cracks, share, { j: 0.2 }, vein);
    }
  };

/** A golem's foot: a slab of rock under the ankle, reaching forward. */
export function golemFoot(m: Mesh, ankle: Vec3, rock: RGB): void {
  box(m, [ankle[0], 0.07, ankle[2] + 0.05], [0.26, 0.14, 0.32], rock, 0.25);
}

/** What a golem's body (golemBody) is made of: its rock, what fills its cracks and how much, its eyes, its bulk. */
export interface GolemLook {
  rock: RGB;
  /** What fills its cracks (the Flame Golem's lava); with no share, plain rock. */
  cracks: RGB;
  /** Share of the faces that are cracks: the torso's masses, and the (less cracked) limbs. */
  torsoShare: number;
  limbShare: number;
  eye: RGB;
  /** Its bulk (x scale), about 1. */
  W: number;
}

/**
 * A golem standing (the Flame Golem's frame): short thick legs slightly apart, a pelvis, belly and broad chest pushed
 * forward with a hunched back behind it, a small head low and forward between big boulder shoulders, and long arms
 * swung back and bent at the elbow, hanging nearly to the ground beside the body, ending in huge fists. Marks feet,
 * hand_l and hand_r.
 */
export function golemBody(m: Mesh, look: GolemLook): void {
  const { rock, cracks, torsoShare, limbShare, eye, W } = look;
  const stone = golemStone(rock);
  const limb = golemLimb(m, stone, cracks, limbShare);
  m.anchor('feet', [0, 0, 0.02]); // between the feet: this point goes to the tile center

  // Short, thick legs, slightly apart
  for (const sx of [-1, 1]) {
    const hip: Vec3 = [sx * 0.2 * W, 0.74, -0.02], knee: Vec3 = [sx * 0.23 * W, 0.42, 0.05], ankle: Vec3 = [sx * 0.24 * W, 0.13, 0.02];
    m.part(sx > 0 ? 'leg_l' : 'leg_r', hip);
    limb(hip, knee, 0.15, 0.13, 1);
    crackedBlob(m, knee, [0.14, 0.13, 0.14], 0, 0.2, stone, cracks, limbShare, { j: 0.2 });
    limb(knee, ankle, 0.13, 0.12, 1);
    golemFoot(m, ankle, rock);
  }

  // Body: pelvis, belly, a broad chest pushed forward and a hunched back behind it
  m.part('torso', [0, 0.85, 0]);
  blob(m, [0, 0.84, -0.02], [0.27 * W, 0.16, 0.2], 0, 0.2, stone);
  crackedBlob(m, [0, 1.03, 0.03], [0.27 * W, 0.22, 0.21], 0, 0.18, stone, cracks, torsoShare, { j: 0.2 });
  crackedBlob(m, [0, 1.27, 0.12], [0.36 * W, 0.28, 0.26], 1, 0.16, stone, cracks, torsoShare, { j: 0.2 });
  crackedBlob(m, [0, 1.48, -0.04], [0.32 * W, 0.2, 0.25], 1, 0.16, stone, cracks, torsoShare, { j: 0.2 }); // the bent back's hump

  // Head: small, low and forward, sunk between the shoulders; a heavy brow over small round glowing eyes
  m.part('head', [0, 1.46, 0.36]);
  golemHead(m, [0, 1.5, 0.46], stone, rock, eye);
  // Just over its brow: where a portrait frames from (its hump rises higher than its head: renderPortrait)
  m.anchor('head_top', [0, 1.68, 0.46]);

  // Big boulder shoulders; long arms swung back from the shoulder and bent at the elbow, hanging nearly to the
  // ground beside the body (not held out in front), leaning outward, ending in huge fists
  for (const sx of [-1, 1]) {
    const sh: Vec3 = [sx * 0.43 * W, 1.45, 0.06];
    m.part(sx > 0 ? 'arm_l' : 'arm_r', sh);
    crackedBlob(m, sh, [0.21, 0.19, 0.21], 0, 0.2, stone, cracks, torsoShare, { j: 0.2 });
    const elbow: Vec3 = [sx * 0.58 * W, 1.0, -0.1], wrist: Vec3 = [sx * 0.62 * W, 0.56, 0.06];
    limb(sh, elbow, 0.13, 0.11, 2);
    crackedBlob(m, elbow, [0.12, 0.12, 0.12], 0, 0.2, stone, cracks, limbShare, { j: 0.2 });
    limb(elbow, wrist, 0.11, 0.12, 2);
    const fist: Vec3 = [sx * 0.63 * W, 0.42, 0.08];
    crackedBlob(m, fist, [0.17, 0.16, 0.17], 0, 0.2, stone, cracks, limbShare, { j: 0.2 });
    m.anchor(sx > 0 ? 'hand_l' : 'hand_r', fist);
  }
}

/** A golem's head at `H`: small and rocky, a heavy brow over two small round glowing `eye`s, each with a halo. */
export function golemHead(m: Mesh, H: Vec3, stone: ColorFn, rock: RGB, eye: RGB): void {
  blob(m, H, [0.15, 0.13, 0.14], 0, 0.18, stone);
  box(m, [0, H[1] + 0.08, H[2] + 0.04], [0.26, 0.055, 0.1], rock, 0.2);
  for (const sx of [-1, 1]) {
    blob(m, [sx * 0.065, H[1] + 0.02, H[2] + 0.125], [0.042, 0.042, 0.035], 0, 0.05, eye, { e: 0.95, j: 0.05 });
    m.halo([sx * 0.065, H[1] + 0.02, H[2] + 0.16], 0.11, eye);
  }
}
