// Model for Dead Adventurer (data/world/interactiveObjects.ts › dead-adventurer): an adventurer's intact skeleton,
// lying where it was slain: flat on its back and sprawled, its right arm flung up past its head, its left out at
// its side, one leg out straight and the other's knee fallen open to the side. Its skull is turned to one side
// under a rusty iron helmet knocked askew; its jaw has fallen open. Its sword lies where it fell, just past its
// outflung hand; its shield lies face up by its left side. The gear is the game's own (the Iron Helm, the Plain
// Gladius, the Kite Shield) at the size a character carries it, rusted. Old, browned bone. A container the party
// searches for loot (data/gear/containers.ts).
// Built facing +z (its feet toward the open floor: placed like a chest, its head toward a wall), on one tile.
import type { Design } from '../../core/types';
import type { Mesh } from '../../core/mesh';
import { blob, box, frustum, jointedLimb, tube } from '../../core/primitives';
import { add, mixC, mul, mulC, rotX, rotY, rotZ, type RGB, type Vec3 } from '../../core/vec';
import { buildModel } from '../../core/build';
import { embed } from '../../core/embed';
import { extentAlong } from '../../core/hold';
import { ITEM_SEED } from '../../core/link';
import { CHARACTER_HEIGHT } from '../../core/stage-config';
import { HELD_LENGTH, HELD_SHIELD_HEIGHT } from '../../equip';
import { WEAPON_ROLL } from '../_weapon';
import { interactiveEntry } from '../_interactive';
import ironHelm from '../armor/iron-helm';
import gladius from '../weapons/plain-gladius';
import kiteShield from '../offhands/kite-shield';

/** Rust, and the hollows of the skull and chest. */
const RUST: RGB = [118, 66, 40];
const HOLLOW: RGB = [22, 17, 15];

/** Its height when standing (a character's): bones are sized to it, so the gear it carried fits it. */
const H = CHARACTER_HEIGHT;

/**
 * Rust the faces drawn since `from` (its embedded gear): metal (anything near grey) stays iron, dulled and tinged,
 * with patches of rust through it (a slow wave through space, so neighbouring faces agree); leather and wood just
 * darken with age.
 */
function rust(m: Mesh, from: number): void {
  for (let i = from; i < m.faces.length; i++) {
    const f = m.faces[i], c = f.c;
    const cen = mul(add(add(f.v[0], f.v[1]), f.v[2]), 1 / 3);
    const grey = Math.max(...c) - Math.min(...c) < 40;
    const patch = Math.sin(cen[0] * 61 + 1.3) + Math.sin(cen[1] * 53 + 0.4) + Math.sin(cen[2] * 47 + 2.1) > 1;
    f.c = grey ? mixC(mulC(c, 0.85), RUST, patch ? 0.62 : 0.2) : mulC(c, 0.72);
  }
}

const design: Design = {
  ...interactiveEntry('dead-adventurer'),
  category: 'interactive',
  fit: { kind: 'standing', height: 0.6, maxRadius: 0.5 },
  budget: 1800,
  build(c) {
    const m = c.mesh;
    const { rf } = c;
    m.anchor('feet', [0, 0, 0]); // the middle of where it lies

    const bone = mulC([206, 190, 156], rf(0.94, 1.03)), boneDark = mulC(bone, 0.62);
    const side = c.pick([1, -1]); // which way its skull is turned

    // The skeleton is posed in its own body space (y up its spine, +z its front, +x its left, the pelvis at the
    // origin), then laid flat on its back on the floor (lay): its head toward the back of the tile, its chest up,
    // turned a little off straight
    const yaw = rf(-0.22, 0.22);
    const lay = (p: Vec3): Vec3 => add(rotY(rotX(p, -Math.PI / 2), yaw), [0, 0.045, 0.06]);
    const bodyFrom = m.faces.length;

    // ─── Torso: pelvis, spine, and a ribcage of curved ribs round a dark hollow, flattened on its back ───
    box(m, [0, 0, 0.01], [0.14, 0.09, 0.05], bone, 0.12);
    frustum(m, [0, 0.03, -0.01], [0, 0.42, -0.01], 0.014, 0.012, 5, boneDark);
    blob(m, [0, 0.27, 0.035], [0.07, 0.11, 0.045], 0, 0.06, HOLLOW);
    for (let k = 0; k < 4; k++) {
      const y = 0.36 - k * 0.065;
      const w = 0.11 - Math.abs(k - 1) * 0.011, d = 0.07 - k * 0.004;
      for (const sx of [-1, 1]) {
        // Half ring: from the spine at its back, round its side, to the sternum at its front, sloping down
        const pts: Vec3[] = [0, 1, 2, 3].map((i) => {
          const t = (i / 3) * Math.PI;
          return [sx * w * Math.sin(t), y - (i / 3) * 0.035, 0.025 - d * 0.55 * Math.cos(t)];
        });
        tube(m, pts, 0.012, 0.012, 3, bone, { caps: false });
      }
    }
    frustum(m, [0, 0.36, 0.065], [0, 0.18, 0.065], 0.014, 0.012, 4, bone); // sternum
    const SH_R: Vec3 = [-0.14, 0.39, 0], SH_L: Vec3 = [0.14, 0.39, 0];
    frustum(m, SH_R, SH_L, 0.013, 0.013, 4, bone, { caps: false }); // collarbones

    // ─── Limbs: a bone per segment (each tapering on its own), a knob at each joint, a flat hand or foot at the end ───
    const limb = (joints: Vec3[], w: number) => jointedLimb(m, joints, () => [w, w * 0.85], bone, { knobs: { scale: 1.7, jit: 0.15 } });
    // Arms: the right flung up past its head, the left out at its side
    const HAND_R: Vec3 = [-0.33, 0.62, 0.005], HAND_L: Vec3 = [0.27, 0.03, 0.005];
    limb([SH_R, [-0.27, 0.49, 0], HAND_R], 0.012);
    limb([SH_L, [0.25, 0.22, 0], HAND_L], 0.012);
    for (const h of [HAND_R, HAND_L]) blob(m, h, [0.03, 0.034, 0.012], 0, 0.25, bone);
    // Legs: the right out straight and a little splayed, the left's knee fallen open to the side
    const ANKLE_R: Vec3 = [-0.17, -0.5, 0], ANKLE_L: Vec3 = [0.17, -0.45, 0];
    limb([[-0.06, -0.02, 0], [-0.11, -0.26, 0], ANKLE_R], 0.016);
    limb([[0.06, -0.02, 0], [0.23, -0.2, 0], ANKLE_L], 0.016);
    // Feet, flopped outward
    for (const [a, sx] of [[ANKLE_R, -1], [ANKLE_L, 1]] as const) {
      box(m, add(a, [sx * 0.03, -0.02, 0.025]), [0.06, 0.04, 0.05], bone, 0.15);
      blob(m, add(a, [sx * 0.06, -0.04, 0.035]), [0.02, 0.016, 0.014], 0, 0.2, boneDark);
    }

    // ─── Skull: turned to one side, its jaw fallen open, the iron helm knocked askew on it ───
    // Built upright at its own origin (face +z), then turned and set on the neck with the helm (toHead)
    const turn = side * rf(0.8, 1.05);
    const HEAD: Vec3 = [side * 0.02, 0.5, 0.03];
    const toHead = (p: Vec3): Vec3 => add(rotY(rotX(p, -0.15), turn), HEAD);
    frustum(m, [0, 0.42, -0.005], toHead([0, -0.075, -0.01]), 0.012, 0.012, 4, boneDark, { caps: false });
    const skullFrom = m.faces.length;
    blob(m, [0, 0.01, 0], [0.083, 0.093, 0.088], 1, 0.05, bone);
    box(m, [0, -0.065, 0.04], [0.1, 0.04, 0.07], bone, 0.1); // the cheekbones and upper teeth
    box(m, [0, -0.11, 0.05], [0.09, 0.025, 0.065], bone, 0.12); // the jaw, fallen open below them
    for (const sx of [-1, 1]) blob(m, [sx * 0.034, 0.005, 0.078], [0.024, 0.022, 0.014], 0, 0.05, HOLLOW);
    blob(m, [0, -0.04, 0.085], [0.012, 0.016, 0.008], 0, 0.05, HOLLOW); // the nose
    m.xf(skullFrom, toHead);
    // The helm, sized to the skull, knocked askew (pushed back and to the side) on it
    const helmB = buildModel(ironHelm, ITEM_SEED).mesh.bounds;
    const helmS = 0.205 / (helmB.max[0] - helmB.min[0]);
    const helmFrom = m.faces.length;
    embed(m, ironHelm, ITEM_SEED, (p) => toHead(add(rotZ(rotX(p, -0.5), -side * 0.18), [0, 0.05, -0.035])), helmS);
    rust(m, helmFrom);

    // Lay it all down
    m.xf(bodyFrom, lay);

    // ─── The sword: where it fell, on the floor by its right side, the hilt at its outflung hand and the blade
    //     down toward its feet, angled out a little ───
    const gearFrom = m.faces.length;
    const [lo, hi] = extentAlong(buildModel(gladius, ITEM_SEED).mesh, rotZ([0, 1, 0], WEAPON_ROLL));
    const swordS = ((HELD_LENGTH['1h Swords'] ?? 0.5) * H) / (hi - lo);
    const hiltAt = add(lay(HAND_R), [-0.05, 0, 0.04]);
    const swordYaw = yaw + rf(-0.32, -0.18);
    embed(m, gladius, ITEM_SEED, (p) => {
      const flat = rotX(rotZ(p, -WEAPON_ROLL), Math.PI / 2); // its length along +z, lying flat
      return add(rotY(add(flat, [0, 0, -lo * swordS]), swordYaw), [hiltAt[0], 0.012, hiltAt[2]]);
    }, swordS);

    // ─── The shield: face up on the floor by its left side, its point toward its feet ───
    const shieldB = buildModel(kiteShield, ITEM_SEED).mesh.bounds;
    const shieldS = (HELD_SHIELD_HEIGHT * H) / (shieldB.max[1] - shieldB.min[1]);
    const shieldAt = add(lay(HAND_L), [0.1, 0, 0.02]);
    const shieldYaw = Math.PI + yaw + rf(-0.35, -0.1);
    embed(m, kiteShield, ITEM_SEED, (p) => {
      const flat = rotX(p, -Math.PI / 2); // its face up, its top toward -z
      return add(rotY(flat, shieldYaw), [shieldAt[0], -shieldB.min[2] * shieldS + 0.004, shieldAt[2]]);
    }, shieldS);
    rust(m, gearFrom);

    return 'Dead Adventurer';
  },
};

export default design;
