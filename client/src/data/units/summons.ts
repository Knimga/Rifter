// Summoned creatures (an ability's 'summon' effect, by id): the creatures only summoned (SUMMON_CLASSES), and any
// enemy class too (e.g. a spore that also roams in packs). Configured like enemy classes (CreatureClassData:
// attributes, armor, abilities, passives, model) and run by the same AI, on their summoner's side. Their level
// is their summoner's. A summon lasts its `turns`, or (`turns: 'forever'`, a party member's only) until it is slain or
// the party leaves the dungeon: it marches with the party between fights (followsParty, movement.ts marchParty),
// unless it is `immobile` (a totem), which stays where it was called up.
import { ENEMY_CLASSES, generateEnemyInstance, type CreatureClassData, type EnemyInstance } from './enemies';
import { BOSS_CLASSES } from './bosses';
import type { Pos } from '../world/grid';
import type { DamageElement } from './stats';
import { warnCreatureTable } from '../combat/abilities';

/** A creature an action summons (executeAction's outcome; placed where the outcome lands). */
export interface SummonRequest {
  creature: string;  // a creature class id (summonClass)
  turns: number | 'forever';  // 'forever': the party's only (abilities.ts 'summon' effect)
  max: number;       // at most this many out from its ability at once: casting it again replaces the oldest
  ability: string;   // the ability that summons it
  at?: Pos;          // the tile it appears on (a 'tile' ability's aim); none = beside the caster
  element?: DamageElement; // the ability's element: its glow's color as it appears and vanishes (SummonInfo.element)
}

export const SUMMON_CLASSES: CreatureClassData[] = [
  {
    id: 'void-wisp',
    name: 'Void Wisp',
    attributes: { mind: 4 },
    highAttributes: ['mind', 'finesse'],
    lowAttributes: ['strength', 'toughness'],
    baseHp: 10,
    baseArmor: 2,
    resistances: { shadow: 75, physical: 20 },
    passives: {
      dodge: { flat: 20 },
      magicHit: { flat: 5 }
    },
    abilities: [
      {
        name: 'Void Spit',
        mpCost: 0,
        apCost: 1,
        range: 3,
        target: 'enemy',
        attackCategory: 'magic',
        displayElement: 'shadow',
        effects: [{ type: 'damage', appliesTo: 'target', damageElement: 'shadow', minDamage: 12, maxDamage: 15 }],
      },
    ],
    model: 'summon.void-wisp',
  },
  {
    id: 'wolf', name: 'Wolf',
    attributes: { strength: 4, speed: 4 },
    highAttributes: [ 'strength', 'speed' ],
    lowAttributes: [ 'mind', 'spirit' ],
    baseHp: 40,
    baseArmor: 12,
    passives: {
      movement: { flat: 1 },
      dodge: { flat: 5 }
    },
    abilities: [
      {
        name: 'Bite',
        mpCost: 0, apCost: 1, range: 1,
        target: 'enemy', attackCategory: 'melee', displayElement: 'physical',
        effects: [{ type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 15, maxDamage: 21 }]
      },
      {
        name: 'Howl',
        mpCost: 21, apCost: 2, range: 0,
        target: 'enemy', attackCategory: 'melee', area: 'blast2',
        effects: [
          { type: 'debuff', appliesTo: 'target', statsPercent: { finesse: -20 }, turns: 3, maxStacks: 1 }
        ]
      }
    ],
    model: 'summon.wolf'
  },
  {
    id: 'vigor-totem', name: 'Vigor Totem',
    attributes: { toughness: 4 },
    highAttributes: ['toughness'],
    lowAttributes: [],
    immobile: true,
    baseHp: 10,
    baseArmor: 20,
    passiveEffects: [
      { name: 'Vigor Aura', aura: { area: 'blast2', effects: [
        { type: 'buff', appliesTo: 'allies', damageElement: 'nature', statsPercent: { strength: 20 }, stats: { hpRegen: 1 }}
      ]}}      
    ],    
    abilities: [],
    model: 'summon.vigor-totem'
  },
  {
    id: 'fiend', name: 'Fiend',
    attributes: { toughness: 2, strength: 4, speed: 2 },
    highAttributes: ['strength','toughness'],
    lowAttributes: ['spirit','mind'],
    baseHp: 55,
    baseArmor: 25,
    resistances: { shadow: 20 },
    passives: { 
      magicResistance: { percent: 15 },
      glancingBlow: { flat: 5 },
      increasedThreat: { flat: 10 }
    },
    abilities: [
      {
        name: 'Black Claw',
        mpCost: 0, apCost: 1, range: 1,
        target: 'enemy', attackCategory: 'melee', displayElement: 'physical',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 18, maxDamage: 21 }
        ]
      },
      {
        name: 'Fly',
        mpCost: 0, apCost: 1, range: 5,
        target: 'tile', move: { style: 'dash', throughEnemies: true, throughObstacles: true },
        effects: []
      }
    ],
    model: 'summon.fiend'
  },
  {
    id: 'mote-of-light', name: 'Mote of Light',
    attributes: { mind: 2, spirit: 6 },
    highAttributes: ['spirit', 'mind'],
    lowAttributes: ['strength','toughness'],
    baseHp: 10, baseArmor: 2,
    resistances: { holy: 75, physical: 20 },
    passives: {
      dodge: { flat: 20 },
      holyHit: { flat: 5 }
    },
    abilities: [
      {
        name: 'Light Pulse',
        mpCost: 0, apCost: 1, range: 3,
        target: 'ally', displayElement: 'holy',
        effects: [
          { type: 'heal', appliesTo: 'target', damageElement: 'holy', minHeal: 10, maxHeal: 10 }
        ]
      },
      {
        name: 'Wrath Pulse',
        mpCost: 0, apCost: 1, range: 3,
        target: 'enemy', displayElement: 'holy', attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'holy', minDamage: 10, maxDamage: 10 }
        ]
      }
    ],
    model: 'summon.mote-of-light'
  }
];

// Effects an ability (or a passive trigger) would silently ignore: warned at load
warnCreatureTable('summons', SUMMON_CLASSES);

/** A summonable creature's class, by id: a summon-only creature, else an enemy class. */
export const summonClass = (id: string): CreatureClassData | undefined =>
  [...SUMMON_CLASSES, ...ENEMY_CLASSES, ...BOSS_CLASSES].find((c) => c.id === id);

let summonCounter = 0;

/**
 * A summoned creature: `owner`'s (its unitKey), on the party's side if `allied`, else the enemies'; at `level`
 * (its summoner's), on `pos` in zone `zoneId`. In the fight from the start (aggroed). Null for an unknown id.
 */
export function createSummon(req: SummonRequest, owner: string, allied: boolean, level: number, pos: Pos, zoneId: number): EnemyInstance | null {
  const classData = summonClass(req.creature);
  if (!classData) return null;
  const id = `summon-${Date.now().toString(36)}-${(summonCounter++).toString(36)}`;
  return {
    ...generateEnemyInstance(classData, level, id, pos, zoneId, -1),
    aggroed: true,
    summon: { owner, ability: req.ability, turnsLeft: req.turns, allied, ...(req.element && { element: req.element }) },
  };
}

/** The living creatures `owner` (a unitKey) has out from `ability`, oldest first (the order they were added in). */
export const summonsOf = (creatures: EnemyInstance[], owner: string, ability: string) =>
  creatures.filter(e => e.currentHp > 0 && e.summon?.owner === owner && e.summon.ability === ability);
