// Static weapon data for the weapon drop generator.
import { DAMAGE_ELEMENTS, type BuffableStat, type DamageElement } from '../units/stats';
import type { AttackCategory, ImplicitDef, WeaponType } from './types';
import type { ModelLink } from '../../forge/core/types';
import { damageTypeAffixes, nonWeaponAffixes, meleeStats, rangedStats, magicStats } from './types';

// ─── Weapon Series ────────────────────────────────────────────────────────────

export interface WeaponSeries {
  id: string;
  name: string;             // prefix applied to the weapon name: 'Plain Gladius' (see weaponName)
  requiredLevel: number;
  damageMultiplier: number; // scales the type's base damage (WEAPON_TYPE_DATA); starting gear is 1.0
  // Each named weapon of the series; `model` is its forge design: how it is drawn (icon and loot).
  weapons: Partial<Record<WeaponType, { name: string; model: ModelLink }>>
}

/** The first tier that drops: a step up from starting gear (STARTER_WEAPON_SERIES). */
const PLAIN: WeaponSeries = {
  id: 'plain', name: 'Plain', requiredLevel: 1, damageMultiplier: 1.2,
  weapons: {
    '1h Swords': { name: 'Gladius',       model: 'weapon.plain-gladius' },
    '2h Swords': { name: 'Bastard Sword', model: 'weapon.plain-bastard-sword' },
    '1h Maces':  { name: 'Mace',          model: 'weapon.plain-mace' },
    '2h Maces':  { name: 'Maul',          model: 'weapon.plain-maul' },
    '1h Axes':   { name: 'Hatchet',       model: 'weapon.plain-hatchet' },
    '2h Axes':   { name: 'Battleaxe',     model: 'weapon.plain-battleaxe' },
    'Daggers':   { name: 'Dirk',          model: 'weapon.plain-dirk' },
    'Bows':      { name: 'Shortbow',      model: 'weapon.plain-shortbow' },
    'Crossbows': { name: 'Crossbow',      model: 'weapon.plain-crossbow' },
    'Staves':    { name: 'Staff',         model: 'weapon.plain-staff' },
    'Wands':     { name: 'Wand',          model: 'weapon.plain-wand' },
  }
};

/** Weapons that drop as loot, by tier. */
export const WEAPON_SERIES: WeaponSeries[] = [PLAIN];

/**
 * Starting gear only: never drops, so even a common first drop is an upgrade. Worn versions of the Plain
 * weapons (weaker, drawn with Plain's models: they have no designs of their own).
 */
export const STARTER_WEAPON_SERIES: WeaponSeries[] = [
  { id: 'worn', name: 'Worn', requiredLevel: 1, damageMultiplier: 1.0, weapons: PLAIN.weapons },
];

/** Display name of a weapon: series name + the series' name for the type, e.g. Plain + '1h Swords' -> 'Plain Gladius'. */
export function weaponName(series: WeaponSeries, weaponType: WeaponType): string {
  return `${series.name} ${series.weapons[weaponType]?.name ?? weaponType}`;
}

export interface WeaponTypeData {
  baseDamage: { min: number; max: number; };
  range: number;
  /** AP its plain weapon attack costs (2h and ranged two-handers cost more). */
  attackAp: number;
  /**
   * Two-handed for balance (handsFit, ITEM_KIND_VALUE_SCALE): no offhand with it, and its affixes roll higher,
   * since it fills both hands. Bows and crossbows aren't (an archer's quiver goes with them), whatever the pose.
   */
  twoHanded: boolean;
  defaultAttackCategory: AttackCategory;
  /** The element its attack deals. A weapon without one (staves, wands) rolls one from `dropElements` when dropped. */
  defaultDamageElement?: DamageElement;
  /** Elements a drop of this type can deal (one picked at random), for a type with no defaultDamageElement. */
  dropElements?: readonly DamageElement[];
  implicit?: ImplicitDef;
  invalidAffixes: BuffableStat[];
}

/** Affixes no weapon rolls, whatever its type: element resistances (fire, shadow...). Magic resistance still can. */
const NO_WEAPON_AFFIXES: BuffableStat[] = DAMAGE_ELEMENTS.map((el) => `${el}Resistance` as const);

/** Every affix a weapon of this type never rolls: its type's own list (invalidAffixes), and those no weapon rolls. */
export const weaponInvalidAffixes = (type: WeaponType): BuffableStat[] => [...WEAPON_TYPE_DATA[type].invalidAffixes, ...NO_WEAPON_AFFIXES];

/** The elements a dropped staff or wand can deal (its dropElements): every magic element but poison. */
const MAGIC_WEAPON_ELEMENTS: readonly DamageElement[] = ['fire', 'ice', 'lightning', 'shadow', 'holy', 'nature'];

export const WEAPON_TYPE_DATA: Record<WeaponType, WeaponTypeData> = {
  'Daggers': {
    baseDamage: { min: 4, max: 7 },
    range: 1,
    attackAp: 1,
    twoHanded: false,
    defaultAttackCategory: 'melee',
    defaultDamageElement: 'physical',
    implicit: { stat: 'meleeCrit', baseValue: 5, growthPerLevel: 0.5 },
    invalidAffixes: [
      'healing', 'glancingBlow', 'devotion', 'redoubt',
      ...rangedStats, ...nonWeaponAffixes, ...damageTypeAffixes(['holy'])
    ],
  },
  '1h Swords': {
    baseDamage: { min: 5, max: 9 },
    range: 1,
    attackAp: 1,
    twoHanded: false,
    defaultAttackCategory: 'melee',
    defaultDamageElement: 'physical',
    implicit: { stat: 'meleeHit', baseValue: 2, growthPerLevel: 0.3 },
    invalidAffixes: [
       ...rangedStats, ...nonWeaponAffixes, 
       
    ],
  },
  '2h Swords': {
    baseDamage: { min: 8, max: 14 },
    range: 1,
    attackAp: 2,
    twoHanded: true,
    defaultAttackCategory: 'melee',
    defaultDamageElement: 'physical',
    implicit: { stat: 'meleeHit', baseValue: 3, growthPerLevel: 0.5 },
    invalidAffixes: [
      'spirit', 'finesse', 'glancingBlow', 'stealth', 'perception',
      ...rangedStats, ...nonWeaponAffixes, 
      ...damageTypeAffixes(['magic'], {only: ['Hit','Penetration']}),
      ...damageTypeAffixes(['poison','shadow','ice'])
    ],
  },
  '1h Maces': {
    baseDamage: { min: 6, max: 9 },
    range: 1,
    attackAp: 1,
    twoHanded: false,
    defaultAttackCategory: 'melee',
    defaultDamageElement: 'physical',
    implicit: { stat: 'armor', baseValue: 4, growthPerLevel: 0.2 },
    invalidAffixes: [
      'finesse', 'meleeCrit', 'dodge', 'initiative', 'stealth', 'perception',
      ...rangedStats, ...nonWeaponAffixes,
      ...damageTypeAffixes(['shadow','ice'])
    ],
  },
  '2h Maces': {
    baseDamage: { min: 9, max: 15 },
    range: 1,
    attackAp: 2,
    twoHanded: true,
    defaultAttackCategory: 'melee',
    defaultDamageElement: 'physical',
    implicit: { stat: 'armor', baseValue: 6, growthPerLevel: 0.4 },
    invalidAffixes: [
      'finesse', 'mind', 'spirit',  'meleeCrit', 'initiative', 'stealth', 'perception',
      ...rangedStats, ...nonWeaponAffixes, 'magicHit', 'magicCrit',
      ...damageTypeAffixes(['magic'], {only: ['Hit','Penetration']}),
      ...damageTypeAffixes(['poison','shadow','ice'])
    ],
  },
  '1h Axes': {
    baseDamage: { min: 4, max: 10 },
    range: 1,
    attackAp: 1,
    twoHanded: false,
    defaultAttackCategory: 'melee',
    defaultDamageElement: 'physical',
    implicit: { stat: 'meleeDamage', baseValue: 2, growthPerLevel: 0.4 },
    invalidAffixes: [
      'mind', 'spirit', 'healing', 'stealth', 'perception', 'spellcraft', 'devotion',
      ...rangedStats, ...magicStats, ...nonWeaponAffixes,
      ...damageTypeAffixes(['magic'], {only: ['Hit','Penetration']}),
      ...damageTypeAffixes(['shadow','ice'])
    ],
  },
  '2h Axes': {
    baseDamage: { min: 7, max: 16 },
    range: 1,
    attackAp: 2,
    twoHanded: true,
    defaultAttackCategory: 'melee',
    defaultDamageElement: 'physical',
    implicit: { stat: 'meleeDamage', baseValue: 4, growthPerLevel: 0.7 },
    invalidAffixes: [
      'mind', 'spirit', 'healing', 'stealth', 'perception', 'spellcraft', 'devotion',
      ...rangedStats, ...magicStats, ...nonWeaponAffixes,
      ...damageTypeAffixes(['magic'], {only: ['Hit','Penetration']}),
      ...damageTypeAffixes(['poison','shadow','ice'])
    ],
  },
  'Bows': {
    baseDamage: { min: 6, max: 9 },
    range: 5,
    attackAp: 2,
    twoHanded: false,
    defaultAttackCategory: 'ranged',
    defaultDamageElement: 'physical',
    implicit: { stat: 'rangedCrit', baseValue: 3, growthPerLevel: 0.4 },
    invalidAffixes: [
      'strength', 'healing', 'parry', 'glancingBlow',
      'redoubt', 'devotion', 'magicHit', 'magicCrit',
      ...meleeStats, ...nonWeaponAffixes,
      ...damageTypeAffixes(['magic'], {except: ['Damage']}),
      ...damageTypeAffixes(['holy','shadow'])
    ],
  },
  'Crossbows': {
    baseDamage: { min: 6, max: 11 },
    range: 4,
    attackAp: 2,
    twoHanded: false,
    defaultAttackCategory: 'ranged',
    defaultDamageElement: 'physical',
    implicit: { stat: 'physicalDamage', baseValue: 2, growthPerLevel: 0.5 },
    invalidAffixes: [
      'strength', 'healing', 'parry', 'glancingBlow',
      'redoubt', 'devotion', 'magicHit', 'magicCrit',
      ...meleeStats, ...nonWeaponAffixes,
      ...damageTypeAffixes(['magic'], {except: ['Damage']}),
      ...damageTypeAffixes(['holy','shadow'])
    ],
  },
  'Staves': {
    baseDamage: { min: 6, max: 10 },
    range: 4,
    attackAp: 2,
    twoHanded: true,
    defaultAttackCategory: 'magic',
    dropElements: MAGIC_WEAPON_ELEMENTS,
    implicit: { stat: 'magicDamage', baseValue: 2, growthPerLevel: 0.5 },
    invalidAffixes: [
      'strength', 'finesse', 'parry', 'glancingBlow', 'dodge', 
      'evasion', 'redoubt', 'expertise', 'stealth',
      'armor', 'block', 'hpRegen', //allows mpRegen
      ...meleeStats, ...rangedStats,
      ...damageTypeAffixes(['physical','poison'])
    ],
  },
  'Wands': {
    baseDamage: { min: 3, max: 5 },
    range: 3,
    attackAp: 1,
    twoHanded: false,
    defaultAttackCategory: 'magic',
    dropElements: MAGIC_WEAPON_ELEMENTS,
    implicit: { stat: 'magicCrit', baseValue: 3, growthPerLevel: 0.4 },
    invalidAffixes: [
      'strength', 'finesse', 'parry', 'glancingBlow', 'dodge', 
      'evasion', 'redoubt', 'expertise', 'stealth',
      'armor', 'block', 'hpRegen', //allows mpRegen
      ...meleeStats, ...rangedStats,
      ...damageTypeAffixes(['physical','poison'])
    ],
  },
};
