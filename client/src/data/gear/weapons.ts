// Static weapon data for the weapon drop generator.
import type { BuffableStat, DamageElement } from '../stats';
import type { AttackCategory, ImplicitDef, WeaponType } from './types';
import type { ModelLink } from '../../forge/core/types';
import { nonWeaponAffixes, meleeStats, rangedStats, magicStats } from './types';

// ─── Weapon Series ────────────────────────────────────────────────────────────

export interface WeaponSeries {
  id: string;
  name: string;             // prefix applied to the weapon name: 'Plain Gladius' (see weaponName)
  requiredLevel: number;
  damageMultiplier: number; // scales base weapon damage relative to tier 1 (Iron = 1.0)
  // Each named weapon of the series; `model` is its forge design: how it is drawn (icon and loot).
  weapons: Partial<Record<WeaponType, { name: string; model: ModelLink }>>
}

export const WEAPON_SERIES: WeaponSeries[] = [
  {
    id: 'plain', name: 'Plain', requiredLevel: 1, damageMultiplier: 1.0,
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
  }
];

/** Display name of a weapon: series name + the series' name for the type, e.g. Plain + '1h Swords' -> 'Plain Gladius'. */
export function weaponName(series: WeaponSeries, weaponType: WeaponType): string {
  return `${series.name} ${series.weapons[weaponType]?.name ?? weaponType}`;
}

export interface WeaponTypeData {
  baseDamage: { min: number; max: number; };
  range: number;
  defaultAttackCategory: AttackCategory;
  defaultDamageElement?: DamageElement;
  implicits?: ImplicitDef;
  invalidAffixes: BuffableStat[];
}

export const WEAPON_TYPE_DATA: Partial<Record<WeaponType, WeaponTypeData>> = {
  'Daggers': {
    baseDamage: { min: 3, max: 6 },
    range: 1,
    defaultAttackCategory: 'melee',
    defaultDamageElement: 'piercing',
    implicits: { statKey: 'meleeCrit', baseValue: 4, growthPerLevel: 0.5 },
    invalidAffixes: [
      'threatMultiplier', 'healing', 'glancingBlow', 'devotion', 'redoubt',
      ...rangedStats, ...nonWeaponAffixes
    ],
  },
  '1h Swords': {
    baseDamage: { min: 4, max: 8 },
    range: 1,
    defaultAttackCategory: 'melee',
    defaultDamageElement: 'slashing',
    implicits: { statKey: 'meleeHit', baseValue: 2, growthPerLevel: 0.3 },
    invalidAffixes: [
       ...rangedStats, ...nonWeaponAffixes
    ],
  },
  '2h Swords': {
    baseDamage: { min: 8, max: 14 },
    range: 1,
    defaultAttackCategory: 'melee',
    defaultDamageElement: 'slashing',
    implicits: { statKey: 'meleeHit', baseValue: 3, growthPerLevel: 0.5 },
    invalidAffixes: [
      'spirit', 'finesse', 'glancingBlow', 'stealth', 'perception',
      ...rangedStats, ...nonWeaponAffixes
    ],
  },
  '1h Maces': {
    baseDamage: { min: 5, max: 8 },
    range: 1,
    defaultAttackCategory: 'melee',
    defaultDamageElement: 'bludgeoning',
    implicits: { statKey: 'armor', baseValue: 4, growthPerLevel: 0.2 },
    invalidAffixes: [
      'finesse', 'meleeCrit', 'dodge', 'initiative', 'stealth', 'perception',
      ...rangedStats, ...nonWeaponAffixes
    ],
  },
  '2h Maces': {
    baseDamage: { min: 9, max: 15 },
    range: 1,
    defaultAttackCategory: 'melee',
    defaultDamageElement: 'bludgeoning',
    implicits: { statKey: 'armor', baseValue: 6, growthPerLevel: 0.4 },
    invalidAffixes: [
      'finesse', 'mind', 'spirit',  'meleeCrit', 'initiative', 'stealth', 'perception',
      ...rangedStats, ...nonWeaponAffixes, 'magicHit', 'magicCrit'
    ],
  },
  '1h Axes': {
    baseDamage: { min: 3, max: 9 },
    range: 1,
    defaultAttackCategory: 'melee',
    defaultDamageElement: 'slashing',
    implicits: { statKey: 'meleeDamage', baseValue: 2, growthPerLevel: 0.4 },
    invalidAffixes: [
      'mind', 'spirit', 'healing', 'stealth', 'perception', 'spellcraft', 'devotion',
      ...rangedStats, ...magicStats, ...nonWeaponAffixes
    ],
  },
  '2h Axes': {
    baseDamage: { min: 7, max: 16 },
    range: 1,
    defaultAttackCategory: 'melee',
    defaultDamageElement: 'slashing',
    implicits: { statKey: 'meleeDamage', baseValue: 4, growthPerLevel: 0.7 },
    invalidAffixes: [
      'mind', 'spirit', 'healing', 'stealth', 'perception', 'spellcraft', 'devotion',
      ...rangedStats, ...magicStats, ...nonWeaponAffixes
    ],
  },
  'Bows': {
    baseDamage: { min: 6, max: 9 },
    range: 5,
    defaultAttackCategory: 'ranged',
    defaultDamageElement: 'piercing',
    implicits: { statKey: 'rangedCrit', baseValue: 3, growthPerLevel: 0.4 },
    invalidAffixes: [
      'strength', 'healing', 'parry', 'glancingBlow', 'threatMultiplier',
      'redoubt', 'devotion', 'magicHit', 'magicCrit',
      ...meleeStats, ...nonWeaponAffixes
    ],
  },
  'Crossbows': {
    baseDamage: { min: 6, max: 11 },
    range: 4,
    defaultAttackCategory: 'ranged',
    defaultDamageElement: 'piercing',
    implicits: { statKey: 'piercingDamage', baseValue: 2, growthPerLevel: 0.5 },
    invalidAffixes: [
      'strength', 'healing', 'parry', 'glancingBlow', 'threatMultiplier',
      'redoubt', 'devotion', 'magicHit', 'magicCrit',
      ...meleeStats, ...nonWeaponAffixes
    ],
  },
  'Staves': {
    baseDamage: { min: 3, max: 10 },
    range: 4,
    defaultAttackCategory: 'magic',
    implicits: { statKey: 'magicDamage', baseValue: 2, growthPerLevel: 0.5 },
    invalidAffixes: [
      'strength', 'finesse', 'parry', 'glancingBlow', 'dodge', 
      'evasion', 'redoubt', 'expertise', 'stealth',
      'armor', 'block', 'hpRegen', //allows mpRegen
      ...meleeStats, ...rangedStats
    ],
  },
  'Wands': {
    baseDamage: { min: 3, max: 7 },
    range: 3,
    defaultAttackCategory: 'magic',
    implicits: { statKey: 'magicCrit', baseValue: 3, growthPerLevel: 0.4 },
    invalidAffixes: [
      'strength', 'finesse', 'parry', 'glancingBlow', 'dodge', 
      'evasion', 'redoubt', 'expertise', 'stealth',
      'armor', 'block', 'hpRegen', //allows mpRegen
      ...meleeStats, ...rangedStats
    ],
  },
  /*
  'Unarmed': {
    baseDamage: { min: 1, max: 3 },    
    defaultDamageElement: 'bludgeoning',
    invalidAffixes: [],
  },
  */
};
