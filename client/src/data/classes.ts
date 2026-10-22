import {
  GiSwordBrandish, GiHospitalCross, GiSacrificialDagger, GiDrippingBlade, GiWaveStrike, GiEnrage,
  GiFireZone, GiPoison, GiPlantWatering, GiLeafSwirl, GiEvilComet, GiCursedStar,
  GiBroadsword, GiShield, GiHealthNormal, GiCometSpark,
} from 'react-icons/gi';
import { FaRegSnowflake } from 'react-icons/fa';
import { RiTargetFill } from 'react-icons/ri';

import type { IconType } from 'react-icons';
import type { ComponentType } from 'react';
import type { AttackCategory, DamageElement, WeaponType } from './gear';
import type { AttributeKey, SkillKey, BuffableStat } from './stats';
import type { ModelLink } from '../forge/core/types';

export type TargetType = 'enemy' | 'ally' | 'self';
export type AreaType = 'single' | 'blast1' | 'blast2' | 'line';
export type EffectTarget = 'target' | 'caster';

export type Effect =
  // damagesMP: the damage goes to the target's MP instead of HP (scaled and reduced exactly like HP
  // damage; generates half the threat)
  | { type: 'damage';  appliesTo: EffectTarget; damageElement: DamageElement; minDamage: number; maxDamage: number; damagesMP?: boolean }
  | { type: 'dot';     appliesTo: EffectTarget; damageElement: DamageElement; damagePerRound: number; rounds: number; damagesMP?: boolean }
  | { type: 'heal';    appliesTo: EffectTarget; damageElement: DamageElement; minHeal: number; maxHeal: number }
  | { type: 'hot';     appliesTo: EffectTarget; damageElement: DamageElement; healPerRound: number; rounds: number }
  | { type: 'buff';    appliesTo: EffectTarget; damageElement?: DamageElement; stats: Partial<Record<BuffableStat, number>>; statsPercent?: Partial<Record<BuffableStat, number>>; rounds: number }
  | { type: 'debuff';  appliesTo: EffectTarget; damageElement?: DamageElement; stats: Partial<Record<BuffableStat, number>>; statsPercent?: Partial<Record<BuffableStat, number>>; rounds: number }
  | { type: 'threat'; appliesTo: EffectTarget; damageElement?: DamageElement; amount: number;};

export interface Ability {
  name: string;
  icon?: ComponentType<{ className?: string }> | IconType;
  mpCost: number;
  apCost: number;                  // action points it takes on the turn (moving and abilities share them)
  range: number;
  target: TargetType;
  displayElement?: DamageElement;
  area?: AreaType;                  // defaults to 'single'
  attackCategory?: AttackCategory;  // how the hit roll is resolved
  useWeapon?: boolean;              // use equipped weapon for damage
  effects: Effect[];
}

export type ClassKey = 'knight' | 'rogue' | 'brute' | 'arcanist' | 'archer' | 'primalist' | 'occultist';

/** What a class is for. Each role has an icon (ROLE_ICONS). */
export type Role = 'damage' | 'tank' | 'healer' | 'caster';

export const ROLE_ICONS: Record<Role, IconType> = {
  damage: GiBroadsword,
  tank:   GiShield,
  healer: GiHealthNormal,
  caster: GiCometSpark,
};

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

/**
 * A playable class. At level 1, attributes are BASE_ATTRIBUTES (5) plus `attributes` (14 points per
 * class) and skills are BASE_SKILLS (0) plus `skills` (12 points per class); there is no point-buy.
 */
export interface ClassData {
  name: string;
  roles: Role[];
  /** HP before attributes and level (stats.ts buildRawStats). */
  baseHp: number;
  description: string;
  attributes: Partial<Record<AttributeKey, number>>;
  skills: Partial<Record<SkillKey, number>>;
  passives: Record<string, Passive>;
  scalingPassives?: ScalingPassive[];
  armorProficiencies: ArmorProficiency[];
  weaponProficiencies: WeaponProficiency[];
  startingGear: StartingGear;
  abilities: Ability[];
  model: ModelLink;  // the class's character design (forge); it holds the member's equipped weapon/offhand
}

/** A class's level-1 kit (no affixes), built by startingGear() in party.ts. */
export interface StartingGear {
  chest: ArmorProficiency;          // armor type of the starting chest piece
  boots: ArmorProficiency;          // armor type of starting boots
  weapon: WeaponType;
  weaponElement?: DamageElement;    // fixed element for magic weapons (otherwise the weapon type's default)
  shield?: ArmorProficiency;        // starting shield type, if any
}

export const CLASSES: Record<ClassKey, ClassData> = {
  knight: {
    name: 'Knight',
    roles: ['tank', 'healer'],
    baseHp: 40,
    description: 'A shield-bearing fighter that protects companions.',
    attributes: { strength: 4, toughness: 3, finesse: 1, mind: 2, spirit: 4, speed: 0 },
    skills: { redoubt: 4, devotion: 4, expertise: 2, spellcraft: 2 },
    passives: {
      block:   { name: 'Defender',  flat: 5 },
      healing: { name: 'Protector', flat: 3 },
    },
    armorProficiencies: ['Medium', 'Heavy'],
    weaponProficiencies: ['1h Swords', '1h Maces', 'Shields'],
    startingGear: { chest: 'Heavy', boots: 'Heavy', weapon: '1h Swords', shield: 'Heavy' },
    model: 'character.knight',
    abilities: [
      {
        name: 'Taunting Blow',
        icon: GiSwordBrandish,
        mpCost: 8,
        apCost: 2,
        range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        useWeapon: true,
        effects: [
          { type: 'threat', appliesTo: 'caster', amount: 10 },
        ],
      },
      {
        name: 'Holy Light',
        icon: GiHospitalCross,
        mpCost: 10,
        apCost: 1,
        range: 3,
        target: 'ally',
        displayElement: 'holy',
        attackCategory: 'magic',
        effects: [
          { type: 'heal', appliesTo: 'target', damageElement: 'holy', minHeal: 10, maxHeal: 15 },
        ],
      },
    ],
  },

  rogue: {
    name: 'Rogue',
    roles: ['damage'],
    baseHp: 30,
    description: 'A dagger-wielding brigand who fights dirty.',
    attributes: { strength: 1, toughness: 1, finesse: 7, mind: 1, spirit: 0, speed: 4 },
    skills: { perception: 2, stealth: 4, expertise: 3, evasion: 3 },
    passives: {
      dodge:     { name: 'Slippery',    flat: 5 },
      meleeCrit: { name: 'Opportunist', flat: 5 },
    },
    armorProficiencies: ['Light'],
    weaponProficiencies: ['Daggers'],
    startingGear: { chest: 'Light', boots: 'Light', weapon: 'Daggers' },
    model: 'character.rogue',
    abilities: [
      {
        name: 'Backstab',
        icon: GiSacrificialDagger,
        mpCost: 5,
        apCost: 2,
        range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        useWeapon: true,
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'piercing', minDamage: 10, maxDamage: 10 },
        ],
      },
      {
        name: 'Poison Blade',
        icon: GiDrippingBlade,
        mpCost: 5,
        apCost: 1,
        range: 1,
        target: 'enemy',
        displayElement: 'poison',
        attackCategory: 'melee',
        useWeapon: true,
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'poison', damagePerRound: 6, rounds: 3 },
        ],
      },
    ],
  },

  brute: {
    name: 'Brute',
    roles: ['damage','tank'],
    baseHp: 40,
    description: 'A powerful warrior who runs in swinging.',
    attributes: { strength: 5, toughness: 5, finesse: 2, mind: 0, spirit: 0, speed: 2 },
    skills: { redoubt: 4, evasion: 4, expertise: 4 },
    passives: {
      glancingBlow: { name: 'Shrug It Off', flat: 10 },
      movement:    { name: 'Rush In', flat: 1 },
    },
    armorProficiencies: ['Light', 'Medium'],
    weaponProficiencies: ['2h Swords', '2h Maces', '2h Axes'],
    startingGear: { chest: 'Medium', boots: 'Medium', weapon: '2h Axes' },
    model: 'character.brute',
    abilities: [
      {
        name: 'Cleave',
        icon: GiWaveStrike,
        mpCost: 15,
        apCost: 3,
        range: 0,
        target: 'enemy',
        useWeapon: true,
        attackCategory: 'melee',
        area: 'blast1',
        effects: [],
      },
      {
        name: 'Battlerush',
        icon: GiEnrage,
        mpCost: 6,
        apCost: 1,
        range: 0,
        target: 'self',
        effects: [
          { type: 'buff', appliesTo: 'target', stats: { hpRegen: 3, strength: 6 }, rounds: 3 },
        ],
      },
    ],
  },

  arcanist: {
    name: 'Arcanist',
    roles: ['caster'],
    baseHp: 25,
    description: 'A scholarly caster who wields elemental magic.',
    attributes: { strength: 0, toughness: 0, finesse: 2, mind: 7, spirit: 4, speed: 1 },
    skills: { spellcraft: 5, devotion: 3, perception: 4 },
    passives: {
      mp:              { name: 'Trained Mind', flat: 10 },
      magicResistance: { name: 'Scholar',      flat: 5 },
    },
    armorProficiencies: ['Cloth'],
    weaponProficiencies: ['Staves', 'Daggers', 'Wands'],
    startingGear: { chest: 'Cloth', boots: 'Cloth', weapon: 'Staves', weaponElement: 'fire' },
    model: 'character.arcanist',
    abilities: [
      {
        name: 'Fireball',
        icon: GiFireZone,
        mpCost: 14,
        apCost: 2,
        range: 5,
        target: 'enemy',
        displayElement: 'fire',
        attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'fire', minDamage: 8, maxDamage: 12 }
        ],
      },
      {
        name: 'Icebolt',
        icon: FaRegSnowflake,
        mpCost: 8,
        apCost: 2,
        range: 4,
        target: 'enemy',
        displayElement: 'ice',
        attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'ice', minDamage: 9, maxDamage: 9 },
          { type: 'debuff', appliesTo: 'target', stats: { movement: -3, dodge: -5 }, rounds: 3 },
        ],
      }
    ],
  },

  archer: {
    name: 'Archer',
    roles: ['damage'],
    baseHp: 25,
    description: 'A marksman who deals damage from afar.',
    attributes: { strength: 0, toughness: 2, finesse: 7, mind: 2, spirit: 1, speed: 2 },
    skills: { perception: 4, stealth: 2, expertise: 4, evasion: 2 },
    passives: {
      rangedHit:    { name: 'Eagle Eye', flat: 5 },
      rangedDamage: { name: 'Marksman',  flat: 3 },
    },
    armorProficiencies: ['Light'],
    weaponProficiencies: ['Bows', 'Crossbows'],
    startingGear: { chest: 'Light', boots: 'Light', weapon: 'Bows' },
    model: 'character.archer',
    abilities: [
      {
        name: 'Aimed Shot',
        icon: RiTargetFill,
        mpCost: 7,
        apCost: 3,
        range: 5,
        target: 'enemy',
        displayElement: 'piercing',
        attackCategory: 'ranged',
        useWeapon: true,
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'piercing', minDamage: 4, maxDamage: 4 },
        ],
      },
      {
        name: 'Poison Arrow',
        icon: GiPoison,
        mpCost: 8,
        apCost: 1,
        range: 5,
        target: 'enemy',
        displayElement: 'poison',
        attackCategory: 'ranged',
        useWeapon: true,
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'poison', damagePerRound: 5, rounds: 3 },
        ],
      },
    ],
  },

  primalist: {
    name: 'Primalist',
    roles: ['damage', 'healer', 'caster'],
    baseHp: 30,
    description: 'A nature-attuned wanderer who can take on many roles.',
    attributes: { strength: 3, toughness: 3, finesse: 1, mind: 3, spirit: 4, speed: 0 },
    skills: { perception: 3, spellcraft: 3, devotion: 3, redoubt: 3 },
    passives: {
      healing:      { name: 'Verdant', flat: 3 },
      natureDamage: { name: 'Thorns',  flat: 3 },
    },
    armorProficiencies: ['Light', 'Medium'],
    weaponProficiencies: ['Daggers', '1h Maces', 'Wands', 'Staves', 'Shields'],
    startingGear: { chest: 'Medium', boots: 'Medium', weapon: '1h Maces', shield: 'Medium' },
    model: 'character.primalist',
    abilities: [
      {
        name: 'Lifeburst',
        icon: GiPlantWatering,
        mpCost: 8,
        apCost: 1,
        range: 3,
        displayElement: 'nature',
        target: 'ally',
        effects: [
          { type: 'heal', appliesTo: 'target', damageElement: 'nature', minHeal: 4, maxHeal: 6 },
          { type: 'hot', appliesTo: 'target', damageElement: 'nature', healPerRound: 4, rounds: 3 },
        ],
      },
      {
        name: 'Earthshock',
        icon: GiLeafSwirl,
        mpCost: 10,
        apCost: 2,
        range: 3,
        displayElement: 'nature',
        target: 'enemy',
        attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'nature', minDamage: 7, maxDamage: 10 },
          { type: 'debuff', appliesTo: 'target', damageElement: 'nature', stats: { apMax: -2 }, rounds: 2 }
        ],
      },
    ],
  },

  occultist: {
    name: 'Occultist',
    roles: ['caster'],
    baseHp: 25,
    description: 'A dark caster of questionable origins.',
    attributes: { strength: 0, toughness: 2, finesse: 1, mind: 8, spirit: 2, speed: 1 },
    skills: { spellcraft: 6, devotion: 2, perception: 2, stealth: 2 },
    passives: {
      shadowDamage: { name: 'Dark Mark', flat: 3 },
      magicHit:     { name: 'Spite',     flat: 5 },
    },
    armorProficiencies: ['Cloth'],
    weaponProficiencies: ['Staves', 'Daggers', 'Wands'],
    startingGear: { chest: 'Cloth', boots: 'Cloth', weapon: 'Wands', weaponElement: 'shadow' },
    model: 'character.occultist',
    abilities: [
      {
        name: 'Shadow Bolt',
        icon: GiEvilComet,
        mpCost: 10,
        apCost: 2,
        range: 4,
        target: 'enemy',
        displayElement: 'shadow',
        attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'shadow', minDamage: 10, maxDamage: 12 },
        ],
      },
      {
        name: 'Curse',
        icon: GiCursedStar,
        mpCost: 8,
        apCost: 1,
        range: 4,
        target: 'enemy',
        displayElement: 'shadow',
        attackCategory: 'magic',
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'shadow', damagePerRound: 7, rounds: 3 },
        ],
      },
    ],
  },
};
