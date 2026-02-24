import { Swords, Shield, Target, Wand2, Sparkles, Flame, Skull } from 'lucide-react';
import type { ComponentType } from 'react';
import type { AttackCategory, DamageElement } from './gear';

export type TargetType = 'enemy' | 'ally' | 'self';
export type AreaType = 'single' | 'blast1' | 'blast2' | 'line';

export interface Ability {
  name: string;
  icon: ComponentType<{ className?: string }>;
  mpCost: number;
  range: number;
  target: TargetType;

  area?: AreaType;                  // defaults to 'single'

  // Hit resolution (enemy-targeting only)
  attackCategory?: AttackCategory;  // spell-like
  useWeapon?: boolean;              // weapon-enhanced

  // Effects (applied on hit or on cast)
  damage?: {
    damageElement: DamageElement;
    minDamage: number;
    maxDamage: number;
  };
  dot?: {
    damageElement: DamageElement;
    damagePerRound: number;
    rounds: number;
  };
  heal?: {
    minHeal: number;
    maxHeal: number;
  };
  hot?: {
    healPerRound: number;
    rounds: number;
  }
  buff?: {
    stat: BuffableStat;
    amount: number;
    rounds: number;
  };
  debuff?: {
    stat: BuffableStat;
    amount: number;
    rounds: number;
  };
}

export type AttributeKey = 'strength' | 'toughness' | 'finesse' | 'mind' | 'spirit';
export type ClassKey = 'barbarian' | 'paladin' | 'ranger' | 'mage' | 'shaman';

// ─── Buff / Debuff System ─────────────────────────────────────────────────────

/** Every stat that can be raised or lowered by a buff/debuff. */
export type BuffableStat =
  | AttributeKey
  | 'hpRegen' | 'mpRegen' | 'initiative' | 'movement'
  | 'armor' | 'dodge' | 'magicResistance' | 'healing'
  | 'meleeHit' | 'meleeDamage' | 'meleeCrit'
  | 'rangedHit' | 'rangedDamage' | 'rangedCrit'
  | 'magicHit' | 'magicDamage' | 'magicCrit';

export interface ActiveBuff {
  id: string;              // source key — prevents double-applying the same buff source
  stat: BuffableStat;
  amount: number;          // positive = buff, negative = debuff
  roundsRemaining: number;
}

export interface ActiveHot {
  healPerRound: number;
  roundsRemaining: number;
}

export const ATTRIBUTE_KEYS: AttributeKey[] = ['strength', 'toughness', 'finesse', 'mind', 'spirit'];
const ATTRIBUTE_KEYS_SET = new Set<string>(ATTRIBUTE_KEYS);

export type ArmorProficiency = 'Light' | 'Medium' | 'Heavy';
export type WeaponProficiency =
  | '1h Swords' | '2h Swords'
  | '1h Maces' | '2h Maces'
  | '2h Axes' | '1h Axes'
  | 'Daggers'
  | 'Bows'
  | 'Shields'
  | 'Staves' | 'Wands';

export interface ClassData {
  name: string;
  token: ComponentType<{ className?: string }>;
  color: string;
  description: string;
  attributes: Record<AttributeKey, number>;
  passives: Record<string, number>;
  armorProficiencies: ArmorProficiency[];
  weaponProficiencies: WeaponProficiency[];
  abilities: Ability[];
}

export const CLASSES: Record<ClassKey, ClassData> = {
  barbarian: {
    name: 'Barbarian',
    token: Swords,
    color: 'bg-red-600',
    description: 'A wielder of 2h weapons whose lack of armor is compensated by raw fortitude and battle lust.',
    attributes: { strength: 2, toughness: 4, finesse: 0, mind: 0, spirit: 0 },
    passives: { dodgeBonus: 5, meleeCritBonus: 5 },
    armorProficiencies: ['Light'],
    weaponProficiencies: ['2h Swords', '2h Maces', '2h Axes'],
    abilities: [],
  },
  paladin: {
    name: 'Paladin',
    token: Shield,
    color: 'bg-yellow-500',
    description: 'A shield-bearing knight that heals companions and strikes enemies with holy power.',
    attributes: { strength: 2, toughness: 1, finesse: 0, mind: 0, spirit: 3 },
    passives: { healingBonus: 3, armorBonus: 10 },
    armorProficiencies: ['Medium', 'Heavy'],
    weaponProficiencies: ['1h Swords', '1h Maces', 'Shields'],
    abilities: [
      {
        name: 'Smite',
        icon: Sparkles,
        mpCost: 10,
        range: 3,
        target: 'enemy',
        attackCategory: 'magic',
        damage: { damageElement: 'holy', minDamage: 5, maxDamage: 9 },
      }
    ],
  },
  ranger: {
    name: 'Ranger',
    token: Target,
    color: 'bg-green-600',
    description: 'A bow-wielding wanderer who focuses on ranged ability and poisons.',
    attributes: { strength: 0, toughness: 1, finesse: 4, mind: 1, spirit: 0 },
    passives: { rangedHitBonus: 3, rangedDamageBonus: 3 },
    armorProficiencies: ['Light', 'Medium'],
    weaponProficiencies: ['Daggers', '1h Swords', 'Bows'],
    abilities: [
      {
        name: 'Aimed Shot',
        icon: Target,
        mpCost: 12,
        range: 5,
        target: 'enemy',
        attackCategory: 'ranged',
        damage: { damageElement: 'piercing', minDamage: 9, maxDamage: 9 },
      }
    ],
  },
  mage: {
    name: 'Mage',
    token: Wand2,
    color: 'bg-blue-600',
    description: 'An elementalist who casts devastating spells from afar.',
    attributes: { strength: 0, toughness: 0, finesse: 0, mind: 4, spirit: 2 },
    passives: { magicDamageBonus: 3, magicResistanceBonus: 10 },
    armorProficiencies: ['Light'],
    weaponProficiencies: ['Staves', 'Daggers', 'Wands'],
    abilities: [
      {
        name: 'Fireball',
        icon: Flame,
        mpCost: 15,
        range: 4,
        target: 'enemy',
        area: 'blast1',
        attackCategory: 'magic',
        damage: { damageElement: 'fire', minDamage: 4, maxDamage: 7 },
      }
    ],
  },
  shaman: {
    name: 'Shaman',
    token: Sparkles,
    color: 'bg-purple-600',
    description: 'A wise primalist who can heal themselves and curse enemies.',
    attributes: { strength: 0, toughness: 2, finesse: 0, mind: 2, spirit: 2 },
    passives: { magicResistanceBonus: 10, magicHitBonus: 3 },
    armorProficiencies: ['Light', 'Medium'],
    weaponProficiencies: ['Daggers', '1h Maces', 'Wands', 'Staves', 'Shields'],
    abilities: [
      {
        name: 'Curse',
        icon: Skull,
        mpCost: 7,
        range: 5,
        target: 'enemy',
        attackCategory: 'magic',
        dot: { damageElement: 'shadow', damagePerRound: 5, rounds: 3 }
      }
    ],
  }
};

export const BASE_ATTRIBUTES = 5;
export const TOTAL_POINTS = 6;           // attribute points at level 1 (shared by players and enemies)
export const ATTRIBUTE_POINTS_PER_LEVEL = 3; // additional points per level above 1

const fl = (n: number) => Math.floor(n);

export function getTotalAttribute(
  attr: AttributeKey,
  pointsSpent: Record<AttributeKey, number>,
  selectedClass: ClassKey | null
) {
  return BASE_ATTRIBUTES + pointsSpent[attr] + (selectedClass ? CLASSES[selectedClass].attributes[attr] : 0);
}

export function calculateStats(
  selectedClass: ClassKey | null,
  pointsSpent: Record<AttributeKey, number>,
  gearArmorBonus = 0,
  attrBuffs: Partial<Record<AttributeKey, number>> = {},
) {
  const level = 1;
  const clampAttr = (n: number) => Math.max(0, n);
  const str = clampAttr(getTotalAttribute('strength', pointsSpent, selectedClass) + (attrBuffs.strength ?? 0));
  const tou = clampAttr(getTotalAttribute('toughness', pointsSpent, selectedClass) + (attrBuffs.toughness ?? 0));
  const fin = clampAttr(getTotalAttribute('finesse', pointsSpent, selectedClass) + (attrBuffs.finesse ?? 0));
  const mnd = clampAttr(getTotalAttribute('mind', pointsSpent, selectedClass) + (attrBuffs.mind ?? 0));
  const spr = clampAttr(getTotalAttribute('spirit', pointsSpent, selectedClass) + (attrBuffs.spirit ?? 0));
  const passives = selectedClass ? CLASSES[selectedClass].passives : {};

  return {
    level,
    hp: fl(30 + (2 * tou) + (str / 4) + (2 * level)),
    mp: fl(20 + (4 * mnd) + (2 * spr) + level),
    hpRegen: 1 + fl(spr / 6),
    mpRegen: 1 + fl((spr / 4) + (mnd / 6)),
    initiative: fl(5 + (fin / 3) + (mnd / 4)),
    movement: 3,
    armor: fl(tou + (str / 2)) + (passives.armorBonus || 0) + gearArmorBonus,
    dodge: fl(5 + (fin / 2)) + (passives.dodgeBonus || 0),
    magicResistance: fl(spr + (mnd / 2)) + (passives.magicResistanceBonus || 0),
    healing: fl(spr / 3) + (passives.healingBonus || 0),
    melee: {
      hitBonus: fl((str / 4) + (fin / 3) + (passives.meleeHitBonus || 0)),
      damage: fl((str / 3) + (passives.meleeDamageBonus || 0)),
      crit: fl(5 + (fin / 4) + (str / 4) + (passives.meleeCritBonus || 0))
    },
    ranged: {
      hitBonus: fl(fin / 2) + (passives.rangedHitBonus || 0),
      damage: fl(fin / 3) + (passives.rangedDamageBonus || 0),
      crit: fl(5 + (fin / 2) + (passives.rangedCritBonus || 0))
    },
    magic: {
      hitBonus: fl(mnd / 2) + (passives.magicHitBonus || 0),
      damage: fl(mnd / 3) + (passives.magicDamageBonus || 0),
      crit: fl(5 + (mnd / 2) + (passives.magicCritBonus || 0))
    }
  };
}

export type Stats = ReturnType<typeof calculateStats>;

/**
 * Apply non-attribute buffs/debuffs additively to a Stats block.
 * Attribute buffs are handled upstream by passing attrBuffs into calculateStats /
 * generateEnemyStats so all derived values are recomputed correctly.
 */
export function applyStatBuffs(stats: Stats, buffs: ActiveBuff[]): Stats {
  if (buffs.length === 0) return stats;
  const s = { ...stats, melee: { ...stats.melee }, ranged: { ...stats.ranged }, magic: { ...stats.magic } };
  const clamp = (v: number, min = 0) => Math.max(min, v);
  for (const buff of buffs) {
    if (ATTRIBUTE_KEYS_SET.has(buff.stat)) continue; // handled upstream
    switch (buff.stat) {
      case 'hpRegen':         s.hpRegen         = clamp(s.hpRegen         + buff.amount);    break;
      case 'mpRegen':         s.mpRegen         = clamp(s.mpRegen         + buff.amount);    break;
      case 'initiative':      s.initiative      = clamp(s.initiative      + buff.amount);    break;
      case 'movement':        s.movement        = clamp(s.movement        + buff.amount, 1); break;
      case 'armor':           s.armor           = clamp(s.armor           + buff.amount);    break;
      case 'dodge':           s.dodge           = clamp(s.dodge           + buff.amount);    break;
      case 'magicResistance': s.magicResistance = clamp(s.magicResistance + buff.amount);    break;
      case 'healing':         s.healing         = clamp(s.healing         + buff.amount);    break;
      case 'meleeHit':        s.melee.hitBonus  = clamp(s.melee.hitBonus  + buff.amount);    break;
      case 'meleeDamage':     s.melee.damage    = clamp(s.melee.damage    + buff.amount);    break;
      case 'meleeCrit':       s.melee.crit      = clamp(s.melee.crit      + buff.amount);    break;
      case 'rangedHit':       s.ranged.hitBonus = clamp(s.ranged.hitBonus + buff.amount);    break;
      case 'rangedDamage':    s.ranged.damage   = clamp(s.ranged.damage   + buff.amount);    break;
      case 'rangedCrit':      s.ranged.crit     = clamp(s.ranged.crit     + buff.amount);    break;
      case 'magicHit':        s.magic.hitBonus  = clamp(s.magic.hitBonus  + buff.amount);    break;
      case 'magicDamage':     s.magic.damage    = clamp(s.magic.damage    + buff.amount);    break;
      case 'magicCrit':       s.magic.crit      = clamp(s.magic.crit      + buff.amount);    break;
    }
  }
  return s;
}
