// Shared by player-character (class) designs: identity from the class data, and a lean humanoid body
// (legs, boots, hips, arms, hands, neck, head) that each class dresses in its own clothing and hair.
// Files starting with "_" are NOT registered as designs.
//
// Pose: relaxed standing. Feet a little wider than the hips with the toes turned out, knees slightly
// bent, arms angled out from the shoulders and hanging loosely, forearms a little forward. Built in local
// units with the feet at y = 0 and the top of the head near y = 1.73 (finalize scales to CHARACTER_HEIGHT).
// Balanced proportions: legs a little under half the height, a head about 1/7 of it.
// Faces +z; the character's left is +x. Marks the anchors held gear attaches to (see src/forge/equip.ts):
//   hand_r    center of the right fist (main hand)
//   elbow_r   the right elbow (gives the sword forearm's direction)
//   forearm_l middle of the left forearm (shield strap)
//   elbow_l   the left elbow (gives the forearm's direction)
//   hand_l    the left fist, in the bow and crossbow holds
//   shoulder_rest_r  the top of the right shoulder, in the shoulder-carry hold
// The arms' pose follows the build's `hold` (see Hold), which follows the equipped weapon.
import type { DataRef } from '../core/types';
import type { Mesh } from '../core/mesh';
import { slug } from '../core/slug';
import { blob, box, frustum, loft } from '../core/primitives';
import { add, cross, mul, mulC, norm, rotX, rotY, sub, type RGB, type Vec3 } from '../core/vec';
import { CLASSES, type ClassKey } from '../../data/units/classes';
import type { WeaponType } from '../../data/gear/types';
import { band, ell } from './_armor';

/** Identity of a class's character design: label = the class name, id = 'character.' + slug(name). */
export function classEntry(classKey: ClassKey): { id: string; label: string; source: DataRef } {
  const c = CLASSES[classKey];
  return { id: `character.${slug(c.name)}`, label: c.name, source: { table: 'classes', key: classKey } };
}

export interface BodyLook {
  skin: RGB;
  pants: RGB;
  boots: RGB;
  sleeves: RGB;
  gloves: RGB;
}

const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, mul(sub(b, a), t));

/** Joint positions of one leg (local units). */
export interface Leg {
  hip: Vec3;
  knee: Vec3;
  ankle: Vec3;
}

/**
 * Heights of the torso's landmarks (local units), for classes to fit clothing and armor to:
 * hip (top of the legs), waist, chest (broadest), shoulder (shoulder joints), collar (base of the neck).
 */
export const TORSO = { hip: 0.86, waist: 1.0, chest: 1.18, shoulder: 1.34, collar: 1.43 };

/** Left (+1) or right (-1) leg of the standard pose: spread a little, knee slightly bent forward. */
export function legJoints(sx: 1 | -1): Leg {
  return { hip: [sx * 0.1, TORSO.hip, 0], knee: [sx * 0.13, 0.47, 0.05], ankle: [sx * 0.16, 0.1, 0] };
}

/** Joint positions of one arm (local units), so a class can layer armor over it. */
export interface Arm {
  shoulder: Vec3;
  elbow: Vec3;
  wrist: Vec3;
  fist: Vec3;
}

/**
 * How far the right (sword) arm swings back from the shoulder, in radians: the whole arm turns as one
 * piece, so the elbow moves back while its bend stays the same. Neither arm segment ends up vertical.
 */
export const SWORD_ARM_SWING = 0.3;

/**
 * A class's build, on top of the standard body. Every field is optional; the defaults are the Knight's
 * (and Rogue's) build.
 */
export interface BodyBuild {
  /** Half-width between the shoulder joints (default 0.225). Broader shoulders move the arms out. */
  shoulderX?: number;
  /** Arm thickness multiplier (default 1). */
  arms?: number;
  /** Boot thickness multiplier (default 1); above ~1.1 the boots are thicker than the legs. */
  boots?: number;
  /** How the arms hold the equipped weapon (default 'oneHand'); see Hold. */
  hold?: Hold;
}

/**
 * How a character holds its weapon. It follows the equipped weapon type (HOLD_FOR), not the class:
 *  oneHand        right arm swung back, forearm forward, the weapon held out in front (Knight, Rogue);
 *                 the left arm hangs, a shield strapped to its forearm
 *  staff          right elbow bent ~90°, gripping a planted walking staff (Arcanist)
 *  shoulderCarry  right fist in front of the shoulder, a two-hander resting on the shoulder (Brute)
 *  bow            bow low in front in the left hand, the right hand on the string (Archer)
 *  crossbow       both hands, low in front: left hand under the stock, right hand on the trigger end,
 *                 the bolt line pointing forward and down
 */
export type Hold = 'oneHand' | 'staff' | 'shoulderCarry' | 'bow' | 'crossbow';

export const HOLD_FOR: Record<WeaponType, Hold> = {
  '1h Swords': 'oneHand', '1h Maces': 'oneHand', '1h Axes': 'oneHand', 'Daggers': 'oneHand', 'Wands': 'oneHand',
  'Staves': 'staff',
  '2h Swords': 'shoulderCarry', '2h Maces': 'shoulderCarry', '2h Axes': 'shoulderCarry',
  'Bows': 'bow',
  'Crossbows': 'crossbow',
};

/** Display names of the holds (forge rows). */
export const HOLD_LABEL: Record<Hold, string> = {
  oneHand: 'One-hand', staff: 'Staff', shoulderCarry: 'Shoulder carry', bow: 'Bow', crossbow: 'Crossbow',
};

/**
 * The hold a class design builds with: the one the build asks for (c.hold, set from the member's
 * equipped weapon), else the hold of the class's starting weapon.
 */
export function classHold(c: { hold?: string }, classKey: ClassKey): Hold {
  return (c.hold as Hold | undefined) ?? HOLD_FOR[CLASSES[classKey].startingGear.weapon];
}

/** Shoulder carry: the haft's angle above horizontal, and how far in front of the shoulder rest the fist holds it (local units). */
const CARRY_ANGLE = (30 * Math.PI) / 180;
const CARRY_REACH = 0.45; // puts the shoulder at about the middle of a two-hander's haft
const UPPER_ARM = 0.225; // segment length used to place the elbow

/** Top of the right shoulder, where a carried two-hander rests (shoulder-carry pose). */
function carryRest(shoulder: Vec3, build: BodyBuild): Vec3 {
  return add(shoulder, [0.01, 0.075 * (build.arms ?? 1) + 0.03, -0.02]);
}

/** An elbow for a shoulder and wrist: halfway between them, pushed out along `dir` by as much as the arm's length needs. */
function bendElbow(shoulder: Vec3, wrist: Vec3, dir: Vec3): Vec3 {
  const half = Math.hypot(...sub(wrist, shoulder)) / 2;
  return add(lerp(shoulder, wrist, 0.5), mul(norm(dir), Math.sqrt(Math.max(0, UPPER_ARM ** 2 - half ** 2))));
}

/**
 * The bow hold's pose, shared with src/forge/equip.ts which places the bow to match:
 * the left fist holds the grip low in front of the body; the bow's arrow line (from string through grip)
 * points forward and down toward the ground; its limbs are perpendicular to that, canted ~30° from
 * horizontal across the front of the body, higher on the right (-x) than the left. The bow is then
 * rolled BOW_ROLL about its limbs so the string sits lower (the arrow line points less steeply down).
 * The string runs BOW_BRACE behind the grip (local units), and the right hand touches it a little to the
 * right of center. The bow is held far enough out in front that the right hand and wrist stay clear of
 * the torso.
 */
export const BOW_LIMBS: Vec3 = norm(add(mul([-1, 0, 0], 0.866), mul(norm([0, 0.866, 0.5]), 0.5)));
const BOW_ROLL = (10 * Math.PI) / 180;
const ARROW_UNROLLED: Vec3 = norm([0, -0.5, 0.866]); // forward and 30° down
export const BOW_ARROW: Vec3 = norm(add(mul(ARROW_UNROLLED, Math.cos(BOW_ROLL)), mul(cross(BOW_LIMBS, ARROW_UNROLLED), Math.sin(BOW_ROLL))));
// Grip position: toward the centerline, and checked so the string touches only the right fist (clear of
// both forearms, the left upper arm and the torso) with the left arm within reach
const BOW_FIST: Vec3 = [0.08, 1.04, 0.34];
const BOW_BRACE = 0.185; // grip to string, as the shortbow builds at its held size

/**
 * The crossbow-holding pose, shared with src/forge/equip.ts which places the crossbow to match: held
 * across the body, pointing low and to the left (CROSSBOW_AXIS: mostly across, a little forward and
 * down), not straight ahead. The right fist holds the trigger (the crossbow's grip) in front of the right
 * hip; the left fist cradles the stock toward its middle, CROSSBOW_SPAN along it and just below. The
 * crossbow's top faces CROSSBOW_UP (as near straight up as the tilt allows).
 */
export const CROSSBOW_AXIS: Vec3 = norm([0.8, -0.25, 0.5]);
export const CROSSBOW_UP: Vec3 = norm(sub([0, 1, 0], mul(CROSSBOW_AXIS, CROSSBOW_AXIS[1])));
const CROSSBOW_RIGHT_FIST: Vec3 = [-0.06, 1.13, 0.19];
const CROSSBOW_SPAN = 0.22;
const CROSSBOW_LEFT_FIST: Vec3 = sub(add(CROSSBOW_RIGHT_FIST, mul(CROSSBOW_AXIS, CROSSBOW_SPAN)), mul(CROSSBOW_UP, 0.05));
// Checked (with the crossbow at its held size) to clear the torso, both upper arms and the legs
const CROSSBOW_RIGHT_ELBOW: Vec3 = [-0.95, -0.3, 0];

/** Left (+1) or right (-1) arm for a build (default: the standard pose). */
export function armJoints(sx: 1 | -1, build: BodyBuild = {}): Arm {
  const out = (build.shoulderX ?? 0.225) - 0.225; // broader shoulders: the whole arm moves out
  const shoulder: Vec3 = [sx * (0.225 + out), TORSO.shoulder, 0];
  const hold = build.hold ?? 'oneHand';
  if (sx > 0 && hold === 'crossbow') {
    // Cradling the stock from below, toward its middle; the elbow drops low and a little forward
    const fist = CROSSBOW_LEFT_FIST;
    const wrist = sub(fist, [-0.01, -0.02, 0.04]);
    return { shoulder, elbow: bendElbow(shoulder, wrist, [0.55, -0.75, 0.25]), wrist, fist };
  }
  if (sx < 0 && hold === 'crossbow') {
    // On the trigger, in front of the right hip; the elbow out to the side, so the upper arm stays clear
    // of the stock's butt (which runs back toward the right side)
    const fist = CROSSBOW_RIGHT_FIST;
    const wrist = sub(fist, [-0.02, 0.01, 0.04]);
    return { shoulder, elbow: bendElbow(shoulder, wrist, CROSSBOW_RIGHT_ELBOW), wrist, fist };
  }
  if (sx < 0 && hold === 'shoulderCarry') {
    // The fist holds the haft out in front, on the line that rises at CARRY_ANGLE back over the shoulder;
    // the elbow hangs out and down between shoulder and wrist (a fairly open bend)
    const rest = carryRest(shoulder, build);
    const fist = add(rest, [0, -Math.sin(CARRY_ANGLE) * CARRY_REACH, Math.cos(CARRY_ANGLE) * CARRY_REACH]);
    const wrist = sub(fist, [0.005, 0.02, 0.04]);
    return { shoulder, elbow: bendElbow(shoulder, wrist, [-0.6, -0.8, 0]), wrist, fist };
  }
  if (sx > 0 && hold === 'bow') {
    // Holding the bow's grip low in front of the body, toward the centerline; the elbow drops low and a
    // little forward, so the forearm meets the grip from below, clear of the string behind it
    const fist = BOW_FIST;
    const wrist = sub(fist, [-0.01, -0.01, 0.04]);
    return { shoulder, elbow: bendElbow(shoulder, wrist, [0.55, -0.75, 0.25]), wrist, fist };
  }
  if (sx < 0 && hold === 'bow') {
    // The string rests on top of the fingers, a little to the right of its middle (toward the raised
    // limb): the fist sits just under it, so the forearm comes up from below without crossing it
    const onString = add(sub(BOW_FIST, mul(BOW_ARROW, BOW_BRACE)), mul(BOW_LIMBS, 0.1));
    const fist = add(onString, [0, -0.05, 0]);
    const wrist = sub(fist, [0.03, 0.02, 0.03]);
    // Elbow out and slightly forward, so the forearm comes around the torso rather than through it
    return { shoulder, elbow: bendElbow(shoulder, wrist, [-0.75, -0.55, 0.3]), wrist, fist };
  }
  if (sx < 0 && hold === 'staff') {
    // Upper arm hanging down (a little out), forearm level and forward: a right angle at the elbow
    const elbow: Vec3 = [-(0.26 + out), TORSO.shoulder - 0.26, -0.02];
    const wrist: Vec3 = [-(0.27 + out), TORSO.shoulder - 0.25, 0.2];
    return { shoulder, elbow, wrist, fist: add(wrist, [0.003, 0, 0.05]) };
  }
  const elbow: Vec3 = [sx * (0.29 + out), TORSO.shoulder - 0.28, -0.01];
  const wrist: Vec3 = [sx * (0.315 + out), TORSO.shoulder - 0.49, 0.11];
  const fist = add(wrist, [sx * 0.008, -0.03, 0.05]);
  if (sx > 0) return { shoulder, elbow, wrist, fist };
  // Sword arm: swung back about the shoulder
  const swing = (p: Vec3) => add(shoulder, rotX(sub(p, shoulder), SWORD_ARM_SWING));
  return { shoulder, elbow: swing(elbow), wrist: swing(wrist), fist: swing(fist) };
}

/** Head center and half-sizes of the standard body (for hair and helmets); the crown is at center.y + ry. */
export const HEAD = { center: [0, 1.6, 0.005] as Vec3, rx: 0.097, ry: 0.125, rz: 0.11 };

/** Horizontal rounded-square ring (a superellipse) at height y: squarish sides with rounded corners. */
function squircle(y: number, rx: number, rz: number, cz = 0, n = 12, roundness = 3): Vec3[] {
  const p: Vec3[] = [];
  const e = 2 / roundness;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    p.push([Math.sign(c) * Math.abs(c) ** e * rx, y, cz + Math.sign(s) * Math.abs(s) ** e * rz]);
  }
  return p;
}

/**
 * A lean humanoid in the standard pose, without torso clothing (the class adds that over the hips,
 * between y ~0.95 and ~1.62) or hair. The head has a squared jaw and no face details. `build` adjusts
 * shoulders, arms, boots and the right arm's pose (see BodyBuild).
 * Marks feet, hand_r, elbow_r, forearm_l and elbow_l, and shoulder_rest_r in the shoulder-carry pose
 * (the top of the right shoulder, where a carried two-hander rests).
 */
export function buildBody(m: Mesh, look: BodyLook, build: BodyBuild = {}): void {
  m.anchor('feet', [0, 0, 0.03]);
  const boot = build.boots ?? 1, arm = build.arms ?? 1;

  // Legs: trousers from the hip to below the knee, then boots; feet turned a little outward
  for (const sx of [-1, 1] as const) {
    const { hip, knee, ankle } = legJoints(sx);
    m.part(sx > 0 ? 'leg_l' : 'leg_r', hip);
    const bootTop = lerp(ankle, knee, 0.75);
    frustum(m, hip, knee, 0.095, 0.078, 6, look.pants); // thigh
    frustum(m, knee, bootTop, 0.075, 0.07, 6, look.pants); // shin
    frustum(m, bootTop, [ankle[0], 0.04, ankle[2]], 0.08 * boot, 0.077 * boot, 6, look.boots); // boot shaft
    const s0 = m.faces.length;
    box(m, [0, 0, 0.07], [0.12 * boot, 0.1, 0.26], look.boots, 0.08); // foot, built pointing forward...
    m.xf(s0, (p) => add(rotY(p, sx * 0.28), [ankle[0], 0.05, ankle[2]])); // ...then turned out
  }
  // Hips: rounded (not a box), and kept inside the torso's lowest ring (rx 0.165, rz 0.105) so any
  // clothing or armor a class fits to TORSO.hip covers them without the trousers poking through
  m.part('hips', [0, TORSO.hip, 0]);
  loft(m, [ell(TORSO.hip + 0.07, 0.135, 0.085), ell(TORSO.hip - 0.07, 0.148, 0.092)], look.pants);

  // Arms: sleeves from the shoulder to the wrist, gloved fists
  for (const sx of [-1, 1] as const) {
    const a = armJoints(sx, build);
    m.part(sx > 0 ? 'arm_l' : 'arm_r', a.shoulder);
    frustum(m, a.shoulder, a.elbow, 0.056 * arm, 0.05 * arm, 6, look.sleeves);
    blob(m, a.elbow, [0.05 * arm, 0.05 * arm, 0.05 * arm], 0, 0, look.sleeves);
    frustum(m, a.elbow, a.wrist, 0.05 * arm, 0.044 * arm, 6, look.sleeves);
    blob(m, a.fist, [0.05 * arm, 0.055 * arm, 0.055 * arm], 0, 0.06, look.gloves); // fist
  }
  const right = armJoints(-1, build), left = armJoints(1, build);
  m.anchor('hand_r', right.fist);
  m.anchor('elbow_r', right.elbow);
  m.anchor('forearm_l', lerp(left.elbow, left.wrist, 0.5));
  m.anchor('elbow_l', left.elbow);
  if (build.hold === 'bow' || build.hold === 'crossbow') m.anchor('hand_l', left.fist);
  if (build.hold === 'shoulderCarry') m.anchor('shoulder_rest_r', carryRest(right.shoulder, build));

  // Short neck, and a human head shape: rounded-square slices from a rounded chin, out along the jaw
  // to the cheekbones and temples, then rounding in over the crown. No face details.
  m.part('head', [0, TORSO.collar, 0]);
  frustum(m, [0, TORSO.collar - 0.04, 0], [0, HEAD.center[1] - 0.08, 0.005], 0.058, 0.055, 6, look.skin);
  const { center: h, rx, ry, rz } = HEAD;
  const slice = (dy: number, sx: number, sz: number, dz: number, round: number) =>
    squircle(h[1] + dy * ry, rx * sx, rz * sz, h[2] + dz, 12, round);
  const head = [
    slice(-1.0, 0.45, 0.5, 0.03, 3.2), // chin
    slice(-0.72, 0.8, 0.88, 0.02, 3.4), // jaw
    slice(-0.3, 0.97, 1.0, 0.01, 3.0), // cheekbones
    slice(0.2, 1.0, 1.0, 0, 2.6), // temples
    slice(0.65, 0.82, 0.88, -0.005, 2.2), // upper skull
    slice(0.92, 0.42, 0.5, -0.01, 2.0), // crown
  ];
  loft(m, head, look.skin);
}

/**
 * Short spiky hair: a close cap over the crown and back of the head, with spikes standing up and
 * swept forward. `rf` jitters the spikes (pass the build context's rf).
 */
export function spikyHair(m: Mesh, color: RGB, rf: (a: number, b: number) => number): void {
  const { center: h, rx, ry, rz } = HEAD;
  m.part('hair', h);
  blob(m, add(h, [0, ry * 0.3, -0.012]), [rx * 1.1, ry * 0.8, rz * 1.12], 1, 0.05, color, { floorY: h[1] + ry * 0.1 }); // cap
  blob(m, add(h, [0, ry * 0.05, -0.05]), [rx * 1.05, ry * 0.9, rz * 0.82], 1, 0.05, color, { floorY: h[1] - ry * 0.55 }); // back
  // A few thick, short spikes standing up and swept forward: two behind, three in front
  const sweep = norm([0, 1, 0.75]);
  const rows: [number, number, number][] = [[-0.045, 0.85, 2], [0.025, 0.85, 3]]; // [z offset, height above center (x ry), count]
  for (const [dz, dy, n] of rows) {
    for (let i = 0; i < n; i++) {
      const x = (-1 + (2 * i) / (n - 1)) * rx * (n === 2 ? 0.35 : 0.6);
      const base: Vec3 = add(h, [x, dy * ry, dz]);
      const dir = norm(add(sweep, [x * 1.5, 0, 0])); // outer spikes fan out a little
      frustum(m, base, add(base, mul(dir, rf(0.07, 0.09))), 0.052, 0.006, 4, color);
    }
  }
}

/**
 * Hair pulled back into a ponytail: smooth over the crown and back of the head, gathered by a tie at
 * the back, and a tail hanging down behind the neck.
 */
export function ponytailHair(m: Mesh, color: RGB, tie: RGB): void {
  const { center: h, rx, ry, rz } = HEAD;
  m.part('hair', h);
  // Wide enough to cover the head's squarish temples (no skin poking through), hairline at the front
  blob(m, add(h, [0, ry * 0.28, 0.002]), [rx * 1.17, ry * 0.84, rz * 1.2], 1, 0.02, color, { floorY: h[1] + ry * 0.12 }); // crown, swept back
  blob(m, add(h, [0, ry * 0.05, -0.04]), [rx * 1.12, ry * 0.92, rz * 0.9], 1, 0.02, color, { floorY: h[1] - ry * 0.45 }); // back
  const knot: Vec3 = add(h, [0, ry * 0.05, -rz * 1.02]);
  frustum(m, add(knot, [0, 0, 0.018]), add(knot, [0, -0.005, -0.03]), 0.034, 0.03, 6, tie); // tie
  // The tail: out from the tie, then hanging down the back of the neck, tapering
  const p1 = add(knot, [0, -0.02, -0.05]);
  const p2 = add(p1, [0, -0.12, -0.02]);
  const p3 = add(p2, [0, -0.12, 0.015]);
  frustum(m, add(knot, [0, 0, -0.02]), p1, 0.034, 0.038, 6, color, { caps: false });
  frustum(m, p1, p2, 0.038, 0.03, 6, color, { caps: false });
  frustum(m, p2, p3, 0.03, 0.01, 6, color);
}

// ─── Clothing ─────────────────────────────────────────────────────────────────

export interface CuirassLook {
  plate: RGB;
  /** Rolled collar edge (and the center ridge, if any). */
  edge: RGB;
  /** The upper of the two skirt lames (the lower one is `plate`). */
  faulds: RGB;
  belt: RGB;
  buckle: RGB;
}

/**
 * A fitted cuirass from the hips to the collar, a little broader at the chest, with a rolled collar
 * edge, an optional center ridge, a short skirt of two lames below the belt (flaring wide enough to clear
 * the tops of the thighs), and a belt with a buckle. Plate for the Knight, hardened leather for others.
 */
export function cuirass(m: Mesh, look: CuirassLook, ridge: boolean): void {
  const T = TORSO;
  m.part('torso', [0, T.waist, 0]);
  loft(m, [ell(T.hip, 0.168, 0.11), ell(T.waist, 0.165, 0.106), ell(T.chest, 0.198, 0.126), ell(T.shoulder + 0.01, 0.212, 0.13), ell(T.collar, 0.15, 0.1)], look.plate);
  band(m, T.collar + 0.02, T.collar - 0.04, 0.152, 0.102, 0.158, 0.106, look.edge); // rolled collar edge
  if (ridge) box(m, [0, (T.waist + T.collar) / 2, 0.124], [0.026, (T.collar - T.waist) * 0.85, 0.02], look.edge); // center ridge
  band(m, T.hip + 0.02, T.hip - 0.08, 0.2, 0.13, 0.225, 0.145, look.faulds);
  band(m, T.hip - 0.07, T.hip - 0.16, 0.225, 0.145, 0.245, 0.158, look.plate);
  band(m, T.hip + 0.07, T.hip + 0.01, 0.173, 0.113, 0.175, 0.115, look.belt);
  box(m, [0, T.hip + 0.04, 0.116], [0.05, 0.045, 0.014], look.buckle);
}

/** A small domed pauldron capping the shoulder joint at `shoulder`. */
export function pauldron(m: Mesh, shoulder: Vec3, color: RGB): void {
  blob(m, [shoulder[0] * 1.04, shoulder[1] + 0.03, 0], [0.085, 0.07, 0.1], 1, 0, color, { floorY: shoulder[1] - 0.015 });
}

/**
 * A slim fitted leather jerkin up to the collar, flaring out from the waist into a short hem that sits
 * over the tops of the thighs (so the trousers never poke through), with a belt and a small buckle.
 */
export function fittedJerkin(m: Mesh, leather: RGB, belt: RGB, buckle: RGB): void {
  const T = TORSO;
  m.part('torso', [0, T.waist, 0]);
  loft(m, [ell(T.hip - 0.1, 0.228, 0.146), ell(T.hip + 0.02, 0.208, 0.134), ell(T.waist, 0.155, 0.1), ell(T.chest, 0.175, 0.11), ell(T.shoulder + 0.01, 0.19, 0.115), ell(T.collar, 0.13, 0.09)], leather);
  band(m, T.hip + 0.06, T.hip + 0.01, 0.158, 0.104, 0.16, 0.105, belt);
  box(m, [0.03, T.hip + 0.035, 0.105], [0.04, 0.04, 0.012], buckle);
}

/**
 * A shawl draped over the shoulders and capping the tops of the arms, gathered around the neck. With
 * `coversFace` it is pulled up over the mouth to just below the nose; otherwise it ends in a gathered
 * collar under the chin. 12-sided rings with room to spare, so the head's squarish jaw never pokes through.
 */
export function shawl(m: Mesh, color: RGB, coversFace: boolean): void {
  const T = TORSO;
  m.part('shawl', [0, T.collar, 0]);
  const [hx, hy, hz] = HEAD.center;
  const N = 12;
  const rings = [
    ell(T.shoulder - 0.1, 0.325, 0.165, N), // lower edge, over chest, back and upper arms
    ell(T.shoulder + 0.045, 0.3, 0.152, N), // capping the shoulders and arm tops
    ell(T.collar + 0.03, 0.135, 0.112, N), // gathered around the neck
  ];
  if (coversFace) {
    rings.push(ell(hy - HEAD.ry * 0.62, 0.112, 0.13, N, hx, hz + 0.02)); // around the jaw and mouth
    rings.push(ell(hy - HEAD.ry * 0.18, 0.118, 0.136, N, hx, hz + 0.015)); // top edge, just below the nose
  } else {
    rings.push(ell(T.collar + 0.075, 0.13, 0.108, N)); // a soft collar under the chin
  }
  loft(m, rings, color, { caps: false });
}

// ─── Hoods ────────────────────────────────────────────────────────────────────

export interface HoodLook {
  cloth: RGB;
  /** The hood's dark interior around the face. */
  lining: RGB;
  /** Edging around the face opening. */
  trim: RGB;
}

/**
 * A hood pushed back: a soft cowl gathered around the neck, and the empty hood hanging behind the head:
 * a tapering cone whose wide base is gathered at the back of the collar (blending into the shoulders)
 * and whose point hangs back and down, with trim along the top edge of its opening.
 */
export function hoodDown(m: Mesh, look: HoodLook): void {
  m.part('hood', [0, TORSO.collar, 0]);
  loft(m, [ell(TORSO.collar - 0.03, 0.19, 0.14, 12), ell(TORSO.collar + 0.03, 0.165, 0.125, 12), ell(TORSO.collar + 0.07, 0.145, 0.112, 12)], look.cloth, { caps: false });

  // The hanging hood, built along its own axis D (back and down from the collar), X across, Y its "up"
  const base: Vec3 = [0, TORSO.collar - 0.05, -0.1];
  const D = norm([0, -0.55, -1]), X: Vec3 = [1, 0, 0], Y = norm([0, 1, -0.55]);
  const at = (x: number, y: number, z: number): Vec3 => add(base, add(add(mul(X, x), mul(Y, y)), mul(D, z)));
  const ring = (z: number, rx: number, ry: number): Vec3[] =>
    Array.from({ length: 8 }, (_, i) => { const t = (i / 8) * Math.PI * 2; return at(Math.cos(t) * rx, Math.sin(t) * ry, z); });
  const r0 = ring(0, 0.18, 0.1), r1 = ring(0.13, 0.12, 0.072);
  loft(m, [r0, r1], look.cloth, { caps: false });
  const apex = at(0, -0.015, 0.3);
  const mid = at(0, 0, 0.13);
  for (let i = 0; i < 8; i++) m.tri(apex, r1[i], r1[(i + 1) % 8], look.cloth, mid);
  // Trim along the upper edge of the opening (the ring's top half)
  for (let i = 0; i < 4; i++) frustum(m, r0[i], r0[i + 1], 0.013, 0.013, 4, look.trim);
}

/**
 * A hood up over the head, flowing down into the shawl at the neck: cloth, not a ball. It's built around
 * the face: rings of points step outward from the face opening (an oval framing the face, a little taller
 * than wide, tipped slightly down) over the crown and sides to a point at the back of the head. The shell
 * stands off the head, peaks a little up and back like a real hood, and below the jaw drops to the collar
 * and widens into the shawl's neck. A rolled lip runs around the opening, standing a little forward of the
 * face, and a dark lining just inside it hides the gap between hood and head. `look.trim` colors the lip.
 */
export function hoodUp(m: Mesh, look: HoodLook): void {
  m.part('hood', HEAD.center);
  const { center: h, rx, ry, rz } = HEAD;
  const N = 14, K = 5; // points around each ring; rings from the opening to the back
  // The face axis (straight out of the face, tipped a little down) and the two directions across it
  const F = norm([0, -0.15, 1]);
  const V: Vec3 = [1, 0, 0];
  const U = norm(cross(F, V));
  // The opening's edge: how far (radians from the face axis) it reaches, in each direction around it
  const HALF_W = 0.78, HALF_H = 0.98;
  const openAt = (t: number) => 1 / Math.hypot(Math.cos(t) / HALF_W, Math.sin(t) / HALF_H);
  const smooth = (e0: number, e1: number, x: number) => { const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return k * k * (3 - 2 * k); };

  /** The hood's surface in direction `dir` from the head's center. */
  const surface = (dir: Vec3): Vec3 => {
    // Standing off the head (cloth with room inside)
    let p: Vec3 = add(h, [dir[0] * rx * 1.3, dir[1] * ry * 1.2, dir[2] * rz * 1.28]);
    // A soft peak up and back
    const peak = Math.max(0, dir[1]) * Math.max(0, -dir[2]);
    p = add(p, [0, peak * 0.035, -peak * 0.045]);
    // Below the jaw: dropping to the collar and widening into the shawl's neck
    const drape = smooth(-0.35, -0.9, dir[1]);
    if (drape > 0) {
      p = [p[0] * (1 + 0.3 * drape), p[1] + (TORSO.collar + 0.03 - p[1]) * drape, h[2] + (p[2] - h[2]) * (1 + 0.15 * drape)];
    }
    return p;
  };
  const dirAt = (rho: number, t: number): Vec3 =>
    norm(add(mul(F, Math.cos(rho)), add(mul(V, Math.sin(rho) * Math.cos(t)), mul(U, Math.sin(rho) * Math.sin(t)))));

  // Rings from the opening's edge (k = 0) back to near the back of the head
  const rings: Vec3[][] = [];
  for (let k = 0; k <= K; k++) {
    rings.push(Array.from({ length: N }, (_, i) => {
      const t = (i / N) * Math.PI * 2, r0 = openAt(t);
      return surface(dirAt(r0 + (Math.PI * 0.94 - r0) * (k / K), t));
    }));
  }
  loft(m, rings, look.cloth, { caps: false });
  // Close the back with a fan to its center point
  const back = surface(mul(F, -1));
  const last = rings[K];
  for (let i = 0; i < N; i++) m.tri(back, last[i], last[(i + 1) % N], look.cloth, h);

  // The lining just inside the opening (facing in, toward the face), two bands deep, so neither the edge nor
  // the head's corners ever show through
  const inner = (p: Vec3, s: number): Vec3 => add(h, mul(sub(p, h), s));
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const a = rings[k][i], b = rings[k][j], c = rings[k + 1][j], d = rings[k + 1][i];
      const quad = [inner(a, 0.97), inner(b, 0.97), inner(c, 0.97), inner(d, 0.97)];
      const mid = mul(add(add(quad[0], quad[1]), add(quad[2], quad[3])), 0.25);
      const outside = add(h, mul(sub(mid, h), 3)); // oriented away from a point outside: the faces look inward
      m.quad(quad[0], quad[1], quad[2], quad[3], look.lining, outside);
    }
  }

  // The rolled lip around the opening, standing a little forward of the face: one seamless tube (rings of 4
  // around its path, joined all the way round), so no gaps open at its corners
  const lip = rings[0].map((p) => add(inner(p, 1.03), mul(F, 0.012)));
  const tube: Vec3[][] = lip.map((p, i) => {
    const along = norm(sub(lip[(i + 1) % N], lip[(i - 1 + N) % N]));
    const a = norm(cross(along, F)), b = norm(cross(along, a));
    return [0, 1, 2, 3].map((q) => add(p, add(mul(a, Math.cos((q * Math.PI) / 2) * 0.02), mul(b, Math.sin((q * Math.PI) / 2) * 0.02))));
  });
  for (let i = 0; i < N; i++) {
    const r0 = tube[i], r1 = tube[(i + 1) % N];
    const ctr = mul(add(lip[i], lip[(i + 1) % N]), 0.5);
    for (let q = 0; q < 4; q++) m.quad(r0[q], r0[(q + 1) % 4], r1[(q + 1) % 4], r1[q], look.trim, ctr);
  }
}

// ─── Outfits ──────────────────────────────────────────────────────────────────

export interface CasterRobeLook {
  skin: RGB;
  hair: RGB;
  robe: RGB;
  /** Hem, cuff and hood edging. */
  trim: RGB;
  sash: RGB;
  pants: RGB;
  boots: RGB;
  /** The hood's dark interior. */
  lining: RGB;
  /** Draws the hair instead of the default short spiky hair (spikyHair in `hair`), e.g. the Acolyte's. */
  drawHair?: (m: Mesh) => void;
}

/**
 * A caster in robes (the Arcanist and the Occultist): the standard body in `build`'s arm pose, a robe
 * fitted at the waist and falling to the ankles (clear of the legs) with edging at the hem, a sash with
 * knotted ends, bell sleeves widening toward the bare hands, small shoulder caps blending the sleeves
 * into the robe, short spiky hair (or `look.drawHair`), and the hood pushed back. `rf` jitters the hair.
 */
export function casterRobe(m: Mesh, rf: (a: number, b: number) => number, look: CasterRobeLook, build: BodyBuild = {}): void {
  buildBody(m, {
    skin: look.skin,
    pants: look.pants,
    boots: look.boots,
    sleeves: look.robe, // the robe's sleeves to the elbow; bell sleeves widen over the forearms below
    gloves: look.skin, // bare hands
  }, build);

  // Robe: fitted at the waist, widening over the hips and falling to the ankles (clear of the legs)
  const T = TORSO;
  m.part('robe', [0, T.waist, 0]);
  const N = 10;
  loft(m, [
    ell(0.05, 0.3, 0.2, N), ell(0.45, 0.25, 0.165, N), ell(T.hip, 0.21, 0.136, N), ell(T.waist, 0.15, 0.1, N),
    ell(T.chest, 0.178, 0.114, N), ell(T.shoulder + 0.01, 0.2, 0.12, N), ell(T.collar, 0.135, 0.095, N),
  ], look.robe);
  band(m, 0.11, 0.04, 0.29, 0.193, 0.302, 0.202, look.trim); // hem edging
  // Sash at the waist, its knotted ends hanging at one side
  // (10-sided like the robe, and just outside it, so the robe never pokes through)
  loft(m, [ell(T.waist + 0.035, 0.162, 0.108, N), ell(T.waist - 0.035, 0.165, 0.11, N)], look.sash, { caps: false });
  blob(m, [0.07, T.waist - 0.01, 0.1], [0.035, 0.03, 0.025], 0, 0.1, look.sash);
  for (const [dx, len] of [[-0.012, 0.2], [0.02, 0.16]] as const) {
    frustum(m, [0.07 + dx, T.waist - 0.03, 0.105], [0.07 + dx * 2, T.waist - 0.03 - len, 0.12], 0.012, 0.01, 4, look.sash);
  }

  // Bell sleeves: from just below the elbow, widening toward the hands, edged
  m.part('sleeves', [0, T.shoulder, 0]);
  for (const sx of [-1, 1] as const) {
    const a = armJoints(sx, build);
    const dir = sub(a.wrist, a.elbow);
    const start = add(a.elbow, [dir[0] * 0.12, dir[1] * 0.12, dir[2] * 0.12]);
    const end = add(a.wrist, [dir[0] * 0.08, dir[1] * 0.08, dir[2] * 0.08]);
    frustum(m, start, end, 0.062, 0.1, 8, look.robe, { caps: false });
    frustum(m, end, add(end, [dir[0] * 0.08, dir[1] * 0.08, dir[2] * 0.08]), 0.101, 0.104, 8, look.trim, { caps: false });
  }

  // Small shoulder caps, so the sleeves blend into the robe instead of ending abruptly
  for (const sx of [-1, 1] as const) {
    const sh = armJoints(sx, build).shoulder;
    blob(m, [sh[0] * 0.98, sh[1] + 0.01, 0], [0.072, 0.06, 0.08], 0, 0, look.robe, { floorY: sh[1] - 0.04 });
  }

  if (look.drawHair) look.drawHair(m);
  else spikyHair(m, look.hair, rf);
  hoodDown(m, { cloth: mulC(look.robe, 0.95), lining: look.lining, trim: look.trim });
}
