import { warnIgnoredEffects, type Ability } from '../combat/abilities';
import type { Passive, ScalingPassive } from './classes';
import type { AttributeKey, SkillKey, ActiveBuff, ActiveHot, ActiveDot } from './stats';
import { ATTRIBUTE_KEYS, ATTRIBUTE_POINTS_PER_LEVEL, calculateStats, recomputeStats } from './stats';
import type { Stats } from './stats';
import type { ModelLink } from '../../forge/core/types';
import type { Pos } from '../world/grid';
import { pickWeighted } from '../random';

// ─── Creature Class Definition ────────────────────────────────────────────────
//
// Creature classes (enemies, and allies summoned by the party: data/units/summons.ts) work like player classes
// but are not selectable at character select. They define a name, a model, innate attribute bonuses,
// armor scaling, high/low attribute preferences for auto point-buy, and abilities.
// All attacks are mpCost:0 abilities — no separate weapon field.

export interface CreatureClassData {
  id: string;
  name: string;

  // Innate attribute bonuses (same role as ClassData.attributes for players)
  attributes: Partial<Record<AttributeKey, number>>;

  // Inherent skill bonuses (no per-level point-buy — enemy skills are fixed at class values)
  skills?: Partial<Record<SkillKey, number>>;

  // Auto point-buy distribution
  highAttributes: AttributeKey[];  // always allocated more than neutral
  lowAttributes: AttributeKey[];   // always allocated less than neutral

  // Armor scaling (replaces per-level gear for enemies)
  baseHp: number;           // HP before attributes and level (stats.ts buildRawStats)
  baseArmor: number;
  armorPerLevel: number;

  // All attacks and special actions — mpCost:0 = basic attack
  abilities: Ability[];

  // Optional passive system (same as players — enables elemental damage bonuses etc.)
  passives?: Record<string, Passive>;
  scalingPassives?: ScalingPassive[];

  // Forge design this creature renders as; each instance gets its own look (seeded from its id)
  model: ModelLink;

  // Hostile creatures only (EnemyClassData); a summon drops nothing and is worth no XP
  dropChance?: number;   // probability of dropping an item on death (default: LOOT_DROP_CHANCE)
  xpMultiplier?: number; // XP worth relative to a standard enemy of its level (data/units/xp.ts killXp): tougher = more, bosses ~6
}

/** A hostile creature's class: one the party fights (and that drops loot and gives XP). */
export interface EnemyClassData extends CreatureClassData {
  xpMultiplier: number;
}

// ─── Enemy Instance ───────────────────────────────────────────────────────────

/** A summoned creature fighting on the party's side (absent on hostile enemies). */
export interface AllyInfo {
  ownerIdx: number;   // the party member who summoned it
  ability: string;    // the ability that summoned it (casting it again replaces it)
  roundsLeft: number; // it vanishes when this runs out (counted down at the top of each round)
}

/**
 * A creature on the map: a hostile enemy, or (with `ally`) a creature summoned by the party. Both share
 * stats, ticks, the turn order, drawing and the AI (enemyAI.ts); `isHostile` tells them apart.
 */
export interface EnemyInstance {
  id: string;
  classData: CreatureClassData;     // template — name, model, abilities
  ally?: AllyInfo;
  level: number;                    // the level this enemy was generated at
  pointsSpent: Record<AttributeKey, number>;  // auto-generated, stored for buff recompute
  buffs: ActiveBuff[];
  hots: ActiveHot[];
  stats: Stats;                     // current effective stats (recomputed when buffs change)
  pos: Pos;
  currentHp: number;
  currentMp: number;
  aggroed: boolean;
  zoneId: number;
  groupId: number;
  dots: ActiveDot[];
}

// ─── Attribute Points ────────────────────────────────────────────────────────

/** Attribute points an enemy gets at level 1, on top of BASE_ATTRIBUTES + its class's (players get none at level 1). */
const ENEMY_STARTING_ATTR_POINTS = 6;

/**
 * Distribute attribute points for an enemy based on level and high/low preferences.
 * Returns pointsSpent (allocated beyond BASE_ATTRIBUTES), same shape as player point-buy.
 */
function generateEnemyAttributePoints(
  level: number,
  highAttributes: AttributeKey[],
  lowAttributes: AttributeKey[],
): Record<AttributeKey, number> {
  const total = ENEMY_STARTING_ATTR_POINTS + ATTRIBUTE_POINTS_PER_LEVEL * (level - 1);
  const alloc: Record<AttributeKey, number> = { strength: 0, toughness: 0, finesse: 0, mind: 0, spirit: 0, speed: 0 };
  const neutral = ATTRIBUTE_KEYS.filter(a => !highAttributes.includes(a) && !lowAttributes.includes(a));

  // Weighted random allocation
  const weight = (a: AttributeKey) => highAttributes.includes(a) ? 3 : lowAttributes.includes(a) ? 0.5 : 1;
  for (let i = 0; i < total; i++) alloc[pickWeighted(ATTRIBUTE_KEYS, weight)]++;

  // Fix constraint violations: enforce min(high) > max(neutral) > max(low)
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of neutral) {
      for (const l of lowAttributes) {
        if (alloc[n] <= alloc[l] && alloc[l] > 0) {
          alloc[l]--; alloc[n]++; changed = true;
        }
      }
    }
    for (const h of highAttributes) {
      for (const n of neutral) {
        if (alloc[h] <= alloc[n] && alloc[n] > 0) {
          alloc[n]--; alloc[h]++; changed = true;
        }
      }
    }
    for (const h of highAttributes) {
      for (const l of lowAttributes) {
        if (alloc[h] <= alloc[l] && alloc[l] > 0) {
          alloc[l]--; alloc[h]++; changed = true;
        }
      }
    }
  }

  return alloc;
}

// ─── Instance Generation ──────────────────────────────────────────────────────

/**
 * Generate a fully-initialised EnemyInstance from a class definition + level.
 * Called by spawnDungeonEnemies in dungeonGen.ts.
 */
export function generateEnemyInstance(
  classData: CreatureClassData,
  level: number,
  id: string,
  pos: Pos,
  zoneId: number,
  groupId: number,
): EnemyInstance {
  const pointsSpent = generateEnemyAttributePoints(level, classData.highAttributes, classData.lowAttributes);
  const stats = calculateStats({ mode: 'enemy', classData, pointsSpent, level });

  return {
    id,
    classData,
    level,
    pointsSpent,
    buffs: [],
    hots: [],
    stats,
    pos,
    currentHp: stats.hp,
    currentMp: stats.mp,
    aggroed: false,
    zoneId,
    groupId,
    dots: [],
  };
}

/** A creature the party fights (not one it summoned). */
export const isHostile = (e: EnemyInstance) => !e.ally;

/** A creature summoned by the party. */
export const isSummon = (e: EnemyInstance): e is EnemyInstance & { ally: AllyInfo } => !!e.ally;

// ─── Buff Helpers ─────────────────────────────────────────────────────────────

/** Return a new EnemyInstance with its buff list replaced and stats recomputed. */
export function withEnemyBuffs(enemy: EnemyInstance, buffs: ActiveBuff[]): EnemyInstance {
  const stats = recomputeStats({ mode: 'enemy', classData: enemy.classData, pointsSpent: enemy.pointsSpent, level: enemy.level }, buffs);
  return { ...enemy, buffs, stats };
}

// ─── Bestiary ────────────────────────────────────────────────────────────────

export const ENEMY_CLASSES: EnemyClassData[] = [
  {
    id: 'skeleton',
    name: 'Skeleton',
    attributes: { strength: 2 },
    highAttributes: ['strength', 'finesse'],
    lowAttributes: ['mind', 'spirit'],
    baseHp: 15,
    baseArmor: 10,
    armorPerLevel: 4,
    abilities: [
      {
        name: 'Rusted Sword',
        mpCost: 0,
        apCost: 1,
        range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        displayElement: 'slashing',
        effects: [{ type: 'damage', appliesTo: 'target', damageElement: 'slashing', minDamage: 5, maxDamage: 7 }],
      },
    ],
    dropChance: 0.4,
    xpMultiplier: 0.8,
    model: 'creature.skeleton',
  },
  {
    id: 'zombie',
    name: 'Zombie',
    attributes: { strength: 2, toughness: 4 },
    highAttributes: ['toughness', 'strength'],
    lowAttributes: ['finesse', 'mind'],
    baseHp: 20,
    baseArmor: 5,
    armorPerLevel: 4,
    abilities: [
      {
        name: 'Bite',
        mpCost: 0,
        apCost: 1,
        range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        displayElement: 'bludgeoning',
        effects: [{ type: 'damage', appliesTo: 'target', damageElement: 'bludgeoning', minDamage: 4, maxDamage: 8 }],
      },
      {
        name: 'Fetid Breath',
        mpCost: 6,
        apCost: 2,
        range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        displayElement: 'poison',
        effects: [
          {type: 'damage', appliesTo: 'target', damageElement: 'poison', minDamage: 4, maxDamage: 4},
          {type: 'dot', appliesTo: 'target', damageElement: 'poison', damagePerRound: 4, rounds: 3}
        ]
      }
    ],
    dropChance: 0.4,
    xpMultiplier: 1,
    model: 'creature.zombie',
  },
  {
    id: 'lava-slime',
    name: 'Lava Slime',
    attributes: { toughness: 2, mind: 2 },
    highAttributes: ['toughness', 'mind'],
    lowAttributes: ['finesse', 'speed'],
    baseHp: 15,
    baseArmor: 0,
    armorPerLevel: 4,
    passives: {
      fireResistance: { name: "Flameborn", flat: 30 },
      piercingResistance: { name: "Slime Body", flat: 20 },
      slashingResistance: { name: "Slime Body", flat: 20 }
    },
    abilities: [
      {
        name: 'Lava Lick',
        mpCost: 0,
        apCost: 1,
        range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        displayElement: 'fire',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'fire', minDamage: 1, maxDamage: 3 }
        ],
      },
      {
        name: 'Flame Belch',
        mpCost: 10,
        apCost: 2,
        range: 0,
        area: 'blast1',
        target: 'enemy',
        attackCategory: 'magic',
        displayElement: 'fire',
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'fire', damagePerRound: 4, rounds: 3 },
          { type: 'debuff', appliesTo: 'target', stats: { fireResistance: -20 }, rounds: 2}
        ]
      }
    ],
    dropChance: 0.3,
    xpMultiplier: 1.2,
    model: 'creature.lava-slime',
  },
  {
    id: 'hellhound',
    name: 'Hellhound',
    attributes: { strength: 3, speed: 3, toughness: 3 },
    highAttributes: ['strength', 'speed'],
    lowAttributes: ['spirit', 'finesse'],
    baseHp: 20,
    baseArmor: 10,
    armorPerLevel: 4,
    passives: {
      fireResistance: { name: 'Flameborn', flat: 30 },
      glancingBlow: { name: 'Tough Hide', flat: 5 }
    },
    abilities: [
      {
        name: 'Burning Bite',
        mpCost: 0,
        apCost: 1,
        range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        displayElement: 'fire',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'piercing', minDamage: 1, maxDamage: 1 },
          { type: 'damage', appliesTo: 'target', damageElement: 'fire', minDamage: 2, maxDamage: 2 }
        ]
      }
    ],
    dropChance: 0.3,
    xpMultiplier: 1,
    model: 'creature.hellhound'
  },
  {
    id: 'flame-golem',
    name: 'Flame Golem',
    attributes: { strength: 3, toughness: 3 },
    highAttributes: ['strength', 'toughness'],
    lowAttributes: ['mind', 'finesse'],
    baseHp: 30,
    baseArmor: 20,
    armorPerLevel: 4,
    passives: {
      fireResistance: { name: 'Flameborn', flat: 30 },
      meleeHit: { name: 'Clumsy', flat: -10 }
    },
    abilities: [
      {
        name: 'Slam',
        mpCost: 0,
        apCost: 2,
        range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        displayElement: 'bludgeoning',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'bludgeoning', minDamage: 8, maxDamage: 10 },
          { type: 'damage', appliesTo: 'target', damageElement: 'fire', minDamage: 4, maxDamage: 5 },
        ]
      }
    ],
    dropChance: 0.5,
    xpMultiplier: 2,
    model: 'creature.flame-golem'
  }
];

export const BOSS_CLASSES: EnemyClassData[] = [
  {
    id: 'necromancer',
    name: 'Necromancer',
    attributes: { toughness: 8, mind: 8 },
    highAttributes: ['mind', 'toughness'],
    lowAttributes: ['spirit'],
    baseHp: 30,
    baseArmor: 20,
    armorPerLevel: 1,
    passives: {
      shadowResistance: { name: 'Death-touched', flat: 20 }
    },
    abilities: [
      {
        name: 'Mighty Scythe',
        mpCost: 0,
        apCost: 2,
        range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        displayElement: 'slashing',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'slashing', minDamage: 10, maxDamage: 12 }
        ]
      },
      {
        name: 'Necrotic Bolt',
        mpCost: 8,
        apCost: 2,
        range: 5,
        target: 'enemy',
        attackCategory: 'magic',
        displayElement: 'shadow',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'shadow', minDamage: 10, maxDamage: 12 }
        ]
      },
      {
        name: 'Wither',
        mpCost: 10,
        apCost: 1,
        range: 4,
        target: 'enemy',
        attackCategory: 'magic',
        displayElement: 'shadow',
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'shadow', damagePerRound: 6, rounds: 3 }
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
    attributes: { toughness: 4, mind: 6, spirit: 6 },
    highAttributes: ['mind', 'spirit'],
    lowAttributes: ['speed', 'finesse'],
    baseHp: 25,
    baseArmor: 10,
    armorPerLevel: 1,
    passives: {
      fireResistance: { name: 'Flameborn', flat: 30 }
    },
    abilities: [
      {
        name: 'Conflagrate',
        mpCost: 20,
        apCost: 3,
        range: 5,
        target: 'enemy',
        area: 'blast2',
        attackCategory: 'magic',
        displayElement: 'fire',
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
        displayElement: 'fire',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'fire', minDamage: 9, maxDamage: 9 }
        ]
      }
    ],
    dropChance: 1,
    xpMultiplier: 6,
    model: 'creature.burning-spirit',
  }
];

// Effects an ability would silently ignore: warned at load
for (const c of [...ENEMY_CLASSES, ...BOSS_CLASSES]) warnIgnoredEffects(`enemies › ${c.id}`, c.abilities);

