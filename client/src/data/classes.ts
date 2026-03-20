import {
  GiEnrage, GiWaveStrike, GiShardSword, GiHospitalCross, GiMantrap, GiPoison,
  GiFireZone, GiFireSpellCast, GiCursedStar, GiPlantWatering, GiPointySword,
  GiDrippingBlade, GiPoisonBottle, GiEvilEyes, GiSwordBrandish, GiArrowsShield 
} from 'react-icons/gi';

import type { IconType } from 'react-icons';
import type { ComponentType } from 'react';
import type { AttackCategory, DamageElement, WeaponType } from './gear';
import type { AttributeKey, SkillKey, BuffableStat } from './stats';

export type TargetType = 'enemy' | 'ally' | 'self';
export type AreaType = 'single' | 'blast1' | 'blast2' | 'line';
export type EffectTarget = 'target' | 'caster';

export type Effect =
  | { type: 'damage';  appliesTo: EffectTarget; damageElement: DamageElement; minDamage: number; maxDamage: number }
  | { type: 'dot';     appliesTo: EffectTarget; damageElement: DamageElement; damagePerRound: number; rounds: number }
  | { type: 'heal';    appliesTo: EffectTarget; damageElement: DamageElement; minHeal: number; maxHeal: number }
  | { type: 'hot';     appliesTo: EffectTarget; damageElement: DamageElement; healPerRound: number; rounds: number }
  | { type: 'buff';    appliesTo: EffectTarget; damageElement?: DamageElement; stats: Partial<Record<BuffableStat, number>>; statsPercent?: Partial<Record<BuffableStat, number>>; rounds: number }
  | { type: 'debuff';  appliesTo: EffectTarget; damageElement?: DamageElement; stats: Partial<Record<BuffableStat, number>>; statsPercent?: Partial<Record<BuffableStat, number>>; rounds: number }
  | { type: 'threat'; appliesTo: EffectTarget; damageElement?: DamageElement; amount: number;};

export interface Ability {
  name: string;
  icon?: ComponentType<{ className?: string }> | IconType;
  mpCost: number;
  range: number;
  target: TargetType;
  displayElement?: DamageElement;
  area?: AreaType;                  // defaults to 'single'
  attackCategory?: AttackCategory;  // how the hit roll is resolved
  useWeapon?: boolean;              // use equipped weapon for damage
  effects: Effect[];
}

export type ClassKey = 'barbarian' | 'paladin' | 'ranger' | 'pyromancer' | 'shaman'
| 'poisonmaster' | 'nightblade' | 'juggernaut';

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
  targetKey: string;                // passive stat key to add the result to (e.g. 'magicDamage')
}

export interface ClassData {
  name: string;
  color: string;  // hex color for the class circle token
  description: string;
  attributes: Partial<Record<AttributeKey, number>>;
  skills: Partial<Record<SkillKey, number>>;
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
    attributes: { strength: 4, toughness: 4 },
    skills: { evasion: 4, expertise: 2, redoubt: 2 },
    passives: {
      dodge:    { name: 'Evasion',     flat: 5 },
      meleeDamage: { name: 'Battle Fury', flat: 3 },
      movement: { name: 'Rush In', flat: 1 }
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
        mpCost: 12,
        range: 0,
        target: 'enemy',
        useWeapon: true,
        attackCategory: 'melee',
        area: 'blast1',
        effects: []
      }
    ],
  },
  poisonmaster: {
    name: 'Poisonmaster',
    color: 'olivedrab',
    description: "A dagger-wielding alchemist whose toxic concoctions deal damage over time and weaken foes.",
    attributes: { toughness: 3, finesse: 3, mind: 2 },
    skills: { stealth: 2, spellcraft: 3, evasion: 3 },
    passives: {
      poisonResistance: { name: 'Conditioned', flat: 30 }
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
        mpCost: 8,
        range: 1,
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
        mpCost: 10,
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
  nightblade: {
    name: 'Nightblade',
    color: 'midnightblue',
    description: 'A melee acolyte whose dark pacts augment their attacks with shadow magic.',
    attributes: { finesse: 4, mind: 4 },
    skills: { expertise: 2, spellcraft: 4, evasion: 2 },
    armorProficiencies: ['Light', 'Cloth'],
    weaponProficiencies: ['Daggers'],
    passives: {
      shadowDamage: { name: 'Black Mark', flat: 3 },
      shadowResistance: { name: 'Void Blood', flat: 30 }
    },
    abilities: [
      {
        name: 'Shadow Blade',
        icon: GiPointySword,
        mpCost: 9,
        range: 1,
        target: 'enemy',
        displayElement: 'shadow',
        attackCategory: 'melee',
        useWeapon: true,
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'shadow', minDamage: 7, maxDamage: 7 }
        ]
      },
      {
        name: 'Dark Pact',
        icon: GiEvilEyes,
        mpCost: 10,
        range: 0,
        target: 'self',
        displayElement: 'shadow',
        effects: [
          { type: 'damage', appliesTo: 'caster', damageElement: 'shadow', minDamage: 8, maxDamage: 8 },
          { type: 'buff', appliesTo: 'caster', damageElement: 'shadow', stats: { shadowDamage: 8 }, rounds: 5 }
        ]
      }
    ]
  },
  juggernaut: {
    name: 'Juggernaut',
    color: 'saddlebrown',
    description: 'A heavily-armored tank who creates a bulwark between their allies and enemies.',
    attributes: { strength: 3, toughness: 5 },
    skills: { redoubt: 4, evasion: 2, expertise: 2 },
    armorProficiencies: ['Heavy'],
    weaponProficiencies: ['1h Swords', '1h Maces', '1h Axes', 'Shields'],
    passives: {
      threatMultiplier: { name: 'Front and Center', percent: 0.15 },
      armor: { name: 'Bulwark', flat: 20 }
    },
    abilities: [
      {
        name: 'Taunting Blow',
        icon: GiSwordBrandish ,
        mpCost: 8,
        range: 1, 
        target: 'enemy',
        attackCategory: 'melee',
        useWeapon: true,
        effects: [
          { type: 'threat', appliesTo: 'caster',  amount: 10 }
        ]
      },
      {
        name: 'Shield Wall',
        icon: GiArrowsShield ,
        mpCost: 10,
        range: 0,
        target: 'self',
        effects: [
          { type: 'buff', appliesTo: 'caster', stats: { armor: 50 }, rounds: 3 }
        ]
      }
    ]
  },
  paladin: {
    name: 'Paladin',
    color: '#eab308',
    description: 'A shield-bearing knight that heals companions and strikes enemies with holy power.',
    attributes: { strength: 2, toughness: 2, spirit: 4 },
    skills: { devotion: 2, redoubt: 2, spellcraft: 2, expertise: 2 },
    passives: {
      healing: { name: 'Blessed Touch', flat: 3  },
      holyDamage: { name: 'Judgement', flat: 5 }
    },
    scalingPassives: [
      { name: 'Conviction', source: 'spirit', factor: 0.2, targetKey: 'meleeDamage' }
    ],
    armorProficiencies: ['Medium', 'Heavy'],
    weaponProficiencies: ['1h Swords', '1h Maces', 'Shields'],
    abilities: [
      {
        name: 'Blessed Strike',
        icon: GiShardSword,
        mpCost: 12,
        range: 1,
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
        mpCost: 10,
        range: 3,
        target: 'ally',
        displayElement: 'holy',
        attackCategory: 'magic',
        effects: [
          { type: 'heal', appliesTo: 'target', damageElement: 'holy', minHeal: 10, maxHeal: 15 }
        ]
      }
    ],
  },
  ranger: {
    name: 'Ranger',
    color: '#16a34a',
    description: 'A seasoned hunter who uses traps and poisons to hinder foes.',
    attributes: { toughness: 2, finesse: 4, mind: 2 },
    skills: { stealth: 3, perception: 3, expertise: 2 },
    passives: {
      rangedHit:    { name: 'Eagle Eye', flat: 3 },
      rangedDamage: { name: 'Marksman',  flat: 3 },
      initiative: { name: 'Keen Senses', flat: 5 }
    },
    armorProficiencies: ['Light', 'Medium'],
    weaponProficiencies: ['Bows', 'Crossbows'],
    abilities: [
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
      },
      {
        name: 'Hindering Trap',
        icon: GiMantrap,
        mpCost: 10,
        range: 4,
        target: 'enemy',
        attackCategory: 'ranged',
        effects: [
          { type: 'debuff', appliesTo: 'target', stats: { movement: -3 }, rounds: 3 }
        ]
      }
    ],
  },
  pyromancer: {
    name: 'Pyromancer',
    color: 'firebrick',
    description: 'An elementalist of fire who trades mana-sustainability for sheer, destructive power.',
    attributes: { mind: 5, spirit: 3 },
    skills: { spellcraft: 6, perception: 2 },
    passives: {
      fireDamage:      { name: 'Burning Mind', flat: 3  },
      mp:  { name: 'Boiling Reservoir',   flat: 10 }
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
          { type: 'damage', appliesTo: 'target', damageElement: 'fire', minDamage: 6, maxDamage: 10 },
        ],
      },
      {
        name: 'Fire Blast',
        icon: GiFireSpellCast,
        mpCost: 10,
        range: 3,
        target: 'enemy',
        displayElement: 'fire',
        attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'fire', minDamage: 8, maxDamage: 12 }
        ]
      }
    ],
  },
  shaman: {
    name: 'Shaman',
    color: '#9333ea',
    description: 'A wise primalist who can heal themselves and curse enemies.',
    attributes: { toughness: 2, mind: 3, spirit: 3 },
    skills: { devotion: 3, spellcraft: 3, perception: 2 },
    passives: {
      magicResistance: { name: 'Spirit Shield',  flat: 10 },
      magicHit:        { name: 'Primal Sight',   flat: 3  },
    },
    armorProficiencies: ['Light', 'Medium'],
    weaponProficiencies: ['Daggers', '1h Maces', 'Wands', 'Staves', 'Shields'],
    abilities: [
      {
        name: 'Curse',
        icon: GiCursedStar,
        mpCost: 8,
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
        mpCost: 10,
        range: 3,
        displayElement: 'nature',
        target: 'ally',
        effects: [
          { type: 'hot', appliesTo: 'target', damageElement: 'nature', healPerRound: 5, rounds: 3 }
        ]
      }
    ]
  }
};

export const STARTING_CHEST: Record<ClassKey, ArmorProficiency> = {
  barbarian:    'Light',
  poisonmaster: 'Light',
  nightblade:   'Light',
  juggernaut:   'Heavy',
  paladin:      'Heavy',
  ranger:       'Light',
  pyromancer:   'Cloth',
  shaman:       'Medium'
};

export const STARTING_SHIELD: Partial<Record<ClassKey, ArmorProficiency>> = {
  paladin: 'Heavy',
  shaman:  'Medium'
};

export const STARTING_WEAPON: Record<ClassKey, WeaponType> = {
  barbarian:    '2h Axes',
  poisonmaster: 'Daggers',
  nightblade:   'Daggers',
  juggernaut:   '1h Maces',
  paladin:      '1h Swords',
  ranger:       'Crossbows',
  pyromancer:   'Staves',
  shaman:       'Wands'
};

export const STARTING_ELEMENT: Partial<Record<ClassKey, DamageElement>> = {
  pyromancer: 'fire',
  shaman:     'nature'
};

