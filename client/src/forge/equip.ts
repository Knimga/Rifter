// Characters holding their gear: which item design goes in which hand, how big and which way it points.
// Reads game data (class starting gear, weapon and shield links), like dataRefs.ts; the geometry is done
// by core/hold.ts. The body's arm pose follows the weapon's hold (HOLD_FOR in designs/_character.ts), so a
// class is built posed for whatever it holds. The forge view and forge:sheet show each class holding each
// weapon type it can use; the game will build the same from a member's equipped items.
import type { Design, Model, ModelLink } from './core/types';
import { norm, rotZ, sub, type Vec3 } from './core/vec';
import { WEAPON_ROLL } from './designs/_weapon';
import { BOW_ARROW, BOW_LIMBS, CROSSBOW_AXIS, CROSSBOW_UP, DANGLE_UNIT, HOLD_FOR, type Hold } from './designs/_character';
import { buildModel } from './core/build';
import { ITEM_SEED, linkedDesign } from './core/link';
import { CHARACTER_HEIGHT } from './core/stage-config';
import { extentAlong, holdItems, type PlacedItem } from './core/hold';
import { CLASSES, type ClassKey } from '../data/units/classes';
import { WEAPON_SERIES, WEAPON_TYPE_DATA } from '../data/gear/weapons';
import { OFFHANDS, OFFHAND_PROFICIENCIES, SHIELDS } from '../data/gear/offhands';
import type { WeaponType } from '../data/gear/types';

/** Held length (pommel to tip) of each weapon type, as a fraction of CHARACTER_HEIGHT. Tune by eye. */
export const HELD_LENGTH: Partial<Record<WeaponType, number>> = {
  '1h Swords': 0.5,
  '1h Maces': 0.42,
  '1h Axes': 0.42,
  'Daggers': 0.28,
  'Wands': 0.28,
  '2h Swords': 0.85,
  '2h Maces': 0.85,
  '2h Axes': 0.85,
  'Staves': 1.0,
  'Bows': 0.62, // tip to tip
  'Crossbows': 0.45, // butt to nose
};

/**
 * Weapon types held like a walking stick: nearly upright, the foot planted on the ground, the fist
 * gripping the shaft wherever that puts it (instead of at the weapon's own grip point).
 */
const WALKING_STICK: ReadonlySet<WeaponType> = new Set(['Staves']);
/** Direction of a planted walking stick: upright, its top leaning very slightly back. */
const WALKING_STICK_AXIS: Vec3 = [0, 1, -0.06];
const DEFAULT_HELD_LENGTH = 0.5;

/**
 * An offhand held dangling (a focus) that marks 'dangle_unit' is shown at this size: world units (tiles) per
 * unit of its design, so its length shows as designed (the first Keen Amethyst's size in hand).
 */
const DANGLE_SCALE = 0.957;
/** One without that mark: its length from where it is held to its tip, as a fraction of CHARACTER_HEIGHT. */
export const HELD_DANGLE_LENGTH = 0.22;

/** Held shield height, as a fraction of CHARACTER_HEIGHT. */
export const HELD_SHIELD_HEIGHT = 0.39;

/** Gap between the forearm anchor and the back of a strapped shield (tiles): the forearm's thickness. */
const SHIELD_GAP = 0.03;

/**
 * Body anchors every character design marks (in its build, before finalize):
 * hand_r: center of the right fist (main hand); elbow_r: the right elbow (with hand_r, the sword
 * forearm's direction); forearm_l: middle of the left forearm (shield strap); elbow_l: the left elbow
 * (with forearm_l, the shield forearm's direction). Models face +z; their left is +x.
 */
export const HAND_ANCHORS = {
  mainhand: 'hand_r', mainhandElbow: 'elbow_r', offhand: 'forearm_l', offhandElbow: 'elbow_l',
  /** Only in the shoulder-carry pose: the top of the right shoulder, where a carried two-hander rests. */
  shoulderRest: 'shoulder_rest_r',
  /** Only in the bow pose: the left fist, holding a bow's grip. */
  bowHand: 'hand_l',
} as const;

/** `v` with its component along `dir` removed (the part of v perpendicular to dir). */
function perpendicular(v: Vec3, dir: Vec3): Vec3 {
  const l2 = dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2 || 1;
  const k = (v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2]) / l2;
  return [v[0] - dir[0] * k, v[1] - dir[1] * k, v[2] - dir[2] * k];
}

/** One held item: its built model, plus the weapon type for weapons (sets its held length). */
export interface HeldGear {
  mainhand?: { model: Model; weaponType: WeaponType };
  offhand?: { model: Model };
}

/** The body holding its gear. Simple pose: sword pointing forward, shield strapped on facing out to the left. */
export function holdGear(body: Model, gear: HeldGear): Model {
  const a = body.mesh.anchors;
  const items: PlacedItem[] = [];

  // A crossbow, in a body posed to hold one: its grip (the trigger) in the right fist, held across the
  // body as the pose defines (CROSSBOW_AXIS, CROSSBOW_UP); the left fist cradles the stock toward its
  // middle. Crossbow designs are built from butt to nose (tip) with their top facing +z, so those
  // directions are known in the item too.
  if (gear.mainhand && gear.mainhand.weaponType === 'Crossbows' && a[HAND_ANCHORS.bowHand] && a[HAND_ANCHORS.mainhand]) {
    const w = gear.mainhand.model.mesh;
    const grip = w.anchors.grip ?? [0, 0, 0];
    const axis: Vec3 = w.anchors.tip ? [w.anchors.tip[0] - grip[0], w.anchors.tip[1] - grip[1], w.anchors.tip[2] - grip[2]] : [0, 1, 0];
    const [lo, hi] = extentAlong(w, axis, grip);
    items.push({
      part: 'mainhand',
      mesh: w,
      placement: {
        itemAxis: axis, itemSecond: [0, 0, 1],
        worldAxis: CROSSBOW_AXIS, worldSecond: CROSSBOW_UP,
        scale: ((HELD_LENGTH.Crossbows ?? DEFAULT_HELD_LENGTH) * CHARACTER_HEIGHT) / (hi - lo),
        itemPin: grip, // the trigger
        worldPin: a[HAND_ANCHORS.mainhand],
      },
    });
  // A bow, in a body posed to hold one (it marks hand_l): grip in the left fist, limbs and arrow line as
  // the pose defines (BOW_LIMBS, BOW_ARROW). Bow designs are built with limbs along y and the arrow line
  // along -x, then rolled by WEAPON_ROLL, so those directions are known in the item too.
  } else if (gear.mainhand && gear.mainhand.weaponType === 'Bows' && a[HAND_ANCHORS.bowHand]) {
    const w = gear.mainhand.model.mesh;
    const limbs = rotZ([0, 1, 0], WEAPON_ROLL), arrow = rotZ([-1, 0, 0], WEAPON_ROLL);
    const grip = w.anchors.grip ?? [0, 0, 0];
    const [lo, hi] = extentAlong(w, limbs, grip);
    items.push({
      part: 'mainhand',
      mesh: w,
      placement: {
        itemAxis: limbs, itemSecond: arrow,
        worldAxis: BOW_LIMBS, worldSecond: BOW_ARROW,
        scale: ((HELD_LENGTH.Bows ?? DEFAULT_HELD_LENGTH) * CHARACTER_HEIGHT) / (hi - lo),
        itemPin: grip,
        worldPin: a[HAND_ANCHORS.bowHand],
      },
    });
  } else if (gear.mainhand && a[HAND_ANCHORS.mainhand]) {
    const w = gear.mainhand.model.mesh;
    const grip = w.anchors.grip ?? [0, 0, 0];
    const axis: Vec3 = w.anchors.tip ? [w.anchors.tip[0] - grip[0], w.anchors.tip[1] - grip[1], w.anchors.tip[2] - grip[2]] : [0, 1, 0];
    const [lo, hi] = extentAlong(w, axis, grip);
    const length = (HELD_LENGTH[gear.mainhand.weaponType] ?? DEFAULT_HELD_LENGTH) * CHARACTER_HEIGHT;
    const hand = a[HAND_ANCHORS.mainhand], elbow = a[HAND_ANCHORS.mainhandElbow];
    const rest = a[HAND_ANCHORS.shoulderRest];
    // Shoulder-carry pose (the body marks a shoulder rest): the weapon runs from the fist up over the
    // shoulder, its head behind. Otherwise it is held perpendicular to the forearm, pointing to the front.
    // Either way the blade's flat faces out to the right.
    const forearm: Vec3 = elbow ? [hand[0] - elbow[0], hand[1] - elbow[1], hand[2] - elbow[2]] : [0, -1, 0];
    const walking = WALKING_STICK.has(gear.mainhand.weaponType);
    const worldAxis: Vec3 = walking ? WALKING_STICK_AXIS
      : rest ? [rest[0] - hand[0], rest[1] - hand[1], rest[2] - hand[2]]
      : perpendicular([0, 0, 1], forearm);
    const scale = length / (hi - lo);
    // A walking stick is gripped at the point along it that puts its foot on the ground (y = 0)
    let itemPin = grip;
    if (walking) {
      const up = norm(worldAxis)[1];
      const along = lo + hand[1] / (scale * up); // distance from the item's grip to where the fist holds it
      const u = norm(axis);
      itemPin = [grip[0] + u[0] * along, grip[1] + u[1] * along, grip[2] + u[2] * along];
    }
    items.push({
      part: 'mainhand',
      mesh: w,
      placement: {
        itemAxis: axis, itemSecond: [0, 0, 1], // grip -> tip; the blade's flat faces +z
        worldAxis, worldSecond: [-1, 0, 0],
        scale,
        itemPin,
        worldPin: hand,
      },
    });
  }

  const off = gear.offhand?.model.mesh;
  if (off && off.anchors.quiver_bottom && off.anchors.quiver_top && a.quiver_bottom && a.quiver_top) {
    // A quiver, worn on the back: its two ends (quiver_bottom, quiver_top) on the body's, at the size it was
    // built (the item is scaled to fit its icon, so it is scaled back by the ratio of its ends' distance)
    const iAxis = sub(off.anchors.quiver_top, off.anchors.quiver_bottom), wAxis = sub(a.quiver_top, a.quiver_bottom);
    items.push({
      part: 'offhand',
      mesh: off,
      placement: {
        itemAxis: iAxis, itemSecond: [0, 0, 1], // built in the body's frame: its back is toward -z, as the body's
        worldAxis: wAxis, worldSecond: [0, 0, 1],
        scale: Math.hypot(...wAxis) / Math.hypot(...iAxis),
        itemPin: off.anchors.quiver_bottom,
        worldPin: a.quiver_bottom,
      },
    });
  } else if (off && off.anchors.dangle_grip && off.anchors.dangle_tip && a.fist_l) {
    // Held dangling from the left fist (a focus): its grip (dangle_grip) in the fist, hanging straight down to
    // its tip (dangle_tip), whatever the arm does. Sized as built (DANGLE_SCALE, by its 'dangle_unit' mark), so
    // a shorter or longer design shows so; one without the mark is HELD_DANGLE_LENGTH long
    const iAxis = sub(off.anchors.dangle_tip, off.anchors.dangle_grip);
    const unit = off.anchors.dangle_unit;
    const scale = unit
      ? (DANGLE_SCALE * DANGLE_UNIT) / Math.hypot(...sub(unit, off.anchors.dangle_grip))
      : (HELD_DANGLE_LENGTH * CHARACTER_HEIGHT) / Math.hypot(...iAxis);
    items.push({
      part: 'offhand',
      mesh: off,
      placement: {
        itemAxis: iAxis, itemSecond: [0, 0, 1],
        worldAxis: [0, -1, 0], worldSecond: [0, 0, 1],
        scale,
        itemPin: off.anchors.dangle_grip,
        worldPin: a.fist_l,
      },
    });
  } else if (gear.offhand && a[HAND_ANCHORS.offhand]) {
    const s = gear.offhand.model.mesh;
    const height = HELD_SHIELD_HEIGHT * CHARACTER_HEIGHT;
    const scale = height / (s.bounds.max[1] - s.bounds.min[1]);
    const arm = a[HAND_ANCHORS.offhand];
    // Strapped on: the shield's top runs perpendicular to the forearm, toward the front (with the arm
    // hanging down, the top points forward), and its face looks out to the left
    const elbow = a[HAND_ANCHORS.offhandElbow];
    const along: Vec3 = elbow ? [arm[0] - elbow[0], arm[1] - elbow[1], arm[2] - elbow[2]] : [0, -1, 0];
    const top = perpendicular([0, 0, 1], along);
    items.push({
      part: 'offhand',
      mesh: s,
      placement: {
        itemAxis: [0, 1, 0], itemSecond: [0, 0, 1], // shield top; shield face
        worldAxis: top, worldSecond: [1, 0, 0],
        scale,
        itemPin: [0, 0, s.bounds.min[2]], // center of the shield's back
        worldPin: [arm[0] + SHIELD_GAP, arm[1], arm[2]],
      },
    });
  }

  return holdItems(body, items);
}

/** The model link of a sample weapon of a type: the level-1 series' (e.g. Plain Gladius for 1h Swords). */
function sampleWeaponLink(weaponType: WeaponType): ModelLink | undefined {
  return WEAPON_SERIES.find((s) => s.requiredLevel <= 1 && s.weapons[weaponType])?.weapons[weaponType]?.model;
}

/**
 * The stable id a class's character model is seeded from (instanceSeed). A party has each class at most
 * once, so it identifies a member's look everywhere: character select and the maps show the same body.
 */
export const classInstanceId = (classKey: ClassKey) => `class-${classKey}`;

/** The class a character design is the body of, if any. */
export const classOf = (design: Design): ClassKey | null =>
  design.source.table === 'classes' && design.source.key in CLASSES ? (design.source.key as ClassKey) : null;

/**
 * Weapon types a class can hold, grouped by hold (from its weapon proficiencies), for the forge's hold
 * rows. A class's starting weapon type comes first in its group.
 */
export function classHolds(classKey: ClassKey): { hold: Hold; weaponTypes: WeaponType[] }[] {
  const c = CLASSES[classKey];
  const types = (c.weaponProficiencies.filter((p) => !OFFHAND_PROFICIENCIES.includes(p)) as WeaponType[])
    .sort((a, b) => (a === c.startingGear.weapon ? -1 : b === c.startingGear.weapon ? 1 : 0));
  const groups = new Map<Hold, WeaponType[]>();
  for (const t of types) groups.set(HOLD_FOR[t], [...(groups.get(HOLD_FOR[t]) ?? []), t]);
  return [...groups].map(([hold, weaponTypes]) => ({ hold, weaponTypes }));
}

// Every item of a design looks the same (ITEM_SEED), so each design's item model is built once and shared.
// Models are never mutated (holdItems copies what it places). Keyed by the design object, so a design
// edited in dev builds afresh.
const itemModels = new WeakMap<Design, Model>();
function itemModel(design: Design): Model {
  let m = itemModels.get(design);
  if (!m) itemModels.set(design, (m = buildModel(design, ITEM_SEED)));
  return m;
}

/** A held weapon: its model link and weapon type (which sets the arm pose and its held length). */
export interface HeldWeapon {
  link: ModelLink;
  weaponType: WeaponType;
}

/**
 * A character: the class design's body (built with `seed`) posed for the weapon's hold (HOLD_FOR; no
 * weapon = the class's default hold), holding the weapon and wearing the offhand (a shield strapped on, a
 * quiver on the back), each built from its own design. The one function the game (a member's equipped
 * items) and the forge (sample gear) both build characters with. Items whose design isn't approved
 * (`designs`) are left out.
 */
export function buildCharacter(designs: Record<string, Design>, bodyDesign: Design, seed: number, weapon?: HeldWeapon, offhand?: ModelLink): Model {
  const body = buildModel(bodyDesign, seed, weapon ? HOLD_FOR[weapon.weaponType] : undefined);
  const build = (link: ModelLink | undefined) => {
    const d = link ? linkedDesign(designs, link) : null;
    return d ? itemModel(d) : null;
  };
  const main = build(weapon?.link), off = build(offhand);
  return holdGear(body, {
    mainhand: main && weapon ? { model: main, weaponType: weapon.weaponType } : undefined,
    offhand: off ? { model: off } : undefined,
  });
}

/**
 * Any design's preview model, for the forge (forge view, forge:sheet). A class (character) design is posed
 * for and holds a sample weapon of `weaponType` (default: its starting weapon), with its starting offhand:
 * its shield when that hold leaves the left arm free for one, its other offhand (a quiver) with a one-handed
 * weapon; everything else is built as-is.
 */
export function buildPreview(design: Design, seed: number, designs: Record<string, Design>, weaponType?: WeaponType): Model {
  const cls = classOf(design);
  if (!cls) return buildModel(design, seed);
  const kit = CLASSES[cls].startingGear;
  const type = weaponType ?? kit.weapon;
  const weaponLink = sampleWeaponLink(type);
  const offhandLink = HOLD_FOR[type] === 'oneHand' && kit.shield ? SHIELDS.find((s) => s.armorType === kit.shield)?.model
    : kit.offhand && !WEAPON_TYPE_DATA[type].twoHanded ? OFFHANDS[kit.offhand].drops[0]?.model
    : undefined;
  return buildCharacter(designs, design, seed, weaponLink ? { link: weaponLink, weaponType: type } : undefined, offhandLink || undefined);
}
