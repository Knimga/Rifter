import { warnIgnoredEffects, type Ability } from '../combat/abilities';
import type { Passive, ScalingPassive } from './classes';
import type { AttributeKey, SkillKey, ActiveBuff, ActiveHot, ActiveDot, DamageElement } from './stats';
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
// No weapon field: attacks are abilities, the basic one an mpCost:0 attack (basicAttack).

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

  // Inherent damage type resistances (%), e.g. { fire: 30, physical: 20 }: added to its stats like flat passives
  resistances?: Partial<Record<DamageElement, number>>;

  // Optional passive system (same as players — enables elemental damage bonuses etc.)
  passives?: Record<string, Passive>;
  scalingPassives?: ScalingPassive[];

  // Forge design this creature renders as; each instance gets its own look (seeded from its id)
  model: ModelLink;

  // Hostile creatures only (EnemyClassData); a summon drops nothing and is worth no XP
  dropChance?: number;   // items dropped on death: its whole part guaranteed, its fraction the chance of one more (1.2: one, and 20% for a second)
  dropsGold?: number;    // gold dropped on death, rolled apart from items and read the same way (rolls of 5-10 x its level, summed: data/gear/loot.ts rollGold); none if absent
  goldBonus?: number;    // percent more gold in what it drops (50: half as much again)
  xpMultiplier?: number; // XP worth relative to a standard enemy of its level (data/units/xp.ts killXp): tougher = more, bosses ~6
}

/** A hostile creature's class: one the party fights (and that drops loot and gives XP). */
export interface EnemyClassData extends CreatureClassData {
  dropChance: number;
  xpMultiplier: number;
}

// ─── Enemy Instance ───────────────────────────────────────────────────────────

/**
 * How a summoned creature came to be (absent on creatures placed on the map). A summon is a spell effect: it
 * gives no XP or loot when it dies, and vanishes when its rounds run out or the fight ends.
 */
export interface SummonInfo {
  owner: string;      // its summoner's unitKey (a party member's 'party-<idx>', a creature's id); it stays if they die
  ability: string;    // the ability that summoned it (casting it again with its max out replaces the oldest)
  roundsLeft: number; // it vanishes when this runs out (counted down at the top of each round)
  allied: boolean;    // on the party's side (summoned by a party member or one of its allies); else the enemies'
}

/**
 * A creature on the map: a hostile enemy, or a summoned creature (`summon`) on either side. All share stats,
 * ticks, the turn order, drawing and the AI (enemyAI.ts); `isHostile` / `isAlly` tell the sides apart.
 */
export interface EnemyInstance {
  id: string;
  classData: CreatureClassData;     // template — name, model, abilities
  summon?: SummonInfo;
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
export const isHostile = (e: EnemyInstance) => !e.summon?.allied;

/** A creature on the party's side: one it summoned. */
export const isAlly = (e: EnemyInstance): e is EnemyInstance & { summon: SummonInfo } => !!e.summon?.allied;

/**
 * A creature's basic attack (its "weapon", for a trigger's weaponAttack): its first enemy-target ability with no
 * MP cost, the cheapest in AP of those.
 */
export function basicAttack(classData: CreatureClassData): Ability | undefined {
  const free = classData.abilities.filter(a => a.target === 'enemy' && a.mpCost === 0);
  return free.reduce<Ability | undefined>((best, a) => (!best || a.apCost < best.apCost ? a : best), undefined);
}

/** Whether a creature attacks with a physical weapon (a useWeapon ability): what a weaponOnly trigger needs. */
export const isArmed = (classData: CreatureClassData) => classData.abilities.some(a => a.useWeapon);

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
    attributes: { toughness: 2, strength: 2 },
    highAttributes: ['strength', 'finesse'],
    lowAttributes: ['mind', 'spirit'],
    baseHp: 15,
    baseArmor: 15,
    armorPerLevel: 4,
    resistances: { shadow: 20 },
    passives: {
      glancingBlow: { name: 'Boney', flat: 10 }
    },
    abilities: [
      {
        name: 'Rusted Sword',
        mpCost: 0,
        apCost: 1,
        range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        effects: [{ type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 4, maxDamage: 6 }],
      },
    ],
    dropChance: 0.25,
    dropsGold: 0.1,
    xpMultiplier: 0.8,
    model: 'creature.skeleton',
  },
  {
    id: 'zombie',
    name: 'Zombie',
    attributes: { strength: 4, toughness: 4 },
    highAttributes: ['toughness', 'strength'],
    lowAttributes: ['finesse', 'mind'],
    baseHp: 25,
    baseArmor: 10,
    armorPerLevel: 5,
    passives: {
      hpRegen: { name: 'Regeneration', flat: 1 }
    },
    abilities: [
      {
        name: 'Bite',
        mpCost: 0,
        apCost: 1,
        range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        effects: [{ type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 6, maxDamage: 8 }],
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
          {type: 'damage', appliesTo: 'target', damageElement: 'poison', minDamage: 4, maxDamage: 6 },
          {type: 'dot', appliesTo: 'target', damageElement: 'poison', damagePerRound: 5, rounds: 3}
        ]
      }
    ],
    dropChance: 0.35,
    dropsGold: 0.1,
    xpMultiplier: 1,
    model: 'creature.zombie',
  },
  {
    id: 'specter',
    name: 'Specter',
    attributes: { mind: 4, spirit: 4 },
    highAttributes: ['mind', 'spirit'],
    lowAttributes: ['strength', 'toughness'],
    baseHp: 15,
    baseArmor: 10,
    armorPerLevel: 2,
    resistances: { shadow: 20, ice: 20 },
    passives: {
      dodge: { name: 'Ethereal', flat: 10 },
      magicHit: { name: 'Vengeful', flat: 5 }
    },
    abilities: [
      {
        name: 'Black Bite',
        mpCost: 3,
        apCost: 1,
        range: 5,
        target: 'enemy',
        displayElement: 'ice',
        attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'shadow', minDamage: 1, maxDamage: 2 },
          { type: 'damage', appliesTo: 'target', damageElement: 'ice', minDamage: 1, maxDamage: 2 }
        ]
      },
      {
        name: 'Gravechill',
        mpCost: 8,
        apCost: 2,
        range: 5,
        target: 'enemy',
        area: 'blast1',
        displayElement: 'ice',
        attackCategory: 'magic',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'shadow', minDamage: 4, maxDamage: 7 },
          { type: 'debuff', appliesTo: 'target', damageElement: 'ice', stats: { dodge: -10 }, rounds: 2 }
        ]
      }
    ],
    dropChance: 0.4,
    dropsGold: 0.4,
    xpMultiplier: 1.3,
    model: 'creature.specter'
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
    resistances: { fire: 30, physical: 20 },
    abilities: [
      {
        name: 'Lava Lick',
        mpCost: 0,
        apCost: 1,
        range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'fire', minDamage: 3, maxDamage: 6 }
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
    dropsGold: 0.2,
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
    resistances: { fire: 30 },
    passives: {
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
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 1, maxDamage: 1 },
          { type: 'damage', appliesTo: 'target', damageElement: 'fire', minDamage: 2, maxDamage: 2 }
        ]
      }
    ],
    dropChance: 0.3,
    dropsGold: 0.2,
    xpMultiplier: 1,
    model: 'creature.hellhound'
  },
  {
    id: 'flame-golem',
    name: 'Flame Golem',
    attributes: { strength: 4, toughness: 6 },
    highAttributes: ['strength', 'toughness'],
    lowAttributes: ['mind', 'finesse'],
    baseHp: 40,
    baseArmor: 20,
    armorPerLevel: 4,
    resistances: { fire: 30 },
    passives: {
      meleeHit: { name: 'Clumsy', flat: -10 },
      movement: { name: 'Shambler', flat: -1 }
    },
    abilities: [
      {
        name: 'Slam',
        mpCost: 0,
        apCost: 2,
        range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 8, maxDamage: 10 },
          { type: 'damage', appliesTo: 'target', damageElement: 'fire', minDamage: 4, maxDamage: 5 },
        ]
      }
    ],
    dropChance: 0.5,
    dropsGold: 0.4,
    goldBonus: 25,
    xpMultiplier: 2,
    model: 'creature.flame-golem'
  },
  {
    id: 'fungal-spore',
    name: 'Fungal Spore',
    attributes: { finesse: 3, speed: 6 },
    highAttributes: ['finesse', 'speed'],
    lowAttributes: ['toughness', 'strength'],
    baseHp: 10,
    baseArmor: 5,
    armorPerLevel: 2,
    resistances: { nature: 30 },
    passives: {
      natureHit: { name: 'Potent', flat: 15 },
      naturePenetration: { name: 'Potent', flat: 10 }
    },
    abilities: [
      {
        name: 'Sporeburst',
        mpCost: 0,
        apCost: 1,
        range: 0,
        target: 'enemy',
        area: 'blast1',
        attackCategory: 'magic',
        selfDestruct: true,
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'nature', minDamage: 12, maxDamage: 12 }
        ]
      }
    ],
    dropChance: 0.1,
    xpMultiplier: 0.2,
    model: 'creature.fungal-spore'
  },
  {
    id: 'sporetender',
    name: 'Sporetender',
    attributes: { spirit: 4, mind: 3, finesse: 4 },
    highAttributes: ['spirit','mind'],
    lowAttributes: ['speed', 'strength'],
    baseHp: 30,
    baseArmor: 15,
    armorPerLevel: 5,
    resistances: { nature: 30, poison: 30 },
    passives: {
      mpRegen: { name: 'Renewal', flat: 1 },
      dodge: { name: 'Evasive', flat: 10 }
    },
    abilities: [
      {
        name: 'Summon Spore',
        mpCost: 10,
        apCost: 2,
        range: 1,
        target: 'tile',        
        effects: [
          { type: 'summon', appliesTo: 'caster', creature: 'fungal-spore', rounds: 3, max: 3 }
        ]
      },
      {
        name: 'Mycobloom',
        mpCost: 6,
        apCost: 2,
        range: 5,
        target: 'ally',
        effects: [
          { type: 'heal', appliesTo: 'target', damageElement: 'nature', minHeal: 5, maxHeal: 9 }
        ]
      },
      {
        name: 'Rot-thorn',
        mpCost: 4,
        apCost: 1,
        range: 4,
        target: 'enemy',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'nature', minDamage: 3, maxDamage: 5 },
          { type: 'dot', appliesTo: 'target', damageElement: 'poison', damagePerRound: 3, rounds: 3 }
        ]
      }
    ],
    dropChance: 0.4,
    dropsGold: 0.3,
    xpMultiplier: 2,
    model: 'creature.sporetender'
  },
  {
    id: 'mirehulk',
    name: 'Mirehulk',
    attributes: { toughness: 6, strength: 4 },
    highAttributes: ['toughness','strength'],
    lowAttributes: ['speed', 'finesse'],
    baseHp: 40,
    baseArmor: 20,
    armorPerLevel: 4,
    resistances: { nature: 30 },
    passives: {
      meleeHit: { name: 'Clumsy', flat: -10 },
      movement: { name: 'Shambler', flat: -1 }
    },
    abilities: [
      {
        name: 'Slam',
        mpCost: 0,
        apCost: 2,
        range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 8, maxDamage: 10 },
          { type: 'damage', appliesTo: 'target', damageElement: 'nature', minDamage: 4, maxDamage: 5 },
        ]
      },
      {
        name: 'Acrid Stench',
        mpCost: 10,
        apCost: 2,
        range: 0,
        target: 'enemy',
        area: 'blast1',
        attackCategory: 'magic',
        displayElement: 'nature',
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'nature', damagePerRound: 4, rounds: 3 },
          { type: 'debuff', appliesTo: 'target', damageElement: 'nature', stats: { meleeHit: -5 }, rounds: 3 }
        ]
      }
    ],
    dropChance: 0.4,
    dropsGold: 0.3,
    goldBonus: 25,
    xpMultiplier: 2,
    model: 'creature.mirehulk'
  },
  {
    id: 'rotfly-swarm',
    name: 'Rotfly Swarm',
    attributes: { finesse: 3, speed: 3 },
    highAttributes: ['speed', 'finesse'],
    lowAttributes: ['toughness', 'strength'],
    baseHp: 15,
    baseArmor: 0,
    armorPerLevel: 5,
    resistances: { nature: 30, physical: 20 },
    passives: {
      dodge: { name: 'Swarm', flat: 20 }
    },
    abilities: [
      {
        name: 'Venom Bite',
        mpCost: 0,
        range: 1,
        apCost: 1,
        target: 'enemy',
        attackCategory: 'melee',
        displayElement: 'poison',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'poison', minDamage: 4, maxDamage: 6 },
        ]
      },
      {
        name: 'Drink Blood',
        mpCost: 5,
        range: 1,
        apCost: 2,
        target: 'enemy',
        attackCategory: 'melee',
        displayElement: 'poison',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'poison', minDamage: 6, maxDamage: 6 },
          { type: 'heal', appliesTo: 'caster', damageElement: 'poison', minHeal: 9, maxHeal: 9 }
        ]
      }
    ],
    dropChance: 0.1,
    xpMultiplier: 1,
    model: 'creature.rotfly-swarm'
  },
  {
    id: 'gloomtoad',
    name: 'Gloomtoad',
    attributes: { toughness: 4, spirit: 2, mind: 2 },
    highAttributes: ['mind', 'spirit'],
    lowAttributes: ['finesse', 'speed'],
    baseHp: 35,
    baseArmor: 10,
    armorPerLevel: 5,
    resistances: { nature: 30, poison: 30 },
    passives: {
      hpRegen: { name: 'Amphibian Regen', flat: 1 }
    },
    abilities: [
      {
        name: 'Lick',
        mpCost: 0,
        range: 1,
        apCost: 1,
        target: 'enemy',
        attackCategory: 'melee',
        displayElement: 'poison',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'poison', minDamage: 6, maxDamage: 10 },
        ]
      },
      {
        name: 'Lob Globule',
        mpCost: 7,
        range: 4,
        apCost: 2,
        target: 'enemy',
        area: 'blast1',
        attackCategory: 'magic',
        displayElement: 'poison',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'poison', minDamage: 5, maxDamage: 9 },
          { type: 'dot', appliesTo: 'target', damageElement: 'poison', damagePerRound: 5, rounds: 3 }
        ]
      }
    ],
    dropChance: 0.2,
    dropsGold: 0.1,
    xpMultiplier: 1.5,
    model: 'creature.gloomtoad'
  },
  {
    id: 'goblin-warrior',
    name: 'Goblin Warrior',
    attributes: { toughness: 2, finesse: 4, strength: 2 },
    highAttributes: ['speed', 'strength'],
    lowAttributes: ['mind', 'spirit'],
    baseHp: 15,
    baseArmor: 20,
    armorPerLevel: 5,
    passives: {
      initiative: { name: 'Quick-witted', flat: 5 },
      block: { name: 'Goblin Buckler', flat: 5 },
      glancingBlow: { name: 'Rough n Tough', flat: 5 }
    },
    abilities: [
      {
        name: 'Shortsword',
        mpCost: 0,
        apCost: 1,
        range: 1,
        useWeapon: true,
        target: 'enemy',
        attackCategory: 'melee',
        displayElement: 'physical',
        effects: [{ type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 4, maxDamage: 6 }],
      },
      {
        name: 'Battlechant',
        mpCost: 8,
        apCost: 2,
        range: 0,
        target: 'ally',
        area: 'blast2',
        effects: [
          { type: 'buff', appliesTo: 'allies', stats: { meleeDamage: 1, armor: 5 }, rounds: 3 }
        ]
      },
      {
        name: 'Shield Bash',
        mpCost: 5,
        apCost: 1,
        range: 1,
        target: 'enemy',
        attackCategory: 'melee',
        displayElement: 'physical',
        effects: [
          { type: 'debuff', appliesTo: 'target', stats: { meleeHit: -5 }, rounds: 2 }
        ]
      }
    ],
    dropChance: 0.4,
    dropsGold: 0.3,
    xpMultiplier: 0.8,
    model: 'creature.goblin-warrior'
  },
  {
    id: 'goblin-archer',
    name: 'Goblin Archer',
    attributes: { toughness: 2, finesse: 4, speed: 2 },
    highAttributes: ['speed', 'finesse'],
    lowAttributes: ['mind', 'spirit'],
    baseHp: 15,
    baseArmor: 15,
    armorPerLevel: 3,
    passives: {
      initiative: { name: 'Quick-witted', flat: 5 },
      dodge: { name: 'Shifty', flat: 5 }
    },
    abilities: [
      {
        name: 'Shortbow',
        mpCost: 0,
        apCost: 1,
        range: 4,
        useWeapon: true,
        target: 'enemy',
        attackCategory: 'ranged',
        displayElement: 'physical',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 2, maxDamage: 4 }
        ],
      },
      {
        name: 'Barbed Arrow',
        mpCost: 8,
        apCost: 2,
        range: 4,
        useWeapon: true,
        target: 'enemy',
        attackCategory: 'ranged',
        displayElement: 'physical',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 2, maxDamage: 4 },
          { type: 'dot', appliesTo: 'target', damageElement: 'physical', damagePerRound: 4, rounds: 3, maxStacks: 3 }
        ]
      }
    ],
    dropChance: 0.4,
    dropsGold: 0.3,
    xpMultiplier: 0.8,
    model: 'creature.goblin-archer'
  },
  {
    id: 'goblin-shaman',
    name: 'Goblin Shaman',
    attributes: { toughness: 2, spirit: 4, speed: 2 },
    highAttributes: ['spirit', 'finesse'],
    lowAttributes: ['mind', 'strength'],
    baseHp: 20,
    baseArmor: 10,
    armorPerLevel: 4,
    resistances: { nature: 20, shadow: 20 },
    passives: {
      initiative: { name: 'Quick-witted', flat: 5 },
      shadowDamage: { name: 'Voodoo', flat: 3 },
      magicResistance: { name: 'Strong-willed', flat: 10 }
    },
    abilities: [
      {
        name: 'Hex',
        mpCost: 5,
        apCost: 1,
        range: 4,
        target: 'enemy',
        attackCategory: 'magic',
        displayElement: 'shadow',
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'shadow', damagePerRound: 3, rounds: 3 }
        ],
      },
      {
        name: 'Restore',
        mpCost: 7,
        apCost: 2,
        range: 4,
        target: 'ally',
        displayElement: 'nature',
        effects: [
          { type: 'heal', appliesTo: 'target', damageElement: 'nature', minHeal: 4, maxHeal: 8 },
        ]
      },
      {
        name: 'Cursed Weapon',
        mpCost: 5,
        apCost: 1,
        range: 4,
        target: 'ally',
        displayElement: 'shadow',
        effects: [
          { type: 'buff', appliesTo: 'target', rounds: 3, 
            trigger: {
              when: 'attacking', 
              categories: ['melee','ranged'], 
              weaponOnly: true,
              chance: 100,
              effects: [{type: 'damage', appliesTo: 'target', damageElement: 'shadow', minDamage: 3, maxDamage: 3}]
            }}
        ]
      }
    ],
    dropChance: 0.4,
    dropsGold: 0.4,
    xpMultiplier: 1,
    model: 'creature.goblin-shaman'
  },
  {
    id: 'troll',
    name: 'Troll',
    attributes: { toughness: 4, strength: 4 },
    highAttributes: ['toughness', 'strength'],
    lowAttributes: ['mind', 'spirit'],
    baseHp: 30,
    baseArmor: 15,
    armorPerLevel: 5,
    passives: {
      hpRegen: { name: 'Regeneration', flat: 1 }
    },
    abilities: [
      {
        name: 'Club',
        mpCost: 0,
        apCost: 2,
        range: 1,
        target: 'enemy',
        useWeapon: true,
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 8, maxDamage: 12 }
        ]
      },
      {
        name: 'Punt',
        mpCost: 0,
        apCost: 1,
        range: 1,
        target: 'enemy',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 4, maxDamage: 7 }
        ]
      },
      {
        name: 'Cleave',
        mpCost: 8,
        apCost: 3,
        range: 0,
        target: 'enemy',
        useWeapon: true,
        area: 'blast1',
        effects: [
          { type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 6, maxDamage: 8 }
        ]
      }
    ],
    dropChance: 0.5,
    dropsGold: 0.1,
    xpMultiplier: 2,
    model: 'creature.troll'
  }
];

// Effects an ability would silently ignore: warned at load
for (const c of ENEMY_CLASSES) warnIgnoredEffects(`enemies › ${c.id}`, c.abilities);

