import {
  GiEnrage, GiWaveStrike, GiShardSword, GiHospitalCross, GiOnTarget, GiPoison,
  GiFireZone, GiFireSpellCast, GiCursedStar, GiPlantWatering, GiSonicShout,
  GiDrippingBlade, GiPoisonBottle 
} from 'react-icons/gi';

import type { IconType } from 'react-icons';
import type { ComponentType } from 'react';
import type { AttackCategory, DamageElement } from './gear';
import type { AttributeKey, BuffableStat } from './stats';

export type TargetType = 'enemy' | 'ally' | 'self';
export type AreaType = 'single' | 'blast1' | 'blast2' | 'line';
export type EffectTarget = 'target' | 'caster';

export type Effect =
  | { type: 'damage';  appliesTo: EffectTarget; damageElement: DamageElement; minDamage: number; maxDamage: number }
  | { type: 'dot';     appliesTo: EffectTarget; damageElement: DamageElement; damagePerRound: number; rounds: number }
  | { type: 'heal';    appliesTo: EffectTarget; damageElement: DamageElement; minHeal: number; maxHeal: number }
  | { type: 'hot';     appliesTo: EffectTarget; damageElement: DamageElement; healPerRound: number; rounds: number }
  | { type: 'buff';    appliesTo: EffectTarget; damageElement?: DamageElement; stats: Partial<Record<BuffableStat, number>>; statsPercent?: Partial<Record<BuffableStat, number>>; rounds: number }
  | { type: 'debuff';  appliesTo: EffectTarget; damageElement?: DamageElement; stats: Partial<Record<BuffableStat, number>>; statsPercent?: Partial<Record<BuffableStat, number>>; rounds: number };

export interface Ability {
  name: string;
  icon: ComponentType<{ className?: string }> | IconType;
  mpCost: number;
  range: number;
  target: TargetType;
  displayElement?: DamageElement;
  area?: AreaType;                  // defaults to 'single'
  attackCategory?: AttackCategory;  // how the hit roll is resolved
  useWeapon?: boolean;              // use equipped weapon for damage
  effects: Effect[];
}

export type ClassKey = 'barbarian' | 'paladin' | 'ranger' | 'mage' | 'shaman'
| 'poisonmaster';

export type ArmorProficiency = 'Cloth' | 'Light' | 'Medium' | 'Heavy';
export type WeaponProficiency =
  | '1h Swords' | '2h Swords'
  | '1h Maces' | '2h Maces'
  | '2h Axes' | '1h Axes'
  | 'Daggers'
  | 'Bows' | 'Crossbows'
  | 'Shields'
  | 'Staves' | 'Wands';

export interface Passive {
  name: string;
  flat?: number;     // flat bonus added to the stat
  percent?: number;  // percent bonus applied after flats (e.g. 10 = +10%)
}

export interface ScalingPassive {
  name: string;
  source: AttributeKey | 'level';  // attribute (or level) to read
  factor: number;                   // multiplier applied to the source value
  targetKey: string;                // passive stat key to add the result to (e.g. 'magicDamageBonus')
}

export interface ClassData {
  name: string;
  color: string;  // hex color for the class circle token
  description: string;
  attributes: Record<AttributeKey, number>;
  passives: Record<string, Passive>;
  scalingPassives?: ScalingPassive[];
  armorProficiencies: ArmorProficiency[];
  weaponProficiencies: WeaponProficiency[];
  abilities: Ability[];
}

export const CLASSES: Record<ClassKey, ClassData> = {
  barbarian: {
    name: 'Barbarian',
    color: '#dc2626',
    description: 'A wielder of 2h weapons whose lack of armor is compensated by raw fortitude and battle lust.',
    attributes: { strength: 3, toughness: 3, finesse: 0, mind: 0, spirit: 0 },
    passives: {
      dodgeBonus:    { name: 'Evasion',     flat: 5 },
      meleeCritBonus: { name: 'Battle Fury', flat: 5 },
    },
    armorProficiencies: ['Light'],
    weaponProficiencies: ['2h Swords', '2h Maces', '2h Axes'],
    abilities: [
      {
        name: 'Rage',
        icon: GiEnrage,
        mpCost: 10,
        range: 0,
        target: 'self',
        effects: [
          { type: 'buff', appliesTo: 'caster', stats: { hpRegen: 3, strength: 8 }, rounds: 5 },
        ],
      },
      {
        name: 'Cleave',
        icon: GiWaveStrike,
        mpCost: 8,
        range: 0,
        target: 'enemy',
        useWeapon: true,
        attackCategory: 'melee',
        area: 'blast1',
        effects: []
      },
      {
        name: 'Shout',
        icon: GiSonicShout,
        mpCost: 10,
        range: 0,
        area: 'blast2',
        target: 'enemy',
        attackCategory: 'melee',
        effects: [
          { type: 'debuff', appliesTo: 'target', stats: { meleeDamage: -5 }, rounds: 3}
        ]
      }
    ],
  },
  poisonmaster: {
    name: 'Poisonmaster',
    color: 'olivedrab',
    description: "A shady dagger-wielder whose toxic concoctions deal damage over time and weaken foes.",
    attributes: { strength: 0, toughness: 2, finesse: 3, mind: 1, spirit: 0 },
    passives: {
      toughness: { name: 'Constitution', flat: 3 },
      poisonResistanceBonus: { name: 'Conditioned', flat: 30 }
    },
    scalingPassives: [
      { name: "Venomous Blood", source: 'toughness', factor: (1/3), targetKey: 'poisonDamage' }
    ],
    armorProficiencies: ['Light'],
    weaponProficiencies: ['Daggers', 'Crossbows'],
    abilities: [
      {
        name: 'Poison Blade',
        icon: GiDrippingBlade,
        mpCost: 6,
        range: 0,
        target: 'enemy',
        displayElement: 'poison',
        attackCategory: 'melee',
        useWeapon: true,
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'poison', damagePerRound: 3, rounds: 3 }
        ]
      },
      {
        name: 'Acid Vial',
        icon: GiPoisonBottle,
        mpCost: 9,
        range: 3,
        target: 'enemy',
        area: 'blast1',
        displayElement: 'poison',
        attackCategory: 'ranged',
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'poison', damagePerRound: 5, rounds: 3 }
        ]
      }
    ]
  },
  paladin: {
    name: 'Paladin',
    color: '#eab308',
    description: 'A shield-bearing knight that heals companions and strikes enemies with holy power.',
    attributes: { strength: 2, toughness: 1, finesse: 0, mind: 0, spirit: 3 },
    passives: {
      healingBonus: { name: 'Blessed Touch', flat: 3  },
      armorBonus:   { name: 'Iron Will',     flat: 10 },
    },
    armorProficiencies: ['Medium', 'Heavy'],
    weaponProficiencies: ['1h Swords', '1h Maces', 'Shields'],
    abilities: [
      {
        name: 'Blessed Strike',
        icon: GiShardSword,
        mpCost: 10,
        range: 0,
        target: 'enemy',
        displayElement: 'holy',
        attackCategory: 'melee',
        useWeapon: true,
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'holy', minDamage: 6, maxDamage: 9 },
        ],
      },
      {
        name: 'Holy Light',
        icon: GiHospitalCross,
        mpCost: 8,
        range: 3,
        target: 'ally',
        displayElement: 'holy',
        attackCategory: 'magic',
        effects: [
          { type: 'heal', appliesTo: 'target', damageElement: 'holy', minHeal: 7, maxHeal: 13 }
        ]
      }
    ],
  },
  ranger: {
    name: 'Ranger',
    color: '#16a34a',
    description: 'A bow-wielding wanderer who focuses on ranged ability and poisons.',
    attributes: { strength: 0, toughness: 1, finesse: 4, mind: 1, spirit: 0 },
    passives: {
      rangedHitBonus:    { name: 'Eagle Eye', flat: 3 },
      rangedDamageBonus: { name: 'Marksman',  flat: 3 },
    },
    armorProficiencies: ['Light', 'Medium'],
    weaponProficiencies: ['Daggers', '1h Swords', 'Bows'],
    abilities: [
      {
        name: 'Aimed Shot',
        icon: GiOnTarget,
        mpCost: 12,
        range: 5,
        target: 'enemy',
        attackCategory: 'ranged',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'piercing', minDamage: 12, maxDamage: 12 },
        ],
      },
      {
        name: 'Poison Arrow',
        icon: GiPoison,
        mpCost: 8,
        range: 5,
        target: 'enemy',
        displayElement: 'poison',
        attackCategory: 'ranged',
        useWeapon: true,
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'poison', damagePerRound: 5, rounds: 3 }
        ]
      }
    ],
  },
  mage: {
    name: 'Mage',
    color: '#2563eb',
    description: 'An elementalist who casts devastating spells from afar.',
    attributes: { strength: 0, toughness: 0, finesse: 0, mind: 4, spirit: 2 },
    passives: {
      magicDamageBonus:      { name: 'Arcane Power', flat: 3  },
      magicResistanceBonus:  { name: 'Spell Ward',   flat: 10 },
    },
    armorProficiencies: ['Cloth'],
    weaponProficiencies: ['Staves', 'Daggers', 'Wands'],
    abilities: [
      {
        name: 'Fireball',
        icon: GiFireZone,
        mpCost: 16,
        range: 4,
        target: 'enemy',
        area: 'blast1',
        displayElement: 'fire',
        attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'fire', minDamage: 4, maxDamage: 7 },
        ],
      },
      {
        name: 'Fire Blast',
        icon: GiFireSpellCast,
        mpCost: 9,
        range: 3,
        target: 'enemy',
        displayElement: 'fire',
        attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'fire', minDamage: 8, maxDamage: 10 }
        ]
      }
    ],
  },
  shaman: {
    name: 'Shaman',
    color: '#9333ea',
    description: 'A wise primalist who can heal themselves and curse enemies.',
    attributes: { strength: 0, toughness: 2, finesse: 0, mind: 2, spirit: 2 },
    passives: {
      magicResistanceBonus: { name: 'Spirit Shield',  flat: 10 },
      magicHitBonus:        { name: 'Primal Sight',   flat: 3  },
    },
    armorProficiencies: ['Light', 'Medium'],
    weaponProficiencies: ['Daggers', '1h Maces', 'Wands', 'Staves', 'Shields'],
    abilities: [
      {
        name: 'Curse',
        icon: GiCursedStar,
        mpCost: 7,
        range: 5,
        target: 'enemy',
        displayElement: 'shadow',
        attackCategory: 'magic',
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'shadow', damagePerRound: 5, rounds: 3 },
        ]
      },
      {
        name: 'Regrow',
        icon: GiPlantWatering,
        mpCost: 8,
        range: 3,
        displayElement: 'nature',
        target: 'ally',
        effects: [
          { type: 'hot', appliesTo: 'target', damageElement: 'nature', healPerRound: 5, rounds: 3 }
        ]
      }
    ],
  }
};

