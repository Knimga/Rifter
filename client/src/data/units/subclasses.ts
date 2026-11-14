import {
  GiPoisonBottle, GiDrippingGoo, GiCloakDagger, GiKnifeThrust, GiDivingDagger, GiSwordClash, GiBeamsAura, GiHolyHandGrenade, GiShiningSword, GiExplosionRays, GiSwordWound, GiWaveStrike, GiTronArrow, GiSonicLightning, GiSonicShout, GiBurningMeteor, GiSmallFire, GiLightningFrequency, GiLightningTree, GiPoliceTarget, GiWolfHowl, GiFrozenArrow, GiChargedArrow, GiArrowsShield, GiShieldImpact, GiIceSpear, GiIceShield, GiSpiralArrow, GiTotemMask, GiTwirlyFlower, GiCrownOfThorns, GiSpikedShoulderArmor, GiStoneSpear,
  GiSkullCrack, GiEvilMoon, GiSkullBolt, GiPentacle, GiMarrowDrain,
  GiMidnightClaw,
  GiFlatStar,
  GiSunbeams,
  GiBleedingEye,
  GiSparkles,
  GiTwoFeathers,
  GiRingedBeam,
  GiOrbitalRays
} from 'react-icons/gi';
import { FaBurst } from 'react-icons/fa6';
import { TfiTarget } from "react-icons/tfi";

// Subclasses: each class has three (CLASSES), and each party member picks one of its class's for good (Serivae's
// ritual; PartyMemberConfig.subclass). A subclass is a patch on top of its class: it changes nothing the class has,
// only adds more of the same kinds of things: stat passives (summed with the class's on the same stat: calculateStats),
// scaling passives, passive effects (memberPassiveEffects), abilities (memberAbilities, after the class's) and
// weapon and armor proficiencies (proficienciesOf). Its talent tree is still to come.
import type { Ability, PassiveEffect } from '../combat/abilities';
import { warnIgnoredEffects, warnIgnoredPassives } from '../combat/abilities';
import { CLASSES, type ArmorProficiency, type ClassKey, type Passives, type PlayerPassive, type ScalingPassive, type WeaponProficiency } from './classes';

/** How many subclasses each class has. */
export const SUBCLASSES_PER_CLASS = 3;

export interface SubclassData {
  /** Its id (unique across every class's): what a member keeps (PartyMemberConfig.subclass). */
  id: string;
  name: string;
  /** The class it is a subclass of. */
  classKey: ClassKey;
  /** The color of its talent tree in the UI */
  color: string;
  description: string;
  /** Stat passives, as ClassData.passives: on a stat its class has one on too, both count. */
  passives?: Passives<PlayerPassive>;
  scalingPassives?: ScalingPassive[];
  /** Passive effects (triggers, auras), as ClassData.passiveEffects. */
  passiveEffects?: PassiveEffect[];
  /** Abilities it adds to its class's. */
  abilities?: Ability[];
  /** Armor and weapon proficiencies it adds to its class's ('Shields', 'Quivers' and 'Foci' are weapon ones). */
  armorProficiencies?: ArmorProficiency[];
  weaponProficiencies?: WeaponProficiency[];
}

/** What gear someone can use: its armor and weapon proficiencies (a class's, or a member's: proficienciesOf). */
export interface Proficiencies {
  armorProficiencies: readonly ArmorProficiency[];
  weaponProficiencies: readonly WeaponProficiency[];
}

const KNIGHT_SUBCLASSES: SubclassData[] = [
  {
    id: 'paladin',
    name: 'Paladin',
    classKey: 'knight',
    color: '#f5e31b',
    description: 'A devoted battle-healer who buffs and heals allies in melee.',
    passives: {
      mp: { name: 'Abiding', percent: 10 },
      shadowResistance: { name: 'Deliverance', flat: 20 },
      reducedThreat: { name: 'Divine Assistance', flat: 15 }
    },
    abilities: [
      {
        name: 'Healing Aura',
        icon: GiBeamsAura,
        mpCost: 21, apCost: 2, range: 0,
        target: 'self',
        displayElement: 'holy',
        effects: [
          {
            type: 'aura', appliesTo: 'caster', damageElement: 'holy', turns: 3,
            aura: {
              area: 'blast1',
              includesBearer: true,
              effects: [{ type: 'hot', appliesTo: 'allies', damageElement: 'holy', healPerTurn: 12 }]
            }
          }
        ]
      },
      {
        name: 'Blessed Weapon',
        icon: GiHolyHandGrenade,
        mpCost: 18, apCost: 1, range: 3,
        target: 'ally',
        displayElement: 'holy',
        effects: [
          { type: 'buff', appliesTo: 'target', turns: 5, 
            trigger: {
              when: 'attacking', on: 'hit', weaponOnly: true,
              effects: [{ type: 'heal', appliesTo: 'caster', damageElement: 'holy', minHeal: 9, maxHeal: 9 }]
            }
          }
        ]
      }
    ]
  },
  {
    id: 'inquisitor',
    name: 'Inquisitor',
    classKey: 'knight',
    color: '#9c823d',
    description: 'A zealous warrior who purges enemies in holy fire.',
    passives: {
      holyCrit: { name: 'Vengeance', flat: 3 },
      holyHit: { name: 'Potent Faith', flat: 3 }
    },
    scalingPassives: [
      { name: 'Holy Might', source: 'strength', factor: 1, targetKey: 'holyDamage' }
    ],
    weaponProficiencies: ['2h Swords'],
    abilities: [
      {
        name: 'Purify Weapon',
        icon: GiShiningSword,
        mpCost: 18, apCost: 1, range: 0,
        target: 'self', displayElement: 'holy',
        effects: [
          { type: 'buff', appliesTo: 'caster', turns: 5,
            trigger: {
              when: 'attacking', on: 'hit', categories: ['melee'], weaponOnly: true, effects: [
                { type: 'damage', appliesTo: 'target', damageElement: 'holy', minDamage: 12, maxDamage: 15 }
              ]
            }
          }
        ]
      },
      {
        name: 'Holy Shock',
        icon: FaBurst,
        mpCost: 21, apCost: 2, range: 3,
        target: 'enemy', displayElement: 'holy', attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'holy', minDamage: 45, maxDamage: 45 }
        ]
      }
    ]
  },
  {
    id: 'templar',
    name: 'Templar',
    classKey: 'knight',
    color: '#b5b0a1',
    description: 'An armored crusader who uses divine power to withstand any assault.',
    passives: {
      block: { name: 'Bastion', flat: 3 },
      magicResistance: { name: 'Warded', percent: 10 },
      increasedThreat: { name: 'Oath', flat: 10 }
    },
    abilities: [
      {
        name: 'Vindication',
        icon: GiSwordWound,
        mpCost: 18, apCost: 1, range: 0,
        target: 'self', displayElement: 'holy',
        effects: [
          { type: 'buff', appliesTo: 'caster', turns: 3, 
            trigger: {
              when: 'attacking', on: 'hit', effects: [
                { type: 'heal', appliesTo: 'caster', damageElement: 'holy', minHeal: 6, maxHeal: 6 }
              ]
            }
          }
        ]
      },
      {
        name: 'Illuminate',
        icon: GiExplosionRays,
        mpCost: 27, apCost: 2, range: 0,
        target: 'enemy', area: 'blast2', attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'holy', minDamage: 12, maxDamage: 18 }
        ]
      }
    ]
  }
];

const ROGUE_SUBCLASSES: SubclassData[] = [
  {
    id: 'duelist',
    name: 'Duelist',
    classKey: 'rogue',
    color: '#a67702',
    description: 'An agile swordsman that exploits weak points and pierces defenses.',
    passives: {
      parry: { name: 'Blademaster', flat: 3 },
      physicalPenetration: { name: 'Weak Points', flat: 10 },
      meleeDamage: { name: 'Precision', flat: 10 }
    },
    weaponProficiencies: ['1h Swords'],
    abilities: [
      {
        name: 'Skewer',
        icon: GiDivingDagger,
        mpCost: 18, apCost: 2, range: 2,
        target: 'enemy',
        attackCategory: 'melee',
        displayElement: 'physical',
        area: 'line',
        useWeapon: true,
        effects: []
      },
      {
        name: 'Readying Strike',
        icon: GiSwordClash,
        mpCost: 15, apCost: 2, range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        displayElement: 'physical',
        useWeapon: true,
        effects: [
          { type: 'buff', appliesTo: 'caster', stats: { parry: 20 }, turns: 3 }
        ]
      }
    ]
  },
  {
    id: 'poisonmaster',
    name: 'Poisonmaster',
    classKey: 'rogue',
    color: '#0e4213',
    description: 'A wicked alchemist whose poisons damage over time and weaken foes.',
    passives: {
      toughness: { name: 'Inured', flat: 4 },
      poisonResistance: { name: 'Overexposure', flat: 30 }
    },
    scalingPassives: [
      { name: 'Venomblood', source: 'toughness', factor: 1, targetKey: 'poisonDamage' }
    ],
    weaponProficiencies: ['Foci'],
    abilities: [
      {
        name: 'Poison Vial',
        icon: GiPoisonBottle,
        mpCost: 15, apCost: 2, range: 3,
        target: 'enemy',
        attackCategory: 'melee',
        area: 'blast1',
        displayElement: 'poison',
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'poison', damagePerTurn: 15, turns: 3, maxStacks: 3 }
        ]
      },
      {
        name: 'Melt Armor',
        icon: GiDrippingGoo,
        mpCost: 18, apCost: 2, range: 3,
        target: 'enemy', attackCategory: 'melee',
        displayElement: 'poison',
        effects: [
          { type: 'debuff', appliesTo: 'target', damageElement: 'poison', statsPercent: { armor: -30 }, turns: 3 }
        ]
      }
    ]
  },
  {
    id: 'nightblade',
    name: 'Nightblade',
    classKey: 'rogue',
    color: '#231b42',
    description: 'A shifting shade who makes dark pacts to deal shadow damage.',
    passives: {
      mind: { name: 'Dark Drive', flat: 4 },
      dodge: { name: 'Blurred Form', flat: 3 }
    },
    scalingPassives: [
      { name: 'Void Pact', source: 'mind', factor: 1, targetKey: 'shadowDamage' }
    ],
    abilities: [
      {
        name: 'Baneblade',
        icon: GiKnifeThrust,
        mpCost: 21, apCost: 2, range: 1,
        target: 'enemy', attackCategory: 'melee',
        displayElement: 'shadow',
        useWeapon: true,
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'shadow', minDamage: 30, maxDamage: 30 }
        ]
      },
      {
        name: 'Shadowstep',
        icon: GiCloakDagger,
        mpCost: 15, apCost: 1, range: 5,
        move: { style: 'blink', throughEnemies: true, throughObstacles: true },
        target: 'tile',
        displayElement: 'shadow',        
        effects: []
      }
    ]
  }
];

const BARBARIAN_SUBCLASSES: SubclassData[] = [
  {
    id: 'berserker',
    name: 'Berserker',
    classKey: 'barbarian',
    color: '#c21b1b',
    description: 'A wild savage who eschews armor for raw fortitude and battle lust.',
    passives: {
      meleeCrit: { name: 'Devastating', flat: 3 },
      hpRegen: { name: 'Blood Boil', flat: 1 }
    },
    scalingPassives: [
      { name: 'Resilience', source: 'strength', factor: 1, targetKey: 'armor' }
    ],
    abilities: [
      {
        name: 'Cleave',
        icon: GiWaveStrike,
        mpCost: 30, apCost: 3, range: 0,
        target: 'enemy', attackCategory: 'melee',
        area: 'blast1', useWeapon: true,
        effects: []
      },
      {
        name: 'Intervene',
        icon: GiTronArrow,
        mpCost: 15, apCost: 2, range: 5,
        target: 'enemy', attackCategory: 'melee',
        move: { style: 'dash', throughEnemies: true },
        useWeapon: true,
        effects: []
      }
    ]
  },
  {
    id: 'warlord',
    name: 'Warlord',
    classKey: 'barbarian',
    color: '#112599',
    description: 'An imposing leader with flashy attacks that controls the flow of battle.',
    passives: {
      mp: { name: 'Tactician', percent: 10 },
      lightningDamage: { name: 'Shock & Awe', flat: 10 },
      meleeHit: { name: 'Controlled Fury', flat: 3 }
    },
    armorProficiencies: ['Heavy'],
    abilities: [
      {
        name: 'Thunder Rush',
        icon: GiSonicLightning,
        mpCost: 21, apCost: 3, range: 5,
        target: 'enemy', attackCategory: 'melee', displayElement: 'lightning',
        move: { style: 'dash' }, area: 'blast1',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'lightning', minDamage: 15, maxDamage: 21 }
        ]
      },
      {
        name: 'Battleshout',
        icon: GiSonicShout,
        mpCost: 21, apCost: 1, range: 0,
        target: 'ally', area: 'blast2',
        effects: [
          { type: 'buff', appliesTo: 'target', stats: { meleeHit: 5, magicHit: 5, rangedHit: 5 }, turns: 3, maxStacks: 1 }
        ]
      }
    ]
  },
  {
    id: 'juggernaut',
    name: 'Juggernaut',
    classKey: 'barbarian',
    color: '#543818',
    description: 'An immovable tank who creates a bulwark between enemies and allies.',
    passives: {
      increasedThreat: { name: 'Hulking', flat: 20 },
      hp: { name: 'Fortified', percent: 10 }

    },
    armorProficiencies: ['Heavy'],
    weaponProficiencies: ['Shields'],
    abilities: [
      {
        name: 'Shield Wall',
        icon: GiArrowsShield,
        mpCost: 21, apCost: 2, range: 0,
        target: 'self',
        effects: [
          { type: 'buff', appliesTo: 'caster', stats: { block: 20 }, turns: 3 }
        ]
      },
      {
        name: 'Sunder Armor',
        icon: GiShieldImpact,
        mpCost: 15, apCost: 1, range: 1,
        target: 'enemy', attackCategory: 'melee', displayElement: 'physical', useWeapon: true,
        effects: [
          { type: 'debuff', appliesTo: 'target', statsPercent: { armor: -12 }, turns: 3, maxStacks: 3 }
        ]
      }
    ]
  }
];

const ARCANIST_SUBCLASSES: SubclassData[] = [
  {
    id: 'pyromancer',
    name: 'Pyromancer',
    classKey: 'arcanist',
    color: '#ff9100',
    description: 'An elementalist of fire who focuses on raw damage at the expense of everything else.',
    passives: {
      fireCrit: { name: 'Wild Spell', flat: 3 },
      firePenetration: { name: 'Burning Mind', flat: 10 },
      fireResistance: { name: 'Pre-cooked', flat: 20 }
    },
    abilities: [
      {
        name: 'Pyroblast',
        icon: GiBurningMeteor,
        mpCost: 30, apCost: 2, range: 6,
        target: 'enemy', displayElement: 'fire', attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'fire', minDamage: 30, maxDamage: 42 }
        ]
      },
      {
        name: 'Scorch',
        icon: GiSmallFire,
        mpCost: 18, apCost: 1, range: 5,
        target: 'enemy', displayElement: 'fire', attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'fire', minDamage: 15, maxDamage: 21 },
          { type: 'dot', appliesTo: 'target', damageElement: 'fire',
            damagePerTurn: 9, turns: 3, maxStacks: 3 }
        ]
      }
    ]
  },
  {
    id: 'iceweaver',
    name: 'Iceweaver',
    classKey: 'arcanist',
    color: '#96e8ff',
    description: 'A disciplined frost slinger who slows and stops enemies while dealing solid damage.',
    passives: {
      iceHit: { name: 'Controlled', flat: 3 },
      iceResistance: { name: 'Chilled', flat: 20 },
      armor: { name: 'Permafrost', percent: 10 }
    },
    abilities: [
      {
        name: 'Icebolt',
        icon: GiIceSpear,
        mpCost: 21, apCost: 2, range: 5,
        target: 'enemy', displayElement: 'ice', attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'ice', minDamage: 21, maxDamage: 27 },
          { type: 'debuff', appliesTo: 'target', damageElement: 'ice',
            stats: { movement: -1 }, turns: 3, maxStacks: 2 }
        ]
      },
      {
        name: 'Ice Armor',
        icon: GiIceShield,
        mpCost: 15, apCost: 1, range: 0,
        target: 'self', displayElement: 'ice',
        effects: [
          { type: 'buff', appliesTo: 'target', damageElement: 'ice',
            statsPercent: { armor: 30 }, turns: 3, maxStacks: 1,
            trigger: {
              when: 'attacked', on: 'hit', categories: ['melee'],
              effects: [{ type: 'root', appliesTo: 'target', turns: 2 }]
            }
          }
        ]
      }
    ]
  },
  {
    id: 'shockmage',
    name: 'Shockmage',
    classKey: 'arcanist',
    color: '#00bbff',
    description: 'A lightning-rod caster who casts fast, manipulates MP and stuns enemies.',
    passives: {
      mpRegen: { name: 'Charged', flat: 1 },
      lightningResistance: { name: 'Grounded', flat: 20 },
      dodge: { name: 'Hyper', flat: 3 }
    },
    abilities: [
      {
        name: 'Zap',
        icon: GiLightningFrequency,
        mpCost: 15, apCost: 1, range: 4,
        target: 'enemy', displayElement: 'lightning', attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'lightning', minDamage: 18, maxDamage: 21 }
        ]
      },
      {
        name: 'Lightning Arc',
        icon: GiLightningTree,
        mpCost: 36, apCost: 2, range: 5,
        target: 'enemy', displayElement: 'lightning', attackCategory: 'magic', area: 'line',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'lightning', minDamage: 21, maxDamage: 27 }
        ]
      }
    ]
  }
];

const ARCHER_SUBCLASSES: SubclassData[] = [
  {
    id: 'assassin',
    name: 'Assassin',
    classKey: 'archer',
    color: '#5e0005',
    description: 'A ruthless killer who eliminates targets and vanishes without a trace.',
    passives: {
      reducedThreat: { name: 'Unseen', flat: 10 },
      rangedHit: { name: 'Preternatural', flat: 3 },
      physicalPenetration: { name: 'Find Weakness', flat: 10 }
    },
    abilities: [
      {
        name: 'Aimed Shot',
        icon: TfiTarget,
        mpCost: 21, apCost: 3, range: 6,
        target: 'enemy', attackCategory: 'ranged', displayElement: 'physical', useWeapon: true,
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 30, maxDamage: 30 }
        ]
      },
      {
        name: 'Stalk Prey',
        icon: GiPoliceTarget,
        mpCost: 18, apCost: 1, range: 0,
        target: 'self',
        effects: [
          { type: 'buff', appliesTo: 'target', stats: { rangedHit: 5, reducedThreat: 10 }, turns: 3 }
        ]
      }
    ]
  },
  {
    id: 'ranger', name: 'Ranger',
    classKey: 'archer', color: '#25572b',
    description: 'A versatile hunter who uses traps, poisons, and summoned pets.',
    passives: {
      initiative: { name: 'Awareness', flat: 5 },
      toughness: { name: 'Weathered', flat: 4 },
      natureResistance: { name: 'Wanderer', flat: 20 }
    },
    armorProficiencies: ['Medium'],
    abilities: [
      {
        name: 'Summon Wolf',
        icon: GiWolfHowl,
        mpCost: 30, apCost: 3, range: 1,
        target: 'tile',
        effects: [
          { type: 'summon', appliesTo: 'caster', creature: 'wolf', turns: 'forever' }
        ]
      },
      {
        name: 'Poisoned Arrow',
        icon: GiSpiralArrow,
        mpCost: 15, apCost: 1, range: 5,
        target: 'enemy', attackCategory: 'ranged', displayElement: 'poison', useWeapon: true,
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'poison', damagePerTurn: 18, turns: 3, maxStacks: 3 }
        ]
      }
    ]
  },
  {
    id: 'arcane-archer', name: 'Arcane Archer',
    classKey: 'archer', color: '#00a69e',
    description: 'A marksman-turned-magus who empowers their arrows with elemental magic.',
    passives: {
      mind: { name: 'Arcane Study', flat: 4 },
      magicResistance: { name: 'Well-versed', percent: 10 },
      mp: { name: 'Mental Reservoir', percent: 10 }
    },
    abilities: [
      {
        name: 'Ice Arrow',
        icon: GiFrozenArrow,
        mpCost: 15, apCost: 1, range: 5,
        target: 'enemy', attackCategory: 'ranged', displayElement: 'ice',
        useWeapon: true,
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'ice', minDamage: 6, maxDamage: 6 },
          { type: 'debuff', appliesTo: 'target', turns: 3, stats: { movement: -1 }, maxStacks: 1 }
        ]
      },
      {
        name: 'Lightning Arrow',
        icon: GiChargedArrow,
        mpCost: 24, apCost: 2, range: 5,
        target: 'enemy', attackCategory: 'ranged', displayElement: 'lightning', area: 'line', 
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'lightning', minDamage: 15, maxDamage: 21 },
        ]
      }
    ]
  }
];

const PRIMALIST_SUBCLASSES: SubclassData[] = [
  {
    id: 'shaman', name: 'Shaman',
    classKey: 'primalist', color: '#40857d',
    description: 'A totemic spiritualist who walks the line between nature magic and voodoo.',
    passives: {
      magicResistance: { name: 'Wisdom', percent: 10 },
      meleeHit: { name: 'Primal Strikes', flat: 3 },
      magicDamage: { name: 'Spirit Boon', flat: 10 }
    },
    abilities: [
      {
        name: 'Curse of Mending',
        icon: GiSkullCrack,
        mpCost: 15, apCost: 1, range: 4,
        target: 'enemy', attackCategory: 'magic', displayElement: 'shadow',
        effects: [
          { type: 'debuff', appliesTo: 'target', damageElement: 'shadow', turns: 3, maxStacks: 1, trigger: {
            when: 'attacking', on: 'hit', chance: 50,
            effects: [
              { type: 'heal', appliesTo: 'target', damageElement: 'shadow', minHeal: 18, maxHeal: 24 }
            ]
          }}
        ]
      },
      {
        name: 'Vigor Totem',
        icon: GiTotemMask,
        mpCost: 21, apCost: 1, range: 3,
        target: 'tile', displayElement: 'nature',
        effects: [{ type: 'summon', appliesTo: 'caster', creature: 'vigor-totem', turns: 3 }]
      }
    ]
  },
  {
    id: 'druid', name: 'Druid',
    classKey: 'primalist', color: '#26661f',
    description: 'A nature-attuned healer who summons vines and creatures during battle.',
    passives: {
      natureResistance: { name: 'Forest Walker', flat: 20 },
      mp: { name: 'Spell Focus', percent: 10 },
      reducedThreat: { name: 'Leaf Cover', flat: 10 }
    },
    weaponProficiencies: ['Staves'],
    armorProficiencies: ['Cloth'],
    abilities: [
      {
        name: 'Bloom',
        icon: GiTwirlyFlower,
        mpCost: 27, apCost: 1, range: 4,
        target: 'ally', displayElement: 'nature', area: 'blast1',
        effects: [
          { type: 'heal', appliesTo: 'target', damageElement: 'nature', minHeal: 21, maxHeal: 27 }
        ]
      },
      {
        name: 'Thorns',
        icon: GiCrownOfThorns,
        mpCost: 15, apCost: 1, range: 4,
        target: 'ally', displayElement: 'nature',
        effects: [
          { type: 'buff', appliesTo: 'target', damageElement: 'nature', turns: 3,
            trigger: {
              when: 'attacked', on: 'hit', effects: [
                { type: 'damage', appliesTo: 'target', damageElement: 'nature', minDamage: 12, maxDamage: 15 }
              ]
            }
          }
        ]
      }
    ]
  },
  {
    id: 'geomancer', name: 'Geomancer',
    classKey: 'primalist', color: '#825911',
    description: 'A devotee of earth and stone with exceptional fortitude who buffs allies and absorbs attacks.',
    passives: {      
      increasedThreat: { name: 'Mountainous', flat: 10 },
      toughness: { name: 'Venerable', flat: 4 },
      glancingBlow: { name: 'Solid', flat: 5 }
    },
    abilities: [
      {
        name: 'Stoneskin',
        icon: GiSpikedShoulderArmor,
        mpCost: 15, apCost: 1, range: 3,
        target: 'ally', displayElement: 'nature',
        effects: [
          {type: 'buff', appliesTo: 'target', damageElement: 'nature', statsPercent: { armor: 40 }, turns: 3, maxStacks: 1 }
        ]
      },
      {
        name: 'Boulder Strike',
        icon: GiStoneSpear,
        mpCost: 12, apCost: 1, range: 1,
        target: 'enemy', displayElement: 'nature',
        attackCategory: 'melee',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'nature', minDamage: 21, maxDamage: 27 },
          { type: 'threat', appliesTo: 'caster', amount: 30}
        ]
      }
    ]
  }
];

const OCCULTIST_SUBCLASSES: SubclassData[] = [
  {
    id: 'shadowmage', name: 'Shadowmage',
    classKey: 'occultist', color: '#5500c4',
    description: 'A dark caster who goes to any length in pursuit of pure destructive power.',
    passives: {
      shadowDamage: { name: 'Ruin', flat: 10 },
      shadowPenetration: { name: 'Soulpiercer', flat: 10 },
      hp: { name: 'Fel Fortitude', percent: 10 }
    },
    abilities: [
      {
        name: 'Black Plasma',
        icon: GiSkullBolt,
        mpCost: 39, apCost: 2, range: 5,
        target: 'enemy', attackCategory: 'magic', displayElement: 'shadow',
        area: 'blast1',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'shadow', minDamage: 24, maxDamage: 33 }
        ]
      },
      {
        name: 'Dark Pact',
        icon: GiPentacle,
        mpCost: 0, apCost: 1, range: 0,
        target: 'self', displayElement: 'shadow',
        effects: [
          { type: 'damage', appliesTo: 'caster', damageElement: 'shadow', minDamage: 21, maxDamage: 21 },
          { type: 'buff', appliesTo: 'caster', damageElement: 'shadow', stats: { shadowDamage: 20, mpRegen: 2 }, turns: 3 }
        ]
      }
    ]
  },
  {
    id: 'warlock', name: 'Warlock',
    classKey: 'occultist', color: '#3a2952',
    description: 'A master of curses and drains that debilitates and withers enemies away.',
    passives: {
      hpRegen: { name: 'Siphoner', flat: 1 },
      shadowHit: { name: 'Spirit Lock', flat: 3 },
      reducedThreat: { name: 'Furtive', flat: 10 }
    }, 
    abilities: [
      {
        name: 'Agony',
        icon: GiBleedingEye,
        mpCost: 20, apCost: 1, range: 5,
        target: 'enemy', attackCategory: 'magic', displayElement: 'shadow',
        effects: [
          { type: 'dot',    appliesTo: 'target', damageElement: 'shadow', damagePerTurn: 24, turns: 3, maxStacks: 3 }
        ]
      },
      {
        name: 'Enfeeble',
        icon: GiMarrowDrain,
        mpCost: 18, apCost: 1, range: 5,
        target: 'enemy', attackCategory: 'magic', displayElement: 'shadow',
        area: 'blast1',
        effects: [
          { type: 'debuff', appliesTo: 'target', stats: { strength: -4, toughness: -4, speed: -4 }, turns: 3 }
        ]
      }
    ]
  },
  {
    id: 'summoner', name: 'Summoner',
    classKey: 'occultist', color: '#353347',
    description: "An adept of planar transitions who commands demons and familiars.",
    passives: {
      healing: { name: 'Soul Link', flat: 10 },
      armor: { name: 'Demonskin', percent: 10 },

    },
    abilities: [
      {
        name: 'Summon Fiend',
        icon: GiMidnightClaw,
        mpCost: 36, apCost: 3, range: 1,
        target: 'tile',
        effects: [
          { type: 'summon', appliesTo: 'caster', creature: 'fiend', turns: 'forever'}
        ]
      },
      {
        name: 'Fel Frenzy',
        icon: GiEvilMoon,
        mpCost: 21, apCost: 1, range: 3,
        target: 'ally', summonsOnly: true, displayElement: 'shadow',
        effects: [
          { type: 'heal', appliesTo: 'target', damageElement: 'shadow', minHeal: 9, maxHeal: 12 },
          { type: 'buff', appliesTo: 'target', damageElement: 'shadow', turns: 1, trigger: {
            when: 'attacking', on: 'hit', effects: [
              { type: 'damage', appliesTo: 'target', damageElement: 'shadow', minDamage: 9, maxDamage: 12 },
              { type: 'heal', appliesTo: 'caster', damageElement: 'shadow', minHeal: 9, maxHeal: 12 }
            ]
          }}
        ]
      }
    ]
  }
];

const ACOLYTE_SUBCLASSES: SubclassData[] = [
  {
    id: 'priest', name: 'Priest',
    classKey: 'acolyte', color: '#fffec7',
    description: 'A powerful healer that covers the battlefield in holy light.',
    passives: {
      mp: { name: 'Mental Strength', percent: 10 },
      hp: { name: 'Body & Mind', percent: 10 },
      healing: { name: 'Rapture', percent: 5 }
    },
    abilities: [
      {
        name: 'Divine Burst',
        icon: GiSunbeams,
        mpCost: 30, apCost: 2, range: 4,
        target: 'ally', displayElement: 'holy',
        area: 'blast1',
        effects: [
          { type: 'heal', appliesTo: 'target', damageElement: 'holy', minHeal: 25, maxHeal: 35 }
        ]
      },
      {
        name: 'Summon Mote of Light',
        icon: GiFlatStar,
        mpCost: 27, apCost: 2, range: 3,
        target: 'tile', displayElement: 'holy',
        effects: [
          { type: 'summon', appliesTo: 'caster', creature: 'mote-of-light', turns :3 }
        ]
      }
    ]
  },
  {
    id: 'exorcist', name: 'Exorcist',
    classKey: 'acolyte', color: '#fab22d',
    description: 'A vengeful purifier who cleanses enemies in holy fire.',
    passives: {
      holyHit: { name: 'Zeal', flat: 3 },
      armor: { name: 'Spiritual Armor', flat: 10 },
      shadowResistance: { name: 'Holy Water', flat: 20 }
    },
    abilities: [
      {
        name: 'Holy Beam',
        icon: GiRingedBeam,
        mpCost: 26, apCost: 2, range: 5,
        target: 'enemy', displayElement: 'holy',
        attackCategory: 'magic', area: 'line',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'holy', minDamage: 20, maxDamage: 24 },
          { type: 'heal', appliesTo: 'allies', damageElement: 'holy', minHeal: 10, maxHeal: 12 }
        ]
      },
      {
        name: 'Consecrate',
        icon: GiOrbitalRays,
        mpCost: 20, apCost: 2, range: 4,
        target: 'enemy', displayElement: 'holy',
        attackCategory: 'magic', area: 'blast1',
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'holy', damagePerTurn: 18, turns: 3 },
          { type: 'hot', appliesTo: 'allies', damageElement: 'holy', healPerTurn: 9, turns: 3 }
        ]
      }
    ]
  },
  {
    id: 'mystic', name: 'Mystic',
    classKey: 'acolyte', color: '#4fc1ff',
    description: 'A spiritual seeker who manipulates magical effects and time itself to empower and protect the party.',
    passives: {
      mpRegen: { name: 'Meditation', flat: 2 },
      dodge: { name: 'Awareness', flat: 5 },
      magicResistance: { name: 'Iron Will', flat: 10 }
    },
    abilities: [
      {
        name: 'Renew',
        icon: GiSparkles,
        mpCost: 18, apCost: 1, range: 5,
        target: 'ally', displayElement: 'holy',
        effects: [
          { type: 'hot', appliesTo: 'target', damageElement: 'holy', healPerTurn: 15, turns: 3, maxStacks: 3 },
          { type: 'hot', appliesTo: 'target', damageElement: 'holy', restoresMP: true, healPerTurn: 10, turns: 3, maxStacks: 3 }
        ]
      },
      {
        name: 'Haste',
        icon: GiTwoFeathers,
        mpCost: 18, apCost: 1, range: 5,
        target: 'ally',
        effects: [{ type: 'buff', appliesTo: 'target', stats: { apMax: 1 }, turns: 1, maxStacks: 1 }]
      }
    ]
  }
];

export const SUBCLASSES: SubclassData[] = [
  ...ROGUE_SUBCLASSES, ...KNIGHT_SUBCLASSES, ...BARBARIAN_SUBCLASSES,
  ...ARCANIST_SUBCLASSES, ...ARCHER_SUBCLASSES, ...PRIMALIST_SUBCLASSES,
  ...OCCULTIST_SUBCLASSES, ...ACOLYTE_SUBCLASSES
];

/** A subclass by id. */
export function subclass(id: string): SubclassData {
  const s = SUBCLASSES.find((x) => x.id === id);
  if (!s) throw new Error(`no subclass '${id}' (data/units/subclasses.ts)`);
  return s;
}

/** A class's subclasses, in the order written. */
export const subclassesOf = (classKey: ClassKey): SubclassData[] => SUBCLASSES.filter((s) => s.classKey === classKey);

/**
 * What gear a member can use: its class's proficiencies, and its subclass's (once picked). The one place that decides
 * them: every check of what a member can equip, and of what the party can use, goes through it.
 */
export function proficienciesOf(m: { selectedClass: ClassKey; subclass?: string }): Proficiencies {
  const c = CLASSES[m.selectedClass], s = m.subclass ? subclass(m.subclass) : null;
  if (!s?.armorProficiencies?.length && !s?.weaponProficiencies?.length) return c;
  return {
    armorProficiencies: [...new Set([...c.armorProficiencies, ...(s.armorProficiencies ?? [])])],
    weaponProficiencies: [...new Set([...c.weaponProficiencies, ...(s.weaponProficiencies ?? [])])],
  };
}

// Warned at load: an id used twice; a class with more than its three; a subclass ability or passive effect named like
// one of its class's (they are told apart by name: the action bar, the passive entries); and effects an ability or
// passive effect would silently ignore, as for a class
for (const s of SUBCLASSES) {
  const owner = `subclasses › ${s.id}`;
  if (SUBCLASSES.filter((x) => x.id === s.id).length > 1) console.warn(`${owner}: its id is used by more than one subclass`);
  const c = CLASSES[s.classKey];
  for (const a of s.abilities ?? []) if (c.abilities.some((x) => x.name === a.name)) console.warn(`${owner} › ${a.name}: named like one of ${s.classKey}'s abilities`);
  for (const p of s.passiveEffects ?? []) if (c.passiveEffects?.some((x) => x.name === p.name)) console.warn(`${owner} › ${p.name}: named like one of ${s.classKey}'s passive effects`);
  warnIgnoredEffects(owner, s.abilities ?? []);
  warnIgnoredPassives(owner, s.passiveEffects);
}
for (const key of Object.keys(CLASSES) as ClassKey[]) {
  const n = subclassesOf(key).length;
  if (n > SUBCLASSES_PER_CLASS) console.warn(`subclasses › ${key}: ${n} subclasses (a class has ${SUBCLASSES_PER_CLASS})`);
}
