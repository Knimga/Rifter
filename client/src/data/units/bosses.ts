// The dungeons' bosses: enemy classes (like data/units/enemies.ts's) each dungeon's boss room is built around
// (DungeonConfig.bossZone.bossGroup). A boss drops a rift key when it dies (isBoss).
import { warnCreatureTable } from '../combat/abilities';
import { type EnemyClassData, type EnemyInstance } from './enemies';

//attributes prop for all bosses should total +20

export const BOSS_CLASSES: EnemyClassData[] = [
  {
    id: 'necromancer',
    name: 'Necromancer',
    attributes: { toughness: 4, mind: 8, spirit: 8 },
    highAttributes: ['mind', 'toughness'],
    lowAttributes: ['finesse', 'speed'],
    baseHp: 70,
    baseArmor: 15,
    resistances: { shadow: 20 },
    abilities: [
      {
        name: 'Mighty Scythe',
        mpCost: 0, apCost: 2, range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 18, maxDamage: 24 }
        ]
      },
      {
        name: 'Necrotize',
        mpCost: 21, apCost: 1, range: 5,
        target: 'enemy',
        attackCategory: 'magic',
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'shadow', damagePerTurn: 18, turns: 3 }
        ]
      },
      {
        name: 'Summon Skeleton',
        mpCost: 30, apCost: 2, range: 1,
        target: 'tile',
        effects: [
          { type: 'summon', appliesTo: 'caster', creature: 'skeleton', turns: 3, max: 2 }
        ]
      }
    ],
    dropChance: 3,
    dropsGold: 1,
    goldBonus: 100,
    xpMultiplier: 6,
    model: 'creature.necromancer',
  },
  {
    id: 'burning-spirit',
    name: 'Burning Spirit',
    attributes: { finesse: 6, mind: 8, spirit: 6 },
    highAttributes: ['mind', 'spirit'],
    lowAttributes: ['speed', 'strength'],
    baseHp: 100,
    baseArmor: 19,
    resistances: { fire: 30, physical: 30 },
    passives: {
      dodge: { flat: 15 },
      fireDamage: { flat: 10 }
    },
    passiveEffects: [
      { name: 'Ablaze', damageElement: 'fire', aura: {
        area: 'blast1', effects: [
          { type: 'dot', appliesTo: 'enemies', damageElement: 'fire', damagePerTurn: 15 }
        ]
      }}
    ],
    abilities: [
      {
        name: 'Conflagrate',
        mpCost: 45, apCost: 2, range: 5,
        target: 'enemy',
        area: 'blast2',
        attackCategory: 'magic',
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'fire', damagePerTurn: 20, turns: 3, maxStacks: 1 }
        ]
      },
      {
        name: 'Firebolt',
        mpCost: 24, apCost: 1, range: 5,
        target: 'enemy',
        attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'fire', minDamage: 27, maxDamage: 27 }
        ]
      },
      {
        name: 'Flameclaw',
        mpCost: 0, apCost: 1, range: 1,
        target: 'enemy',
        attackCategory: 'magic',
        displayElement: 'fire',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'fire', minDamage: 15, maxDamage: 21 }
        ]
      }
    ],
    dropChance: 3,
    dropsGold: 1,
    goldBonus: 100,
    xpMultiplier: 6,
    model: 'creature.burning-spirit',
  },
  {
    id: 'sporemother',
    name: 'Sporemother',
    attributes: { toughness: 7, mind: 6, spirit: 7 },
    highAttributes: ['toughness', 'spirit'],
    lowAttributes: ['speed', 'finesse'],
    baseHp: 100,
    baseArmor: 13,
    resistances: { nature: 30, poison: 30 },
    passives: {
      hpRegen: { flat: 2 },
      mpRegen: { flat: 2 },

    },
    abilities: [
      {
        name: 'Summon Spore',
        mpCost: 30, apCost: 2, range: 1,
        target: 'tile',        
        effects: [
          { type: 'summon', appliesTo: 'caster', creature: 'fungal-spore', turns: 3, max: 2 }
        ]
      },
      {
        name: 'Chitin Bloom',
        mpCost: 30, apCost: 2, range: 5,
        target: 'ally',
        area: 'blast2',
        displayElement: 'nature',
        effects: [
          { type: 'hot', appliesTo: 'allies', damageElement: 'nature', healPerTurn: 18, turns: 3 },
          { type: 'buff', appliesTo: 'allies', statsPercent: { armor: 30 }, turns: 3 }
        ]
      },
      {
        name: 'Toxin Spray',
        mpCost: 15, apCost: 1, range: 4,
        target: 'enemy', attackCategory: 'magic',
        area: 'line',
        displayElement: 'poison',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'poison', minDamage: 18, maxDamage: 24 }
        ]
      }
    ],
    dropChance: 3,
    dropsGold: 1,
    goldBonus: 100,
    xpMultiplier: 6,
    model: 'creature.sporemother'
  },
  {
    id: 'troll-tamer',
    name: 'Troll Tamer',
    attributes: { toughness: 6, finesse: 4, spirit: 4, mind: 6 },
    highAttributes: ['toughness', 'mind'],
    lowAttributes: ['strength', 'spirit'],
    baseHp: 100,
    baseArmor: 17,
    passives: {
      initiative: { flat: 5 },
      healing: { flat: 10 },
      healingReceived: { flat: 10 }
    },
    abilities: [
      {
        name: "Master's Bond",
        mpCost: 18, apCost: 1, range: 4,
        target: 'ally',
        area: 'blast2',
        displayElement: 'nature',
        effects: [
          // Each hit the bonded ally lands heals the tamer
          { type: 'buff', appliesTo: 'target', maxStacks: 1, turns: 3, trigger: { when: 'attacking', on: 'hit',
            effects: [{ type: 'heal', appliesTo: 'source', damageElement: 'nature', minHeal: 12, maxHeal: 18 }] } }
        ]
      },
      {
        name: "Stinky Salve",
        mpCost: 18, apCost: 1, range: 4,
        target: 'ally',
        displayElement: 'nature',
        effects: [
          { type: 'heal', appliesTo: 'target', damageElement: 'nature', minHeal: 18, maxHeal: 27 }
        ]
      },
      {
        name: "Hand Crossbow",
        mpCost: 0, apCost: 1, range: 4,
        target: 'enemy',
        useWeapon: true,
        attackCategory: 'ranged',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 15, maxDamage: 21 },
        ]
      },
      {
        name: "Troll Tranquilizer",
        mpCost: 24, apCost: 2, range: 4,
        target: 'enemy',
        useWeapon: true,
        attackCategory: 'ranged',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 12, maxDamage: 18 },
          { type: 'debuff', appliesTo: 'target', damageElement: 'poison', stats: { apMax: -2 }, turns: 1 }
        ]
      }      
    ],
    dropChance: 3,
    dropsGold: 1,
    goldBonus: 100,
    xpMultiplier: 6,
    model: 'creature.troll-tamer'
  },
  {
    id: 'pale-broodmother',
    name: 'Pale Broodmother',
    attributes: { toughness: 4, finesse: 4, speed: 6, mind: 6 },
    highAttributes: ['speed', 'mind'],
    lowAttributes: ['strength', 'spirit'],
    large: true,
    baseHp: 130,
    baseArmor: 26,
    resistances: { poison: 30 },
    passives: {
      movement: { flat: 1 }
    },
    passiveEffects: [
      { name: 'Potent Venom', damageElement: 'poison', trigger: {
        when: 'attacking', on: 'hit', categories: ['melee'], chance: 50,
        effects: [
          {type: 'dot', appliesTo: 'target', damageElement: 'poison', damagePerTurn: 18, turns: 3, maxStacks: 3 }]
      }}
    ],
    abilities: [
      {
        name: 'Spawn Pale Creeper',
        mpCost: 15, apCost: 1, range: 1,
        target: 'tile',
        effects: [
          { type: 'summon', appliesTo: 'caster', creature: 'pale-creeper', turns: 3, max: 3 }
        ]
      },
      {
        name: 'Pale Fangs',
        mpCost: 0, apCost: 2, range: 1,
        target: 'enemy',
        displayElement: 'physical',
        attackCategory: 'melee',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 12, maxDamage: 15 },
          { type: 'damage', appliesTo: 'target', damageElement: 'poison', minDamage: 3, maxDamage: 6 },
        ]
      },
      {
        name: 'Brood Screech',
        mpCost: 24, apCost: 1, range: 4,
        target: 'ally',
        area: 'blast2',
        displayElement: 'physical',
        effects: [
          { type: 'buff', appliesTo: 'target', turns: 5, trigger: {
            when: 'attacked', on: 'hit', effects: [
              { type: 'buff', appliesTo: 'source', stats: { meleeDamage: 15 }, turns: 5 }
            ]
          }}
        ]
      }
    ],
    xpMultiplier: 6,
    dropChance: 3,
    dropsGold: 1,
    goldBonus: 100,
    model: 'creature.pale-broodmother'
  }
];

/** True for a dungeon's boss (BOSS_CLASSES): it drops a rift key. */
export const isBoss = (e: EnemyInstance) => BOSS_CLASSES.some((c) => c.id === e.classData.id);

// Effects an ability (or a passive trigger) would silently ignore: warned at load
warnCreatureTable('bosses', BOSS_CLASSES);
