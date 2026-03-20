// Static weapon data for the weapon drop generator.
import type { BuffableStat } from '../stats';
import type { AttackCategory, DamageElement, WeaponType } from './types';
import { nonWeaponAffixes, meleeStats, rangedStats, magicStats } from './types';

// ─── Weapon Series ────────────────────────────────────────────────────────────

export interface WeaponSeries {
  id: string;
  name: string;             // prefix applied to the weapon name: 'Iron Sword', 'Steel Axe'
  requiredLevel: number;
  damageMultiplier: number; // scales base weapon damage relative to tier 1 (Iron = 1.0)
  weapons: Partial<Record<WeaponType, { name: string; icon: string, damageElement?: DamageElement; }>>
}

export const WEAPON_SERIES: WeaponSeries[] = [
  {
    id: 'plain', name: 'Plain', requiredLevel: 1, damageMultiplier: 1.0,
    weapons: {
      '1h Swords': { name: 'Gladius',       icon: '/gearIcons/weapons/plain/sword.png',      damageElement: 'slashing' },
      '2h Swords': { name: 'Bastard Sword', icon: '/gearIcons/weapons/plain/sword.png',      damageElement: 'slashing' },
      '1h Maces':  { name: 'Mace',          icon: '/gearIcons/weapons/plain/mace.png',       damageElement: 'bludgeoning' },
      '2h Maces':  { name: 'Maul',          icon: '/gearIcons/weapons/plain/mace.png',       damageElement: 'bludgeoning' },
      '1h Axes':   { name: 'Hatchet',       icon: '/gearIcons/weapons/plain/axe.png',        damageElement: 'slashing' },
      '2h Axes':   { name: 'Battleaxe',     icon: '/gearIcons/weapons/plain/battleaxe.png',  damageElement: 'slashing' },
      'Daggers':   { name: 'Dirk',          icon: '/gearIcons/weapons/plain/dagger.png',     damageElement: 'piercing' },
      'Bows':      { name: 'Shortbow',      icon: '/gearIcons/weapons/plain/bow.png',        damageElement: 'piercing' },
      'Crossbows': { name: 'Crossbow',      icon: '/gearIcons/weapons/plain/crossbow.png',   damageElement: 'piercing' },
      'Staves':    { name: 'Staff',         icon: '/gearIcons/weapons/plain/staff.png' },
      'Wands':     { name: 'Wand',          icon: '/gearIcons/weapons/plain/wand.png' },
    }
  }
];

// ─── Base Damage ─────────────────────────────────────────────────────────────
// gets multiplier by series multiplier
// WILL SOON BE REPLACED BY WEAPON_TYPE_DATA BELOW

export const WEAPON_BASE_DAMAGE: Record<WeaponType, { min: number; max: number }> = {
  'Daggers':   { min: 3,  max: 6  },
  '1h Swords': { min: 4,  max: 8  },
  '2h Swords': { min: 8,  max: 14 },
  '1h Maces':  { min: 4,  max: 8  },
  '2h Maces':  { min: 7,  max: 15 },
  '1h Axes':   { min: 3,  max: 9  },
  '2h Axes':   { min: 7,  max: 16 },
  'Bows':      { min: 6,  max: 9  },
  'Crossbows': { min: 6,  max: 11 },
  'Staves':    { min: 3,  max: 10 },
  'Wands':     { min: 3,  max: 7  },
  'Unarmed':   { min: 1,  max: 3  },
};

// ─── Weapon Implicits ─────────────────────────────────────────────────────────

// Template for computing the implicit bonus at generation time.
export interface WeaponImplicitDef {
  statKey: BuffableStat;
  baseValue: number;        // value at item level 1
  growthPerLevel: number;   // added per item level above 1
}

export const WEAPON_IMPLICITS: Partial<Record<WeaponType, WeaponImplicitDef>> = {
  'Daggers':   { statKey: 'meleeCrit',        baseValue: 5,  growthPerLevel: 0.5},
  '1h Swords': { statKey: 'meleeHit',         baseValue: 4,  growthPerLevel: 0.3},
  '2h Swords': { statKey: 'meleeDamage',      baseValue: 5,  growthPerLevel: 0.5},
  '1h Maces':  { statKey: 'armor',            baseValue: 5,  growthPerLevel: 0.2},
  '2h Maces':  { statKey: 'armor',            baseValue: 8,  growthPerLevel: 0.4},
  '1h Axes':   { statKey: 'slashingDamage',   baseValue: 4,  growthPerLevel: 0.4},
  '2h Axes':   { statKey: 'slashingDamage',   baseValue: 8,  growthPerLevel: 0.7},
  'Bows':      { statKey: 'rangedCrit',       baseValue: 4,  growthPerLevel: 0.4},
  'Crossbows': { statKey: 'piercingDamage',   baseValue: 6,  growthPerLevel: 0.5},
  'Staves':    { statKey: 'magicDamage',      baseValue: 6,  growthPerLevel: 0.5},
  'Wands':     { statKey: 'magicCrit',        baseValue: 5,  growthPerLevel: 0.4},
  // Unarmed: no implicit
};

export interface WeaponTypeData {
  baseDamage: { min: number; max: number; };
  range: number;
  defaultAttackCategory: AttackCategory;
  defaultDamageElement?: DamageElement;
  implicits?: { statKey: BuffableStat; baseValue: number; growthPerLevel: number; };
  invalidAffixes: BuffableStat[];
}

export const WEAPON_TYPE_DATA: Partial<Record<WeaponType, WeaponTypeData>> = {
  'Daggers': {
    baseDamage: { min: 3, max: 6 },
    range: 1,
    defaultAttackCategory: 'melee',
    defaultDamageElement: 'piercing',
    implicits: { statKey: 'meleeCrit', baseValue: 5, growthPerLevel: 0.5 },
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
    implicits: { statKey: 'meleeHit', baseValue: 3, growthPerLevel: 0.3 },
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
    implicits: { statKey: 'armor', baseValue: 5, growthPerLevel: 0.2 },
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
    implicits: { statKey: 'armor', baseValue: 8, growthPerLevel: 0.4 },
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
    implicits: { statKey: 'meleeDamage', baseValue: 3, growthPerLevel: 0.4 },
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
    implicits: { statKey: 'meleeDamage', baseValue: 5, growthPerLevel: 0.7 },
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
    implicits: { statKey: 'rangedCrit', baseValue: 4, growthPerLevel: 0.4 },
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
    implicits: { statKey: 'piercingDamage', baseValue: 3, growthPerLevel: 0.5 },
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
    implicits: { statKey: 'magicDamage', baseValue: 3, growthPerLevel: 0.5 },
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
    implicits: { statKey: 'magicCrit', baseValue: 4, growthPerLevel: 0.4 },
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

/*
  | AttributeKey
  | 'hpRegen' | 'mpRegen' | 'initiative' | 'movement'
  | 'armor' | 'dodge' | 'parry' | 'block' | 'glancingBlow' | 'magicResistance' | 'healing'
  | 'meleeHit' | 'meleeDamage' | 'meleeCrit'
  | 'rangedHit' | 'rangedDamage' | 'rangedCrit'
  | 'magicHit' | 'magicDamage' | 'magicCrit'
  | 'threatMultiplier'
  | ElementStatKey;
*/