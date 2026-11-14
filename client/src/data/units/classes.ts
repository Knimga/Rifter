import {
  GiSwordBrandish, GiHospitalCross, GiSacrificialDagger, GiDrippingBlade, GiWaveStrike, GiEnrage, GiFireZone, GiPlantWatering, GiLayeredArmor, GiEvilComet, GiCursedStar, GiBroadsword, GiShield, GiHealthNormal, GiCometSpark, GiHealing, GiHidden, GiAngryEyes,  GiFocusedLightning, GiFlamingArrow, GiStoneAxe, GiSparkSpirit,  GiWolfTrap, GiSplash, GiSunRadiations,
  GiChainedArrowHeads
} from 'react-icons/gi';
import { FaRegSnowflake } from 'react-icons/fa';
import { FaExplosion } from 'react-icons/fa6';
import { TbBow } from "react-icons/tb";

import type { IconType } from 'react-icons';
import type { DamageElement, OffhandKind, WeaponType } from '../gear';
import type { AttributeKey, BuffableStat, SkillKey, ThreatShiftStat } from './stats';
import { warnIgnoredEffects, warnIgnoredPassives, type Ability, type PassiveEffect } from '../combat/abilities';
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

/** A flat/percent stat bonus. The name is optional: only a player's passives are shown by name (PlayerPassive). */
export interface Passive {
  name?: string;
  flat?: number;     // flat bonus added to the stat
  percent?: number;  // percent bonus applied after flats (e.g. 10 = +10%)
}

/** A class's or subclass's stat passive: always named (the class kit lists it by name). Enemies and summons use Passive. */
export type PlayerPassive = Passive & { name: string };

/**
 * Stat passives, keyed by the stat they change (a key that is no stat fails to compile). A threat shift
 * (increasedThreat / reducedThreat: points of the threatMultiplier) is flat only.
 */
export type Passives<P extends Passive = Passive> = {
  [K in BuffableStat]?: K extends ThreatShiftStat ? Omit<P, 'percent'> & { percent?: never } : P;
};

export interface ScalingPassive {
  name: string;
  source: AttributeKey | 'level';  // attribute (or level) to read
  factor: number;                   // multiplier applied to the source value
  targetKey: Exclude<BuffableStat, ThreatShiftStat>; // stat to add the result to (e.g. 'magicDamage')
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
  passives: Passives<PlayerPassive>;
  scalingPassives?: ScalingPassive[];
  /**
   * Behaviors the class has for good (on its members from the start, never run out: PassiveEffect, see
   * party.ts memberPassiveEntries): a trigger (striking back when parried) or an aura. Stat bonuses are `passives`.
   */
  passiveEffects?: PassiveEffect[];
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
    baseHp: 100,
    description: 'A shield-bearing fighter that protects companions.',
    attributes: { strength: 3, toughness: 5, finesse: 1, mind: 2, spirit: 3, speed: 0 },
    skills: { redoubt: 4, devotion: 4, expertise: 2, spellcraft: 2 },
    passives: {
      block:   { name: 'Defender',  flat: 3 },
      healing: { name: 'Protector', flat: 10 },
      healingReceived: { name: 'Blessed', flat: 10 }
    },
    armorProficiencies: ['Heavy'],
    weaponProficiencies: ['1h Swords', '1h Maces', 'Shields'],
    startingGear: { chest: 'Heavy', boots: 'Heavy', weapon: '1h Swords', shield: 'Heavy' },
    model: 'character.knight',
    abilities: [
      {
        name: 'Taunting Blow',
        icon: GiSwordBrandish,
        mpCost: 15, apCost: 1, range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        useWeapon: true,
        effects: [
          { type: 'threat', appliesTo: 'caster', amount: 45 },
        ],
      },
      {
        name: 'Holy Light',
        icon: GiHospitalCross,
        mpCost: 21, apCost: 1, range: 3,
        target: 'ally',
        displayElement: 'holy',
        effects: [
          { type: 'heal', appliesTo: 'target', damageElement: 'holy', minHeal: 18, maxHeal: 27 },
        ],
      },
      {
        name: 'Judgement',
        icon: FaExplosion,
        mpCost: 18, apCost: 1, range: 3,
        target: 'enemy', attackCategory: 'magic',
        displayElement: 'holy',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'holy', minDamage: 30, maxDamage: 36 }
        ]
      }
    ],
  },

  rogue: {
    name: 'Rogue',
    roles: ['melee'],
    baseHp: 70,
    description: 'A dagger-wielding brigand who fights dirty.',
    attributes: { strength: 1, toughness: 1, finesse: 7, mind: 1, spirit: 0, speed: 4 },
    skills: { subtlety: 4, expertise: 4, evasion: 4 },
    passives: {
      dodge:     { name: 'Slippery',    flat: 3 },
      meleeCrit: { name: 'Opportunist', flat: 3 },
      poisonResistance: { name: 'Prior Exposure', flat: 20 }
    },
    armorProficiencies: ['Light'],
    weaponProficiencies: ['Daggers'],
    startingGear: { chest: 'Light', boots: 'Light', weapon: 'Daggers' },
    model: 'character.rogue',
    abilities: [
      {
        name: 'Backstab',
        icon: GiSacrificialDagger,
        mpCost: 15, apCost: 2, range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        useWeapon: true,
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 30, maxDamage: 36 },
        ],
      },
      {
        name: 'Apply Poison',
        icon: GiDrippingBlade,
        mpCost: 18, apCost: 1, range: 0,
        target: 'self',
        displayElement: 'poison',
        effects: [
          {
            type: 'buff', appliesTo: 'target', turns: 5,
            trigger: {
              when: 'attacking',
              categories: ['melee'],
              weaponOnly: true,
              chance: 50,
              effects: [
                { type: 'dot', appliesTo: 'target', damageElement: 'poison', damagePerTurn: 12, turns: 3 },
              ],
            },
          },
        ],
      },
      {
        name: 'Shadowmend',
        icon: GiHidden,
        mpCost: 15, apCost: 1, range: 0,
        target: 'self',
        displayElement: 'shadow',
        effects: [
          { 
            type: 'buff', 
            appliesTo: 'caster', 
            stats: { dodge: 30 }, 
            turns: 3,
            trigger: {
              when: 'attacked', on: 'dodge', chance: 100,
              effects: [
                { type: 'heal', appliesTo: 'caster', damageElement: 'shadow', minHeal: 15, maxHeal: 15 }
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
    baseHp: 100,
    description: 'A powerful warrior who runs in swinging.',
    attributes: { strength: 6, toughness: 6, finesse: 1, mind: 0, spirit: 0, speed: 1 },
    skills: { redoubt: 4, evasion: 6, expertise: 2 },
    passives: {      
      hpRegen: { name: 'Bloodrush', flat: 1 },
      dodge: { name: 'Bob and Weave', flat: 5 },
      glancingBlow:    { name: 'Tough-skinned', flat: 10 }
    },
    armorProficiencies: ['Light', 'Medium'],
    weaponProficiencies: ['2h Swords', '2h Maces', '2h Axes'],
    startingGear: { chest: 'Medium', boots: 'Medium', weapon: '2h Axes' },
    model: 'character.barbarian',
    abilities: [
      {
        name: 'Weaving Strike', //only worth it with 2h, makes melee atk with 1 AP
        icon: GiWaveStrike,
        mpCost: 9, apCost: 1, range: 1,
        target: 'enemy',
        useWeapon: true,
        attackCategory: 'melee',
        effects: [],
      },
      {
        name: 'Rage',
        icon: GiEnrage,
        mpCost: 18, apCost: 1, range: 0,
        target: 'self',
        effects: [
          { type: 'buff', appliesTo: 'target', stats: { hpRegen: 2, strength: 6 }, turns: 3 },
        ],
      },
      {
        name: 'Intimidating Shout',
        icon: GiAngryEyes,
        mpCost: 15, apCost: 1, range: 0,
        target: 'self',
        effects: [
          { type: 'threat', appliesTo: 'caster', amount: 30, percent: 25 }
        ]
      }
    ],
  },

  arcanist: {
    name: 'Arcanist',
    roles: ['caster'],
    baseHp: 55,
    description: 'A scholarly caster who wields elemental magic.',
    attributes: { strength: 0, toughness: 0, finesse: 2, mind: 7, spirit: 4, speed: 1 },
    skills: { spellcraft: 5, devotion: 3, perception: 4 },
    passives: {
      mp:              { name: 'Mental Reservoir', percent: 10 },
      magicResistance: { name: 'Scholar',      percent: 10 },
      magicHit:        { name: 'Well-Trained', flat: 3 }
    },
    armorProficiencies: ['Cloth'],
    weaponProficiencies: ['Staves', 'Daggers', 'Wands', 'Foci'],
    startingGear: { chest: 'Cloth', boots: 'Cloth', weapon: 'Staves', weaponElement: 'fire' },
    model: 'character.arcanist',
    abilities: [
      {
        name: 'Fireball',
        icon: GiFireZone,
        mpCost: 42, apCost: 2, range: 5,
        target: 'enemy',
        area: 'blast1',
        displayElement: 'fire',
        attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'fire', minDamage: 24, maxDamage: 30 }
        ],
      },
      {
        name: 'Freeze',
        icon: FaRegSnowflake,
        mpCost: 18, apCost: 1, range: 5,
        target: 'enemy',
        displayElement: 'ice',
        attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'ice', minDamage: 18, maxDamage: 24 },
          { type: 'root', appliesTo: 'target', turns: 3 }
        ],
      },
      {
        name: 'Lightning Bolt',
        icon: GiFocusedLightning,
        mpCost: 24, apCost: 2, range: 5,
        target: 'enemy',
        displayElement: 'lightning',
        attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'lightning', minDamage: 24, maxDamage: 30 },
          { type: 'debuff', appliesTo: 'target', damageElement: 'lightning', stats: { apMax: -1 }, turns: 1 }
        ]
      }
    ],
  },

  archer: {
    name: 'Archer',
    roles: ['ranged'],
    baseHp: 55,
    description: 'A marksman who deals damage from afar.',
    attributes: { strength: 0, toughness: 1, finesse: 7, mind: 3, spirit: 1, speed: 2 },
    skills: { perception: 2, subtlety: 4, expertise: 4, evasion: 2 },
    passives: {
      rangedHit:    { name: 'Eagle Eye', flat: 3 },
      armor: { name: 'Outfitted',  percent: 10 },
      magicResistance: { name: 'Dungeon Delver', percent: 10 }
    },
    armorProficiencies: ['Light'],
    weaponProficiencies: ['Bows', 'Crossbows', 'Quivers'],
    startingGear: { chest: 'Light', boots: 'Light', weapon: 'Bows', offhand: 'quiver' },
    model: 'character.archer',
    abilities: [
      {
        name: 'Piercing Arrow',
        icon: GiChainedArrowHeads,
        mpCost: 18, apCost: 2, range: 5,
        target: 'enemy',
        useWeapon: true,
        area: 'line',
        attackCategory: 'ranged',
        displayElement: 'physical',
        effects: [],
      },
      {
        name: 'Bear Trap',
        icon: GiWolfTrap,
        mpCost: 12, apCost: 1, range: 3,
        target: 'enemy',
        attackCategory: 'ranged',
        effects: [
          { type: 'root', appliesTo: 'target', turns: 3 },
          { type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 14, maxDamage: 19 },
          { type: 'dot', appliesTo: 'target', damageElement: 'physical', damagePerTurn: 18, turns: 3 }
        ]
      },
      {
        name: 'IncendiArrow',
        icon: GiFlamingArrow ,
        mpCost: 24, apCost: 2, range: 5,
        target: 'enemy',
        displayElement: 'fire',
        area: 'blast1',
        attackCategory: 'ranged',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'fire', minDamage: 9, maxDamage: 9 },
          { type: 'dot', appliesTo: 'target', damageElement: 'fire', damagePerTurn: 18, turns: 3 }
        ],
      },
    ],
  },

  primalist: {
    name: 'Primalist',
    roles: ['tank', 'healer', 'caster'],
    baseHp: 70,
    description: 'A nature-attuned wanderer who can take on many roles.',
    attributes: { strength: 1, toughness: 4, finesse: 1, mind: 4, spirit: 4, speed: 0 },
    skills: { perception: 3, spellcraft: 3, devotion: 3, redoubt: 3 },
    passives: {
      healing:      { name: 'Verdant', flat: 10 },
      natureDamage: { name: 'Attuned',  flat: 10 },
      armor:        { name: 'Stoneskin', percent: 10 }
    },
    armorProficiencies: ['Light', 'Medium'],
    weaponProficiencies: ['Daggers', '1h Maces', '1h Axes', 'Wands', 'Shields'],
    startingGear: { chest: 'Medium', boots: 'Medium', weapon: '1h Maces', shield: 'Medium' },
    model: 'character.primalist',
    abilities: [
      {
        name: 'Lifeburst',
        icon: GiPlantWatering,
        mpCost: 21, apCost: 1, range: 3,
        displayElement: 'nature',
        target: 'ally',
        effects: [
          { type: 'heal', appliesTo: 'target', damageElement: 'nature', minHeal: 12, maxHeal: 18 },
          { type: 'hot', appliesTo: 'target', damageElement: 'nature', healPerTurn: 12, turns: 3 },
        ],
      },
      {
        name: 'Stonestrike',
        icon: GiStoneAxe,
        mpCost: 12, apCost: 1, range: 1,
        displayElement: 'nature',
        target: 'enemy',
        attackCategory: 'magic',
        useWeapon: true,
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'nature', minDamage: 12, maxDamage: 15 }
        ],
      },
      {
        name: 'Harden',
        icon: GiLayeredArmor,
        mpCost: 21, apCost: 1, range: 3,
        area: 'blast1',
        displayElement: 'nature',
        target: 'ally',
        effects: [
          { type: 'buff', appliesTo: 'target', statsPercent: { armor: 20 }, turns: 3 }
        ]
      }
    ],
  },

  occultist: {
    name: 'Occultist',
    roles: ['caster'],
    baseHp: 55,
    description: 'A dark caster of questionable origins.',
    attributes: { strength: 0, toughness: 2, finesse: 1, mind: 8, spirit: 2, speed: 1 },
    skills: { spellcraft: 6, devotion: 2, subtlety: 4 },
    passives: {
      shadowDamage: { name: 'Dark Mark', flat: 10 },
      magicHit:     { name: 'Spite',     flat: 3 },
      shadowResistance: { name: 'Void-touched', flat: 20 }
    },
    armorProficiencies: ['Cloth'],
    weaponProficiencies: ['Staves', 'Wands', 'Foci'],
    startingGear: { chest: 'Cloth', boots: 'Cloth', weapon: 'Wands', weaponElement: 'shadow', offhand: 'focus' },
    model: 'character.occultist',
    abilities: [
      {
        name: 'Wither Bolt',
        icon: GiEvilComet,
        mpCost: 18, apCost: 1, range: 5,
        target: 'enemy',
        displayElement: 'shadow',
        attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'shadow', minDamage: 18, maxDamage: 27 },
          { type: 'debuff', appliesTo: 'target', damageElement: 'shadow', stats: { shadowResistance: -20}, turns: 3 }
        ],
      },
      {
        name: 'Cursed Ground',
        icon: GiCursedStar,
        mpCost: 30, apCost: 2, range: 5,
        target: 'enemy',
        area: 'blast1',
        displayElement: 'shadow',
        attackCategory: 'magic',
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'shadow', damagePerTurn: 20, turns: 3 },
        ],
      },
      {
        name: 'Summon Void Wisp',
        icon: GiSparkSpirit,
        mpCost: 30, apCost: 2, range: 1,
        target: 'tile',
        displayElement: 'shadow',
        effects: [
          { type: 'summon', appliesTo: 'caster', creature: 'void-wisp', turns: 3 },
        ],
      },
    ],
  },

  acolyte: {
    name: 'Acolyte',
    roles: ['healer', 'caster'],
    baseHp: 55,
    description: 'A devotee who heals allies with divine power.',
    attributes: { strength: 0, toughness: 1, finesse: 0, mind: 5, spirit: 8, speed: 0 },
    skills: { spellcraft: 4, devotion: 6, subtlety: 2 },
    passives: {
      healing: { name: 'Inner Light', flat: 10 },
      holyDamage: { name: 'Divine Vengeance', flat: 10 },
      reducedThreat: { name: 'Unassuming', flat: 20 }
    },
    armorProficiencies: ['Cloth'],
    weaponProficiencies: ['Staves', 'Wands', 'Foci'],
    startingGear: { chest: 'Cloth', boots: 'Cloth', weapon: 'Staves', weaponElement: 'holy' },
    model: 'character.acolyte',
    abilities: [
      {
        name: 'Flash Heal',
        icon: GiHealing,
        mpCost: 18, apCost: 1, range: 4,
        target: 'ally',
        displayElement: 'holy',
        effects: [
          { type: 'heal', appliesTo: 'target', damageElement: 'holy', minHeal: 30, maxHeal: 30 },
        ]
      },
      {
        name: 'Blinding Light',
        icon: GiSunRadiations,
        mpCost: 18, apCost: 1, range: 4,
        target: 'enemy',
        displayElement: 'holy', attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'holy', minDamage: 18, maxDamage: 24 },
          { type: 'debuff', appliesTo: 'target', turns: 1, stats: { apMax: -1 }, maxStacks: 1 }
        ]
      },
      {
        name: 'Cleanse',
        icon: GiSplash,
        mpCost: 18, apCost: 1, range: 4,
        target: 'ally',
        area: 'blast2',
        displayElement: 'holy',
        effects: [
          { type: 'dispel', appliesTo: 'allies' }
        ]
      }
    ]
  }
};

// Effects an ability (or a passive trigger) would silently ignore (e.g. a 'target' heal on an enemy-target
// ability): warned at load
for (const [key, c] of Object.entries(CLASSES)) {
  warnIgnoredEffects(`classes › ${key}`, c.abilities);
  warnIgnoredPassives(`classes › ${key}`, c.passiveEffects);
}
