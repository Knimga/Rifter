// Goblin family body, shared by every goblin design (goblin-warrior.ts, goblin-archer.ts): short, short-legged and
// hunched, long arms, grey-green skin, long ears, yellow (unlit) eyes, armor in dark colors with small red accents.
// Each design picks the helmets its goblins can wear and poses the arms (goblinArm) around what they hold.
import type { BuildCtx } from '../core/ctx';
import type { ColorFn, Mesh } from '../core/mesh';
import { blob, box, frustum, loft, ringPts } from '../core/primitives';
import { add, hslRGB, mixC, mulC, type RGB, type Vec3 } from '../core/vec';

export const GOBLIN_IRON: RGB = [64, 64, 70]; // blackened iron
export const GOBLIN_RED: RGB = [150, 38, 32]; // accents: small, so a little saturated
/** A goblin's armor colors (leather: jerkin, belt, bracers; cloth: trousers, flaps), one of each picked per goblin. */
export interface GoblinArmor { leathers: readonly RGB[]; cloths: readonly RGB[] }
/** Dark leathers and cloths, some toward grey. */
export const GOBLIN_ARMOR: GoblinArmor = {
  leathers: [[58, 44, 36], [48, 42, 40], [62, 50, 38]],
  cloths: [[46, 44, 50], [40, 46, 42], [54, 46, 44]],
};
/** The same, tilted toward dark brown. */
export const GOBLIN_ARMOR_BROWN: GoblinArmor = {
  leathers: [[64, 46, 32], [56, 42, 30], [68, 50, 34]],
  cloths: [[54, 44, 36], [48, 42, 34], [60, 46, 38]],
};
const EYE: RGB = [236, 204, 64];

/**
 * What a goblin can wear on its head: nothing; an iron cap with a red band (plain or spiked); a cylindrical iron
 * pot hiding the face, one black slit across its front; or a leather cap with a red band.
 */
export type GoblinHelmet = 'none' | 'cap' | 'spiked' | 'pot' | 'leather';

/** A goblin variant's name by its helmet ('Pot-Helmed'). */
export const HELMET_TITLE: Record<GoblinHelmet, string> = {
  none: 'Bare-Headed', cap: 'Capped', spiked: 'Spike-Helmed', pot: 'Pot-Helmed', leather: 'Leather-Capped',
};

/** A built goblin's body: what its arms (goblinArm) and gear need. */
export interface GoblinBody {
  skin: RGB;
  skinDark: RGB;
  leather: RGB;
  cloth: RGB;
  helmet: GoblinHelmet;
  pauldrons: 'left' | 'right' | 'both' | 'none';
  /** Its pauldrons' size, as a multiple of the usual (default 1). */
  pauldronSize?: number;
  /** Build (width). */
  W: number;
  /** How far the shoulders sit ahead of the hips. */
  hunch: number;
  /** Its eyes, when not the yellow (lit) ones: their color and glow (FaceOpts.e). */
  eye?: { color: RGB; e: number };
}

/** The middle of a goblin's head. */
export const goblinHeadCenter = (b: GoblinBody): Vec3 => [0, 0.9, b.hunch + 0.17];

/**
 * Build a goblin's legs, torso and head (one of `helmets`, picked by the seed), its armor in colors from `armor`,
 * and mark its feet. The arms are the design's (goblinShoulder, goblinArm), posed for what it holds. A goblin
 * dressed differently (a robe) builds the pieces it shows itself: goblinLook, then goblinHead and its own clothes.
 */
export function goblinBody(c: BuildCtx, helmets: readonly GoblinHelmet[], armor: GoblinArmor = GOBLIN_ARMOR): GoblinBody {
  const b = goblinLook(c, helmets, armor);
  goblinLegs(c.mesh, b);
  goblinTorso(c, b);
  goblinHead(c.mesh, b);
  return b;
}

/** A goblin's look, from the seed (its skin, armor colors from `armor`, one of `helmets`, build), and its feet. */
export function goblinLook(c: BuildCtx, helmets: readonly GoblinHelmet[], armor: GoblinArmor = GOBLIN_ARMOR): GoblinBody {
  const { rf } = c;
  const skin = hslRGB(c.ri(84, 104), rf(14, 22), rf(34, 40));
  const skinDark = mixC(skin, [30, 34, 36], 0.4);
  const leather = c.pick(armor.leathers);
  const cloth = c.pick(armor.cloths);
  const helmet = c.pick(helmets);
  const pauldrons = c.pick(['left', 'right', 'both'] as const);
  const W = rf(0.92, 1.08);
  const hunch = rf(0.2, 0.26);
  c.mesh.anchor('feet', [0, 0, 0.02]); // middle of the wide stance: this point goes to the tile center
  return { skin, skinDark, leather, cloth, helmet, pauldrons, W, hunch };
}

/** Short legs in a wide, bent-kneed crouch, cloth trousers and leather knees; bare long-toed feet. */
export function goblinLegs(m: Mesh, b: GoblinBody): void {
  const { W, cloth, leather, skin, skinDark } = b;
  for (const sx of [-1, 1]) {
    const hip: Vec3 = [sx * 0.11 * W, 0.44, 0];
    const knee: Vec3 = [sx * 0.2 * W, 0.25, 0.07];
    const ankle: Vec3 = [sx * 0.2 * W, 0.06, -0.01];
    m.part(sx > 0 ? 'leg_l' : 'leg_r', hip);
    frustum(m, hip, knee, 0.07, 0.055, 6, cloth);
    blob(m, knee, [0.055, 0.055, 0.055], 0, 0.15, leather);
    frustum(m, knee, ankle, 0.05, 0.04, 5, skin);
    box(m, add(ankle, [sx * 0.01, -0.025, 0.06]), [0.09, 0.05, 0.17], skinDark, 0.25);
  }
}

/**
 * Hunched torso: hips -> belly -> shoulders pushed forward, a hump over the back. Leather jerkin, lighter on top
 * where the light falls; a belt with a red sash hanging from it, and tattered cloth flaps.
 */
export function goblinTorso(c: BuildCtx, b: GoblinBody): void {
  const m = c.mesh;
  const { W, hunch, leather, cloth } = b;
  m.part('torso', [0, 0.45, 0]);
  const jerkin: ColorFn = (_, n) => (n[1] > 0.45 ? mulC(leather, 1.25) : leather);
  loft(m, [
    ringPts([0, 0.4, 0], [0, 1, 0], 0.15 * W, 7),
    ringPts([0, 0.58, hunch * 0.3], [0, 1, 0], 0.18 * W, 7),
    ringPts([0, 0.78, hunch * 0.75], [0, 1, 0], 0.2 * W, 7),
    ringPts([0, 0.86, hunch], [0, 1, 0], 0.14 * W, 7),
  ], jerkin);
  blob(m, [0, 0.8, hunch * 0.45 - 0.07], [0.19 * W, 0.15, 0.14], 0, 0.15, jerkin); // the hump
  frustum(m, [0, 0.43, 0], [0, 0.5, 0.01], 0.165 * W, 0.17 * W, 7, mulC(leather, 0.7)); // belt
  box(m, [0.05 * W, 0.46, 0.17 * W], [0.05, 0.05, 0.03], GOBLIN_IRON, 0.1); // buckle
  box(m, [-0.1 * W, 0.34, 0.13 * W], [0.05, 0.16, 0.02], GOBLIN_RED, 0.2); // sash end
  for (const [x, z] of [[-0.06, 0.13], [0.07, 0.12], [0, -0.14], [0.12, -0.06]] as const)
    box(m, [x * W, 0.35, z * W], [0.08, 0.13, 0.02], mulC(cloth, c.rf(0.85, 1.1)), 0.25);
}

/**
 * Head, with its helmet: low and thrust forward from the hump, a long pointed nose, a heavy brow over yellow eyes
 * (lit, no glow; or the body's own `eye`), long ears sweeping out to the sides.
 */
export function goblinHead(m: Mesh, b: GoblinBody): void {
  const { hunch, helmet, skin, skinDark, leather } = b;
  const neck: Vec3 = [0, 0.86, hunch + 0.06];
  m.part('head', neck);
  const hc = goblinHeadCenter(b);
  for (const sx of [-1, 1]) frustum(m, add(hc, [sx * 0.1, 0.01, -0.01]), add(hc, [sx * 0.3, 0.06, -0.07]), 0.04, 0.005, 4, skin);
  if (helmet === 'pot') {
    // A cylindrical iron pot enclosing the whole head (the face is hidden, so not built), one black slit across
    // the front at eye level; the ears stick out through its sides
    const pc = add(hc, [0, 0, 0.02]), r = 0.15;
    frustum(m, add(pc, [0, -0.12, 0]), add(pc, [0, 0.12, 0]), r, r * 0.97, 10, (_, n) => (n[1] > 0.5 ? mulC(GOBLIN_IRON, 1.2) : GOBLIN_IRON));
    frustum(m, add(pc, [0, -0.125, 0]), add(pc, [0, -0.09, 0]), r * 1.06, r * 1.06, 10, mulC(GOBLIN_IRON, 0.8)); // bottom rim
    box(m, add(pc, [0, 0.01, r * 0.97]), [0.13, 0.024, 0.03], [12, 12, 14], 0, { j: 0 }); // eye slit
  } else {
    blob(m, hc, [0.12, 0.11, 0.12], 1, 0.1, skin);
    box(m, add(hc, [0, -0.06, 0.08]), [0.13, 0.05, 0.09], skinDark, 0.2); // jaw
    box(m, add(hc, [0, 0.035, 0.1]), [0.17, 0.035, 0.05], skinDark, 0.15); // brow
    frustum(m, add(hc, [0, 0, 0.1]), add(hc, [0, -0.04, 0.2]), 0.03, 0.006, 4, skin); // nose
    for (const sx of [-1, 1]) blob(m, add(hc, [sx * 0.05, 0.005, 0.11]), [0.032, 0.021, 0.014], 0, 0.05, b.eye?.color ?? EYE, { j: 0.05, ...(b.eye ? { e: b.eye.e } : {}) });
  }
  if (helmet === 'cap' || helmet === 'spiked' || helmet === 'leather') {
    const capColor = helmet === 'leather' ? mulC(leather, 0.85) : GOBLIN_IRON;
    blob(m, add(hc, [0, 0.05, -0.01]), [0.125, 0.08, 0.13], 0, 0.08, capColor, { floorY: hc[1] + 0.02 });
    frustum(m, add(hc, [0, 0.035, -0.01]), add(hc, [0, 0.055, -0.01]), 0.13, 0.128, 8, GOBLIN_RED); // red band
    if (helmet === 'spiked') frustum(m, add(hc, [0, 0.11, -0.01]), add(hc, [0, 0.21, -0.03]), 0.03, 0.004, 5, GOBLIN_IRON);
  }
}

/** Where a goblin's shoulder is (`sx`: 1 left, -1 right). */
export const goblinShoulder = (b: GoblinBody, sx: 1 | -1): Vec3 => [sx * 0.2 * b.W, 0.86, b.hunch];

/**
 * One long goblin arm, from its shoulder through `elbow` to the fist at `hand` (`sx`: 1 left, -1 right): bare
 * upper arm, a leather bracer on the forearm (or, with `sleeve`, the whole arm in that cloth), a blackened-iron
 * pauldron with a red rim if its body has one on that side. Marks hand_l / hand_r.
 */
export function goblinArm(m: Mesh, b: GoblinBody, sx: 1 | -1, elbow: Vec3, hand: Vec3, sleeve?: RGB | ColorFn): void {
  const sh = goblinShoulder(b, sx);
  m.part(sx > 0 ? 'arm_l' : 'arm_r', sh);
  blob(m, sh, [0.07, 0.07, 0.07], 0, 0.15, sleeve ?? b.skin);
  frustum(m, sh, elbow, 0.05, 0.04, 5, sleeve ?? b.skin);
  blob(m, elbow, [0.042, 0.042, 0.042], 0, 0.15, sleeve ?? b.skin);
  frustum(m, elbow, hand, 0.045, 0.04, 5, sleeve ?? b.leather);
  blob(m, hand, [0.045, 0.045, 0.045], 0, 0.2, b.skinDark);
  if (b.pauldrons === 'both' || b.pauldrons === (sx > 0 ? 'left' : 'right')) {
    const k = b.pauldronSize ?? 1;
    blob(m, add(sh, [sx * 0.02 * k, 0.03 * k, 0]), [0.09 * k, 0.06 * k, 0.09 * k], 0, 0.1, GOBLIN_IRON, { floorY: sh[1] - 0.01 });
    frustum(m, add(sh, [sx * 0.02 * k, 0.0, 0]), add(sh, [sx * 0.02 * k, 0.012 * k, 0]), 0.092 * k, 0.09 * k, 7, GOBLIN_RED);
  }
  m.anchor(sx > 0 ? 'hand_l' : 'hand_r', hand);
}
