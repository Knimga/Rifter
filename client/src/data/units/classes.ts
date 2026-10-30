import {
  GiSwordBrandish, GiHospitalCross, GiSacrificialDagger, GiDrippingBlade, GiWaveStrike, GiEnrage,
  GiFireZone, GiPlantWatering, GiLayeredArmor, GiEvilComet, GiCursedStar, GiHolosphere,
  GiBroadsword, GiShield, GiHealthNormal, GiCometSpark, GiHealing, GiHidden, GiAngryEyes,
  GiFocusedLightning, GiFlamingArrow, GiStoneAxe, GiSparkSpirit, GiOrbitalRays, GiStickyBoot
} from 'react-icons/gi';
import { FaRegSnowflake } from 'react-icons/fa';
import { FaExplosion } from 'react-icons/fa6';
import { TbBow, TbFocus2 } from "react-icons/tb";

import type { IconType } from 'react-icons';
import type { DamageElement, OffhandKind, WeaponType } from '../gear';
import type { AttributeKey, SkillKey } from './stats';
import { warnIgnoredEffects, type Ability } from '../combat/abilities';
import type { ModelLink } from '../../forge/core/types';

export type ClassKey = 'knight' | 'rogue' | 'barbarian' | 'arcanist' | 'archer' | 'primalist' | 'occultist' | 'acolyte';

/** What a class is for. Each role has an icon (ROLE_ICONS). */
export type Role = 'melee' | 'ranged' | 'tank' | 'healer' | 'caster';

export const ROLE_ICONS: Record<Role, IconType> = {
  melee: GiBroadsword,
  ranged: TbBow,
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
  | 'Shields' | 'Quivers' | 'Foci'
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
  offhand?: OffhandKind;            // starts with that kind's starting offhand (Worn Quiver, Cracked Amethyst)
}

export const CLASSES: Record<ClassKey, ClassData> = {
  knight: {
    name: 'Knight',
    roles: ['tank', 'healer'],
    baseHp: 40,
    description: 'A shield-bearing fighter that protects companions.',
    attributes: { strength: 3, toughness: 5, finesse: 1, mind: 2, spirit: 3, speed: 0 },
    skills: { redoubt: 4, devotion: 4, expertise: 2, spellcraft: 2 },
    passives: {
      block:   { name: 'Defender',  flat: 5 },
      healing: { name: 'Protector', flat: 5 },
      holyCrit: { name: 'Faith', flat: 5 }
    },
    armorProficiencies: ['Heavy'],
    weaponProficiencies: ['1h Swords', '1h Maces', 'Shields'],
    startingGear: { chest: 'Heavy', boots: 'Heavy', weapon: '1h Swords', shield: 'Heavy' },
    model: 'character.knight',
    abilities: [
      {
        name: 'Taunting Blow',
        icon: GiSwordBrandish,
        mpCost: 5,
        apCost: 1,
        range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        useWeapon: true,
        effects: [
          { type: 'threat', appliesTo: 'caster', amount: 15 },
        ],
      },
      {
        name: 'Holy Light',
        icon: GiHospitalCross,
        mpCost: 7,
        apCost: 1,
        range: 3,
        target: 'ally',
        displayElement: 'holy',
        effects: [
          { type: 'heal', appliesTo: 'target', damageElement: 'holy', minHeal: 6, maxHeal: 9 },
        ],
      },
      {
        name: 'Judgement',
        icon: FaExplosion,
        mpCost: 6,
        apCost: 1,
        range: 3,
        target: 'enemy',
        displayElement: 'holy',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'holy', minDamage: 10, maxDamage: 12 }
        ]
      }
    ],
  },

  rogue: {
    name: 'Rogue',
    roles: ['melee'],
    baseHp: 30,
    description: 'A dagger-wielding brigand who fights dirty.',
    attributes: { strength: 1, toughness: 1, finesse: 7, mind: 1, spirit: 0, speed: 4 },
    skills: { perception: 2, subtlety: 4, expertise: 3, evasion: 3 },
    passives: {
      dodge:     { name: 'Slippery',    flat: 5 },
      meleeCrit: { name: 'Opportunist', flat: 5 },
      poisonResistance: { name: 'Stoneblood', flat: 30 }
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
          { type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 10, maxDamage: 12 },
        ],
      },
      {
        name: 'Apply Poison',
        icon: GiDrippingBlade,
        mpCost: 6,
        apCost: 1,
        range: 0,
        target: 'self',
        displayElement: 'poison',
        effects: [
          {
            type: 'buff',
            appliesTo: 'target',
            rounds: 4,
            trigger: {
              when: 'attacking',
              categories: ['melee'],
              weaponOnly: true,
              chance: 40,
              effects: [
                { type: 'dot', appliesTo: 'target', damageElement: 'poison', damagePerRound: 4, rounds: 3 },
              ],
            },
          },
        ],
      },
      {
        name: 'Shadowmend',
        icon: GiHidden,
        mpCost: 5,
        apCost: 1,
        range: 0,
        target: 'self',
        displayElement: 'shadow',
        effects: [
          { 
            type: 'buff', 
            appliesTo: 'caster', 
            stats: { dodge: 30 }, 
            rounds: 3,
            trigger: {
              when: 'attacked', on: 'dodge', chance: 100,
              effects: [
                { type: 'heal', appliesTo: 'caster', damageElement: 'shadow', minHeal: 5, maxHeal: 5 }
              ]
            }
          }
        ]
      }
    ],
  },

  barbarian: {
    name: 'Barbarian',
    roles: ['melee','tank'],
    baseHp: 40,
    description: 'A powerful warrior who runs in swinging.',
    attributes: { strength: 6, toughness: 6, finesse: 1, mind: 0, spirit: 0, speed: 1 },
    skills: { redoubt: 4, evasion: 6, expertise: 2 },
    passives: {
      dodge: { name: 'Duck and Weave', flat: 5 },
      hpRegen: { name: 'Bloodrush', flat: 1 },
      glancingBlow:    { name: 'Tough-skinned', flat: 10 }
    },
    armorProficiencies: ['Light', 'Medium'],
    weaponProficiencies: ['2h Swords', '2h Maces', '2h Axes'],
    startingGear: { chest: 'Medium', boots: 'Medium', weapon: '2h Axes' },
    model: 'character.barbarian',
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
        name: 'Rage',
        icon: GiEnrage,
        mpCost: 6,
        apCost: 1,
        range: 0,
        target: 'self',
        effects: [
          { type: 'buff', appliesTo: 'target', stats: { hpRegen: 3, strength: 6 }, rounds: 3 },
        ],
      },
      {
        name: 'Intimidating Shout',
        icon: GiAngryEyes,
        mpCost: 5,
        apCost: 1,
        range: 0,
        target: 'self',
        effects: [
          { type: 'threat', appliesTo: 'caster', amount: 10, percent: 25 }
        ]
      }
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
      mp:              { name: 'Mental Reservoir', flat: 10 },
      magicResistance: { name: 'Scholar',      flat: 10 },
      magicHit:        { name: 'Well-Trained', flat: 5 }
    },
    armorProficiencies: ['Cloth'],
    weaponProficiencies: ['Staves', 'Daggers', 'Wands', 'Foci'],
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
        area: 'blast1',
        displayElement: 'fire',
        attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'fire', minDamage: 10, maxDamage: 12 }
        ],
      },
      {
        name: 'Freeze',
        icon: FaRegSnowflake,
        mpCost: 6,
        apCost: 1,
        range: 5,
        target: 'enemy',
        displayElement: 'ice',
        attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'ice', minDamage: 6, maxDamage: 8 },
          { type: 'root', appliesTo: 'target', rounds: 3 }
        ],
      },
      {
        name: 'Lightning Bolt',
        icon: GiFocusedLightning,
        mpCost: 7,
        apCost: 2,
        range: 5,
        target: 'enemy',
        displayElement: 'lightning',
        attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'lightning', minDamage: 8, maxDamage: 10 },
          { type: 'debuff', appliesTo: 'target', damageElement: 'lightning', stats: { apMax: -1 }, rounds: 2 }
        ]
      }
    ],
  },

  archer: {
    name: 'Archer',
    roles: ['ranged'],
    baseHp: 25,
    description: 'A marksman who deals damage from afar.',
    attributes: { strength: 0, toughness: 1, finesse: 7, mind: 3, spirit: 1, speed: 2 },
    skills: { perception: 4, subtlety: 2, expertise: 4, evasion: 2 },
    passives: {
      rangedHit:    { name: 'Eagle Eye', flat: 5 },
      rangedDamage: { name: 'Marksman',  flat: 3 },
      magicResistance: { name: 'Seasoned Hunter', flat: 10 }
    },
    armorProficiencies: ['Light'],
    weaponProficiencies: ['Bows', 'Crossbows', 'Quivers'],
    startingGear: { chest: 'Light', boots: 'Light', weapon: 'Bows', offhand: 'quiver' },
    model: 'character.archer',
    abilities: [
      {
        name: 'Concentration',
        icon: TbFocus2,
        mpCost: 5,
        apCost: 1,
        range: 0,
        target: 'self',
        displayElement: 'physical',
        effects: [
          { type: 'buff', appliesTo: 'target', stats: { rangedHit: 5, rangedDamage: 5 }, rounds: 2 },
        ],
      },
      {
        name: 'Sapshot',
        icon: GiStickyBoot,
        mpCost: 5,
        apCost: 1,
        range: 5,
        target: 'enemy',
        attackCategory: 'ranged',
        useWeapon: true,
        effects: [
          { type: 'root', appliesTo: 'target', rounds: 3 }
        ]
      },
      {
        name: 'IncendiArrow',
        icon: GiFlamingArrow ,
        mpCost: 8,
        apCost: 2,
        range: 5,
        target: 'enemy',
        displayElement: 'fire',
        area: 'blast1',
        attackCategory: 'ranged',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'fire', minDamage: 3, maxDamage: 3 },
          { type: 'dot', appliesTo: 'target', damageElement: 'fire', damagePerRound: 5, rounds: 3 }
        ],
      },
    ],
  },

  primalist: {
    name: 'Primalist',
    roles: ['tank', 'healer', 'caster'],
    baseHp: 30,
    description: 'A nature-attuned wanderer who can take on many roles.',
    attributes: { strength: 1, toughness: 4, finesse: 1, mind: 4, spirit: 4, speed: 0 },
    skills: { perception: 3, spellcraft: 3, devotion: 3, redoubt: 3 },
    passives: {
      healing:      { name: 'Verdant', flat: 3 },
      natureDamage: { name: 'Thorns',  flat: 3 },
      armor:        { name: 'Stoneskin', flat: 10 }
    },
    armorProficiencies: ['Light', 'Medium'],
    weaponProficiencies: ['Daggers', '1h Maces', '1h Axes', 'Wands', 'Shields'],
    startingGear: { chest: 'Medium', boots: 'Medium', weapon: '1h Maces', shield: 'Medium' },
    model: 'character.primalist',
    abilities: [
      {
        name: 'Lifeburst',
        icon: GiPlantWatering,
        mpCost: 7,
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
        name: 'Stonestrike',
        icon: GiStoneAxe,
        mpCost: 3,
        apCost: 1,
        range: 1,
        displayElement: 'nature',
        target: 'enemy',
        attackCategory: 'magic',
        useWeapon: true,
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'nature', minDamage: 4, maxDamage: 5 }
        ],
      },
      {
        name: 'Harden',
        icon: GiLayeredArmor,
        mpCost: 7,
        apCost: 1,
        range: 3,
        area: 'blast1',
        displayElement: 'nature',
        target: 'ally',
        effects: [
          { type: 'buff', appliesTo: 'target', stats: { armor: 20 }, rounds: 3 }
        ]
      }
    ],
  },

  occultist: {
    name: 'Occultist',
    roles: ['caster'],
    baseHp: 25,
    description: 'A dark caster of questionable origins.',
    attributes: { strength: 0, toughness: 2, finesse: 1, mind: 8, spirit: 2, speed: 1 },
    skills: { spellcraft: 6, devotion: 2, subtlety: 4 },
    passives: {
      shadowDamage: { name: 'Dark Mark', flat: 3 },
      magicHit:     { name: 'Spite',     flat: 5 },
      shadowResistance: { name: 'Demon-touched', flat: 30 }
    },
    armorProficiencies: ['Cloth'],
    weaponProficiencies: ['Staves', 'Daggers', 'Wands', 'Foci'],
    startingGear: { chest: 'Cloth', boots: 'Cloth', weapon: 'Wands', weaponElement: 'shadow', offhand: 'focus' },
    model: 'character.occultist',
    abilities: [
      {
        name: 'Wither Bolt',
        icon: GiEvilComet,
        mpCost: 6,
        apCost: 1,
        range: 5,
        target: 'enemy',
        displayElement: 'shadow',
        attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'shadow', minDamage: 6, maxDamage: 9 },
          { type: 'debuff', appliesTo: 'target', damageElement: 'shadow', stats: { shadowResistance: -20}, rounds: 3 }
        ],
      },
      {
        name: 'Cursed Ground',
        icon: GiCursedStar,
        mpCost: 10,
        apCost: 2,
        range: 5,
        target: 'enemy',
        area: 'blast1',
        displayElement: 'shadow',
        attackCategory: 'magic',
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'shadow', damagePerRound: 8, rounds: 3 },
        ],
      },
      {
        name: 'Summon Void Wisp',
        icon: GiSparkSpirit,
        mpCost: 10,
        apCost: 2,
        range: 1,
        target: 'tile',
        displayElement: 'shadow',
        effects: [
          { type: 'summon', appliesTo: 'caster', creature: 'void-wisp', rounds: 3 },
        ],
      },
    ],
  },

  acolyte: {
    name: 'Acolyte',
    roles: ['healer', 'caster'],
    baseHp: 25,
    description: 'A devotee who heals allies with divine power.',
    attributes: { strength: 0, toughness: 1, finesse: 0, mind: 5, spirit: 8, speed: 0 },
    skills: { spellcraft: 4, devotion: 6, subtlety: 2 },
    passives: {
      healing: { name: 'Inner Light', flat: 3 },
      holyDamage: { name: 'Divine Vengeance', flat: 3 },
      threatMultiplier: { name: 'Unassuming', percent: -15 }
    },
    armorProficiencies: ['Cloth'],
    weaponProficiencies: ['Staves', 'Wands', 'Foci'],
    startingGear: { chest: 'Cloth', boots: 'Cloth', weapon: 'Staves', weaponElement: 'holy' },
    model: 'character.acolyte',
    abilities: [
      {
        name: 'Flash Heal',
        icon: GiHealing,
        mpCost: 7,
        apCost: 1,
        range: 4,
        target: 'ally',
        displayElement: 'holy',
        effects: [
          { type: 'heal', appliesTo: 'target', damageElement: 'holy', minHeal: 10, maxHeal: 10 },
        ]
      },
      {
        name: 'Consecrate',
        icon: GiOrbitalRays,
        mpCost: 10,
        apCost: 2, 
        range: 4,
        target: 'enemy',
        area: 'blast1',
        displayElement: 'holy',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'holy', minDamage: 4, maxDamage: 8 },
          { type: 'heal',   appliesTo: 'allies', damageElement: 'holy', minHeal: 4, maxHeal: 6 }
        ]
      },
      {
        name: 'Ethershell',
        icon: GiHolosphere,
        mpCost: 5,
        apCost: 1,
        range: 4,
        target: 'ally',
        displayElement: 'holy',
        effects: [
          { type: 'buff', appliesTo: 'target', stats: { magicResistance: 20 }, rounds: 3 }
        ]
      }
    ]
  }
};

// Effects an ability would silently ignore (e.g. a 'target' heal on an enemy-target ability): warned at load
for (const [key, c] of Object.entries(CLASSES)) warnIgnoredEffects(`classes › ${key}`, c.abilities);
