import type { Ability, Passive, ScalingPassive } from './classes';

import { 
  GiChewedSkull, GiShamblingZombie, GiCrownedSkull
 } from 'react-icons/gi';

import type { IconType } from 'react-icons';
import type { AttributeKey, SkillKey, ActiveBuff, ActiveHot, ActiveDot } from './stats';
import { generateEnemyAttributePoints, calculateStats, recomputeStats } from './stats';
import type { Stats } from './stats';

// ─── Enemy Class Definition ───────────────────────────────────────────────────
//
// Enemy classes work like player classes but are not selectable in the builder.
// They define a name/token/color, innate attribute bonuses, armor scaling,
// high/low attribute preferences for auto point-buy, and abilities.
// All attacks are mpCost:0 abilities — no separate weapon field.

export interface EnemyClassData {
  id: string;
  name: string;
  token: IconType;

  // Innate attribute bonuses (same role as ClassData.attributes for players)
  attributes: Partial<Record<AttributeKey, number>>;

  // Inherent skill bonuses (no per-level point-buy — enemy skills are fixed at class values)
  skills?: Partial<Record<SkillKey, number>>;

  // Auto point-buy distribution
  highAttributes: AttributeKey[];  // always allocated more than neutral
  lowAttributes: AttributeKey[];   // always allocated less than neutral

  // Armor scaling (replaces per-level gear for enemies)
  baseArmor: number;
  armorPerLevel: number;

  // All attacks and special actions — mpCost:0 = basic attack
  abilities: Ability[];

  // Optional passive system (same as players — enables elemental damage bonuses etc.)
  passives?: Record<string, Passive>;
  scalingPassives?: ScalingPassive[];

  dropChance?: number;  // probability of dropping an item on death (default: LOOT_DROP_CHANCE)
}

// ─── Enemy Instance ───────────────────────────────────────────────────────────

export interface EnemyInstance {
  id: string;
  classData: EnemyClassData;        // template — name, token, color, abilities
  level: number;                    // the level this enemy was generated at
  pointsSpent: Record<AttributeKey, number>;  // auto-generated, stored for buff recompute
  attrs: Record<AttributeKey, number>;        // effective attribute values at generation
  buffs: ActiveBuff[];
  hots: ActiveHot[];
  stats: Stats;                     // current effective stats (recomputed when buffs change)
  pos: { x: number; y: number };
  currentHp: number;
  currentMp: number;
  aggroed: boolean;
  zoneId: number;
  groupId: number;
  dots: ActiveDot[];
}

// ─── Instance Generation ──────────────────────────────────────────────────────

/**
 * Generate a fully-initialised EnemyInstance from a class definition + level.
 * Called by spawnDungeonEnemies in dungeonGen.ts.
 */
export function generateEnemyInstance(
  classData: EnemyClassData,
  level: number,
  id: string,
  pos: { x: number; y: number },
  zoneId: number,
  groupId: number,
): EnemyInstance {
  const pointsSpent = generateEnemyAttributePoints(level, classData.highAttributes, classData.lowAttributes);
  const stats = calculateStats({ mode: 'enemy', classData, pointsSpent, level });

  const attrs: Record<AttributeKey, number> = {
    strength:  stats.attributes.strength,
    toughness: stats.attributes.toughness,
    finesse:   stats.attributes.finesse,
    mind:      stats.attributes.mind,
    spirit:    stats.attributes.spirit,
    speed:     stats.attributes.speed
  };

  return {
    id,
    classData,
    level,
    pointsSpent,
    attrs,
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

// ─── Buff Helpers ─────────────────────────────────────────────────────────────

/** Return a new EnemyInstance with the buff added and stats recomputed. */
export function applyBuffToEnemy(enemy: EnemyInstance, buff: ActiveBuff): EnemyInstance {
  const buffs = [...enemy.buffs, buff];
  const stats = recomputeStats({ mode: 'enemy', classData: enemy.classData, pointsSpent: enemy.pointsSpent, level: enemy.level }, buffs);
  return { ...enemy, buffs, stats };
}

// ─── Bestiary ────────────────────────────────────────────────────────────────

export const ENEMY_CLASSES: EnemyClassData[] = [
  {
    id: 'skeleton',
    name: 'Skeleton',
    token: GiChewedSkull,
    attributes: { strength: 2 },
    highAttributes: ['strength', 'finesse'],
    lowAttributes: ['mind', 'spirit'],
    baseArmor: 0,
    armorPerLevel: 1,
    abilities: [
      {
        name: 'Rusted Sword',
        mpCost: 0,
        range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        displayElement: 'slashing',
        effects: [{ type: 'damage', appliesTo: 'target', damageElement: 'slashing', minDamage: 5, maxDamage: 8 }],
      },
    ],
    dropChance: 0.50
  },
  {
    id: 'zombie',
    name: 'Zombie',
    token: GiShamblingZombie,
    attributes: { strength: 2, toughness: 4 },
    highAttributes: ['toughness', 'strength'],
    lowAttributes: ['finesse', 'mind'],
    baseArmor: 2,
    armorPerLevel: 2,
    abilities: [
      {
        name: 'Bite',
        mpCost: 0,
        range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        displayElement: 'bludgeoning',
        effects: [{ type: 'damage', appliesTo: 'target', damageElement: 'bludgeoning', minDamage: 4, maxDamage: 10 }],
      },
    ],
    dropChance: 0.50
  },
];

export const BOSS_CLASSES: EnemyClassData[] = [
  {
    id: 'necromancer',
    name: 'Necromancer',
    token: GiCrownedSkull,
    attributes: { toughness: 10, mind: 8 },
    highAttributes: ['mind', 'toughness'],
    lowAttributes: ['spirit'],
    baseArmor: 20,
    armorPerLevel: 1,
    abilities: [
      {
        name: 'Mighty Scythe',
        mpCost: 0,
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
        mpCost: 12,
        range: 4,
        area: 'blast2',
        target: 'enemy',
        attackCategory: 'magic',
        displayElement: 'shadow',
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'shadow', damagePerRound: 6, rounds: 3 }
        ]
      }
    ],
    dropChance: 1
  }
];

