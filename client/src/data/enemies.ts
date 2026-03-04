import type { WeaponItem, DamageElement } from './gear';
import type { Ability } from './classes';
import type { AttributeKey, ActiveBuff, ActiveHot } from './stats';
import { ATTRIBUTE_KEYS } from './stats';
import type { Stats } from './stats';
import { BASE_ATTRIBUTES, TOTAL_POINTS, ATTRIBUTE_POINTS_PER_LEVEL, applyStatBuffs } from './stats';

// ─── DoTs ────────────────────────────────────────────────────────────────────

export interface ActiveDot {
  name?: string;            // ability name that applied this DoT (for display)
  damageElement: DamageElement;
  damagePerRound: number;
  roundsRemaining: number;
  sourcePartyIdx?: number;  // party member who applied this DoT (for threat attribution)
}

// ─── Enemy Type Definition (template) ────────────────────────────────────────

export interface EnemyType {
  id: string;
  name: string;
  token: string;
  color: string;           // tailwind bg class

  // Stat generation parameters
  hpBase: number;          // flat HP added before attribute contributions (players use 30)
  baseArmor: number;       // flat armor before level scaling and attribute contributions
  armorPerLevel: number;   // armor added per level (stacks with baseArmor)
  movement: number;        // tiles per turn (fixed, does not scale with level)

  // Attribute point-buy distribution
  highAttributes: AttributeKey[];  // always allocated more than neutral
  lowAttributes: AttributeKey[];   // always allocated less than neutral

  // Combat (static)
  weapon: WeaponItem;
  abilities: Ability[];
}

// ─── Enemy Instance ───────────────────────────────────────────────────────────

export interface EnemyInstance {
  id: string;
  type: EnemyType;          // template — name, token, color, weapon, abilities
  level: number;            // the level this enemy was generated at
  attrs: Record<AttributeKey, number>;  // base attribute values (immutable after spawn)
  buffs: ActiveBuff[];      // active buffs/debuffs; e.stats is always kept in sync
  hots: ActiveHot[];        // active heal-over-time effects
  stats: Stats;             // current effective stats (recomputed when buffs change)
  pos: { x: number; y: number };
  currentHp: number;
  currentMp: number;
  aggroed: boolean;
  zoneId: number;
  groupId: number;
  dots: ActiveDot[];
}

// ─── Stat Generation ─────────────────────────────────────────────────────────

const ALL_ATTRIBUTES: AttributeKey[] = ['strength', 'toughness', 'finesse', 'mind', 'spirit'];

/**
 * Distribute `total` attribute points weighted toward highAttributes and away
 * from lowAttributes. Post-processes to enforce: high > neutral > low in
 * allocated points (best-effort — respects zero floor).
 */
function allocateAttributePoints(
  total: number,
  highAttrs: AttributeKey[],
  lowAttrs: AttributeKey[],
): Record<AttributeKey, number> {
  const alloc: Record<AttributeKey, number> = { strength: 0, toughness: 0, finesse: 0, mind: 0, spirit: 0 };
  const neutral = ALL_ATTRIBUTES.filter(a => !highAttrs.includes(a) && !lowAttrs.includes(a));

  // Weighted random allocation
  const weight = (a: AttributeKey) => highAttrs.includes(a) ? 3 : lowAttrs.includes(a) ? 0.5 : 1;
  const totalWeight = ALL_ATTRIBUTES.reduce((sum, a) => sum + weight(a), 0);

  for (let i = 0; i < total; i++) {
    let r = Math.random() * totalWeight;
    for (const attr of ALL_ATTRIBUTES) {
      r -= weight(attr);
      if (r <= 0) { alloc[attr]++; break; }
    }
  }

  // Fix constraint violations: enforce min(high) > max(neutral) > max(low)
  // Shifts one point at a time until stable. Guards against going below 0.
  let changed = true;
  while (changed) {
    changed = false;

    // neutral > low
    for (const n of neutral) {
      for (const l of lowAttrs) {
        if (alloc[n] <= alloc[l] && alloc[l] > 0) {
          alloc[l]--; alloc[n]++; changed = true;
        }
      }
    }

    // high > neutral
    for (const h of highAttrs) {
      for (const n of neutral) {
        if (alloc[h] <= alloc[n] && alloc[n] > 0) {
          alloc[n]--; alloc[h]++; changed = true;
        }
      }
    }

    // high > low (transitive fallback)
    for (const h of highAttrs) {
      for (const l of lowAttrs) {
        if (alloc[h] <= alloc[l] && alloc[l] > 0) {
          alloc[l]--; alloc[h]++; changed = true;
        }
      }
    }
  }

  return alloc;
}

/**
 * Generate a full Stats block for an enemy from explicit attribute totals.
 * Mirrors calculateStats() in classes.ts — keep the two in sync.
 */
function generateEnemyStats(
  attrs: Record<AttributeKey, number>,
  level: number,
  hpBase: number,
  armorValue: number,   // baseArmor + armorPerLevel * level
  movement: number,
): Stats {
  const fl = (n: number) => Math.floor(n);
  const ca = (n: number) => Math.max(0, n);  // clamp attribute to ≥ 0
  const str = ca(attrs.strength), tou = ca(attrs.toughness), fin = ca(attrs.finesse),
        mnd = ca(attrs.mind),     spr = ca(attrs.spirit);

  return {
    level,
    hp:              fl(hpBase + (2 * tou) + (str / 4) + (2 * level)),
    mp:              fl(20 + (4 * mnd) + (2 * spr) + level),
    hpRegen:         1 + fl(spr / 6),
    mpRegen:         1 + fl((spr / 4) + (mnd / 6)),
    initiative:      fl(5 + (fin / 3) + (mnd / 4)),
    movement,
    armor:           fl(tou + (str / 2)) + armorValue,
    dodge:           fl(5 + (fin / 2)),
    magicResistance: fl(spr + (mnd / 2)),
    healing:         fl(spr / 3),
    threatMultiplier: 1,
    melee:  { hitBonus: fl((str / 4) + (fin / 3)), damage: fl(str / 3), crit: fl(5 + (fin / 4) + (str / 4)) },
    ranged: { hitBonus: fl(fin / 2),               damage: fl(fin / 3), crit: fl(5 + (fin / 2))               },
    magic:  { hitBonus: fl(mnd / 2),               damage: fl(mnd / 3), crit: fl(5 + (mnd / 2))               },
  };
}

/**
 * Generate a fully-initialised EnemyInstance from a template + level.
 * Called by spawnDungeonEnemies in dungeonGen.ts.
 */
export function generateEnemyInstance(
  type: EnemyType,
  level: number,
  id: string,
  pos: { x: number; y: number },
  zoneId: number,
  groupId: number,
): EnemyInstance {
  const totalPoints = TOTAL_POINTS + ATTRIBUTE_POINTS_PER_LEVEL * (level - 1);
  const allocated = allocateAttributePoints(totalPoints, type.highAttributes, type.lowAttributes);

  const attrs: Record<AttributeKey, number> = {
    strength:  BASE_ATTRIBUTES + allocated.strength,
    toughness: BASE_ATTRIBUTES + allocated.toughness,
    finesse:   BASE_ATTRIBUTES + allocated.finesse,
    mind:      BASE_ATTRIBUTES + allocated.mind,
    spirit:    BASE_ATTRIBUTES + allocated.spirit,
  };

  const armorValue = type.baseArmor + type.armorPerLevel * level;
  const stats = generateEnemyStats(attrs, level, type.hpBase, armorValue, type.movement);

  return {
    id,
    type,
    level,
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

const ATTR_KEY_SET = new Set<string>(ATTRIBUTE_KEYS);

/**
 * Recompute effective stats for an enemy given a new buff list.
 * 1. Applies attribute buffs to base attrs and re-runs stat generation.
 * 2. Applies non-attribute stat buffs additively on top.
 */
export function recomputeEnemyStats(enemy: EnemyInstance, buffs: ActiveBuff[]): Stats {
  const effAttrs = { ...enemy.attrs };
  for (const buff of buffs) {
    if (ATTR_KEY_SET.has(buff.stat)) {
      const k = buff.stat as AttributeKey;
      effAttrs[k] = Math.max(0, effAttrs[k] + buff.amount);
    }
  }
  const armorValue = enemy.type.baseArmor + enemy.type.armorPerLevel * enemy.level;
  const base = generateEnemyStats(effAttrs, enemy.level, enemy.type.hpBase, armorValue, enemy.type.movement);
  return applyStatBuffs(base, buffs);
}

/** Return a new EnemyInstance with the buff added and stats recomputed. */
export function applyBuffToEnemy(enemy: EnemyInstance, buff: ActiveBuff): EnemyInstance {
  const buffs = [...enemy.buffs, buff];
  return { ...enemy, buffs, stats: recomputeEnemyStats(enemy, buffs) };
}

// ─── Bestiary ────────────────────────────────────────────────────────────────

export const ENEMY_TYPES = {
  skeleton: {
    id: 'skeleton',
    name: 'Skeleton',
    token: '\u{1F480}',      // 💀
    color: 'bg-gray-500',
    hpBase: 0,               // no base HP — fully attribute-driven (~14-16 at level 1)
    baseArmor: 0,
    armorPerLevel: 1,
    movement: 3,
    highAttributes: ['strength', 'finesse'],
    lowAttributes: ['mind', 'spirit'],
    weapon: {
      name: 'Rusted Sword', slot: 'mainhand', weaponType: '1h Swords',
      attackCategory: 'melee', damageElement: 'slashing', level: 1,
      minDamage: 5, maxDamage: 8, range: 1,
    },
    abilities: [],
  },
  zombie: {
    id: 'zombie',
    name: 'Zombie',
    token: '\u{1F9DF}',      // 🧟
    color: 'bg-green-800',
    hpBase: 5,               // extra base HP — tough and durable (~20-24 at level 1)
    baseArmor: 2,
    armorPerLevel: 2,
    movement: 2,
    highAttributes: ['toughness', 'strength'],
    lowAttributes: ['finesse', 'mind'],
    weapon: {
      name: 'Bite', slot: 'mainhand', weaponType: 'Unarmed',
      attackCategory: 'melee', damageElement: 'bludgeoning', level: 1,
      minDamage: 4, maxDamage: 10, range: 1,
    },
    abilities: [],
  },
} satisfies Record<string, EnemyType>;
