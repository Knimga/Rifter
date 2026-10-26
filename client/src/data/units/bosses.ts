// The dungeons' bosses: enemy classes (like data/units/enemies.ts's) each dungeon's boss room is built around
// (DungeonConfig.bossZone.bossGroup). A boss drops a rift key when it dies (isBoss).
import { warnIgnoredEffects } from '../combat/abilities';
import type { EnemyClassData, EnemyInstance } from './enemies';

export const BOSS_CLASSES: EnemyClassData[] = [
  {
    id: 'necromancer',
    name: 'Necromancer',
    attributes: { toughness: 4, mind: 8, spirit: 4 },
    highAttributes: ['mind', 'toughness'],
    lowAttributes: ['finesse', 'speed'],
    baseHp: 25,
    baseArmor: 15,
    armorPerLevel: 3,
    resistances: { shadow: 20 },
    abilities: [
      {
        name: 'Mighty Scythe',
        mpCost: 0,
        apCost: 2,
        range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 8, maxDamage: 8 }
        ]
      },
      {
        name: 'Necrotize',
        mpCost: 7,
        apCost: 1,
        range: 5,
        target: 'enemy',
        attackCategory: 'magic',
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'shadow', damagePerRound: 8, rounds: 2 }
        ]
      },
      {
        name: 'Summon Skeleton',
        mpCost: 10,
        apCost: 2,
        range: 1,
        target: 'tile',
        effects: [
          { type: 'summon', appliesTo: 'caster', creature: 'skeleton', rounds: 3 }
        ]
      }
    ],
    dropChance: 1,
    xpMultiplier: 6,
    model: 'creature.necromancer',
  },
  {
    id: 'burning-spirit',
    name: 'Burning Spirit',
    attributes: { finesse: 6, mind: 8, spirit: 6 },
    highAttributes: ['mind', 'spirit'],
    lowAttributes: ['speed', 'strength'],
    baseHp: 40,
    baseArmor: 20,
    armorPerLevel: 5,
    resistances: { fire: 30, physical: 20 },
    passives: {
      dodge: { name: 'Ethereal', flat: 10 },
      fireDamage: { name: 'Firelord', flat: 3 }
    },
    abilities: [
      {
        name: 'Conflagrate',
        mpCost: 15,
        apCost: 3,
        range: 5,
        target: 'enemy',
        area: 'blast2',
        attackCategory: 'magic',
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'fire', damagePerRound: 6, rounds: 3 }
        ]
      },
      {
        name: 'Firebolt',
        mpCost: 8,
        apCost: 2,
        range: 5,
        target: 'enemy',
        attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'fire', minDamage: 9, maxDamage: 9 }
        ]
      },
      {
        name: 'Flameclaw',
        mpCost: 0,
        apCost: 1,
        range: 1,
        target: 'enemy',
        attackCategory: 'magic',
        displayElement: 'fire',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'fire', minDamage: 5, maxDamage: 7 }
        ]
      }
    ],
    dropChance: 1,
    xpMultiplier: 6,
    model: 'creature.burning-spirit',
  },
  {
    id: 'sporemother',
    name: 'Sporemother',
    attributes: { toughness: 6, mind: 8, spirit: 8 },
    highAttributes: ['toughness', 'spirit'],
    lowAttributes: ['speed', 'finesse'],
    baseHp: 40,
    baseArmor: 15,
    armorPerLevel: 5,
    resistances: { nature: 30, poison: 30 },
    passives: {
      hpRegen: { name: 'Mycoblood', flat: 2 },
      mpRegen: { name: 'Mycomind', flat: 2 },

    },
    abilities: [
      {
        name: 'Summon Spore',
        mpCost: 10,
        apCost: 1,
        range: 1,
        target: 'tile',        
        effects: [
          { type: 'summon', appliesTo: 'caster', creature: 'fungal-spore', rounds: 3, max: 3 }
        ]
      },
      {
        name: 'Chitin Bloom',
        mpCost: 10,
        apCost: 2,
        range: 5,
        target: 'ally',
        area: 'blast2',
        displayElement: 'nature',
        effects: [
          { type: 'hot', appliesTo: 'allies', damageElement: 'nature', healPerRound: 6, rounds: 3 },
          { type: 'buff', appliesTo: 'allies', stats: { armor: 20 }, rounds: 3 }
        ]
      },
      {
        name: 'Toxin Spray',
        mpCost: 5,
        apCost: 1,
        range: 4,
        target: 'enemy',
        area: 'line',
        displayElement: 'poison',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'poison', minDamage: 6, maxDamage: 8 }
        ]
      }
    ],
    xpMultiplier: 6,
    model: 'creature.sporemother'
  }
];

/** True for a dungeon's boss (BOSS_CLASSES): it drops a rift key. */
export const isBoss = (e: EnemyInstance) => BOSS_CLASSES.some((c) => c.id === e.classData.id);

// Effects an ability would silently ignore: warned at load
for (const c of BOSS_CLASSES) warnIgnoredEffects(`bosses › ${c.id}`, c.abilities);
