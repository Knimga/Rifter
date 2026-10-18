import { CLASSES } from './classes';
import type { ClassKey, ClassData, Passive, ScalingPassive } from './classes';

//

export const ATTRIBUTE_KEYS = ['strength', 'toughness', 'finesse', 'mind', 'spirit', 'speed'] as const;
export const SKILL_KEYS = ['perception', 'stealth', 'expertise', 'spellcraft', 'evasion', 'redoubt', 'devotion'] as const;
export const DAMAGE_ELEMENTS = ['slashing', 'piercing', 'bludgeoning', 'fire', 'ice', 'lightning', 'shadow', 'poison', 'holy', 'nature'] as const;
const ELEMENT_STAT_SUFFIXES = ['Hit', 'Crit', 'Damage', 'Resistance', 'Penetration'] as const;

export type AttributeKey = typeof ATTRIBUTE_KEYS[number];
export type SkillKey = typeof SKILL_KEYS[number];
export type DamageElement = typeof DAMAGE_ELEMENTS[number];
export type ElementStatKey = `${DamageElement}${typeof ELEMENT_STAT_SUFFIXES[number]}`;

const MISC_STATS = [
  'hpRegen', 'mpRegen', 'initiative', 'movement',
  'armor', 'dodge', 'parry', 'block', 'glancingBlow', 'magicResistance', 'healing',
  'meleeHit', 'meleeDamage', 'meleeCrit', 'meleePenetration',
  'rangedHit', 'rangedDamage', 'rangedCrit', 'rangedPenetration',
  'magicHit', 'magicDamage', 'magicCrit', 'magicPenetration',
  'threatMultiplier',
] as const;

/** Every stat that can be raised or lowered by a buff/debuff. */
export type BuffableStat =
  | AttributeKey | SkillKey
  | typeof MISC_STATS[number]
  | ElementStatKey;

  /** Element-specific stat keys: e.g. 'fireResistance', 'iceHit', 'shadowDamage' */
export const ELEMENT_STAT_KEYS: ElementStatKey[] = DAMAGE_ELEMENTS.flatMap(el =>
  ELEMENT_STAT_SUFFIXES.map(suffix => `${el}${suffix}` as ElementStatKey)
);

export const BUFFABLE_STATS: BuffableStat[] = [
  ...ATTRIBUTE_KEYS,
  ...SKILL_KEYS,
  ...MISC_STATS,
  ...ELEMENT_STAT_KEYS,
];

interface AttackCategoryStats {
  hit:    number;
  damage:      number;
  crit:        number;
  penetration: number;
}

interface ElementStats {
  hit:         number;
  crit:        number;
  damage:      number;
  resistance:  number;
  penetration: number;
}

export interface Stats {
  level:           number;
  attributes:      Record<AttributeKey, number>;
  skills:          Record<SkillKey, number>;
  hp:              number;
  mp:              number;
  hpRegen:         number;
  mpRegen:         number;
  initiative:      number;
  movement:        number;
  armor:           number;
  dodge:           number;
  parry:           number;
  block:           number;
  glancingBlow:    number;
  magicResistance: number;
  healing:         number;
  melee:           AttackCategoryStats;
  ranged:          AttackCategoryStats;
  magic:           AttackCategoryStats;
  threatMultiplier: number;
  elementalStats:  Partial<Record<DamageElement, ElementStats>>;
}

export interface ActiveBuff {
  id: string;              // source key — prevents double-applying the same buff source
  source?: string;         // ability name for grouping/tooltip
  damageElement?: DamageElement;
  stat: BuffableStat;
  amount: number;          // flat delta — positive = buff, negative = debuff (0 if percent-only)
  percent?: number;        // percentage delta applied after flats — e.g. 10 = +10%, -20 = -20%
  roundsRemaining: number;
}

export interface ActiveHot {
  name?: string;
  damageElement?: DamageElement;
  healPerRound: number;
  roundsRemaining: number;
}

export interface ActiveDot {
  name?: string;
  damageElement: DamageElement;
  damagePerRound: number;
  roundsRemaining: number;
  sourcePartyIdx?: number;    // party member who applied this DoT (for threat attribution)
  penetration?: number;       // % points reducing armor/MR DR on each tick
  elementPenetration?: number; // % points reducing element resistance on each tick
  damagesMP?: boolean;        // ticks drain MP instead of HP
}

// ─── Stat Display Helpers ─────────────────────────────────────────────────────

/** Stat keys (BuffableStat with 'Bonus' stripped) whose values display as percentages. */
export const PERCENT_STATS = new Set([
  'dodge', 'parry', 'block', 'glancingBlow',
  'meleeHit', 'meleeCrit', 'meleePenetration',
  'rangedHit', 'rangedCrit', 'rangedPenetration',
  'magicHit', 'magicCrit', 'magicPenetration',
  // elemental: Hit/Crit/Resistance/Penetration are %; Damage is flat
  ...DAMAGE_ELEMENTS.flatMap(el => [`${el}Hit`, `${el}Crit`, `${el}Resistance`, `${el}Penetration`]),
]);

/** Returns '%' for percent-formatted stats, '' otherwise. */
export function statSuffix(key: string): string {
  return PERCENT_STATS.has(key) ? '%' : '';
}

/** Formats a stat value for display: 1 decimal place for percent stats, raw otherwise. */
export function formatStatValue(key: string, value: number): string {
  return PERCENT_STATS.has(key) ? value.toFixed(1) : String(value);
}

/** Formatted value plus its '%' suffix where applicable, e.g. formatStat('dodge', 7.25) → '7.3%'. */
export const formatStat = (key: string, value: number) => `${formatStatValue(key, value)}${statSuffix(key)}`;

// ─── Internal Helpers ─────────────────────────────────────────────────────────

export const BASE_ATTRIBUTES = 5;
export const BASE_SKILLS = 0;
// Enemies' auto-allocated attribute points at level 1. Players have no point-buy at level 1: their
// attributes are BASE_ATTRIBUTES + class attributes, skills BASE_SKILLS + class skills.
export const STARTING_ATTR_POINTS = 6;
export const ATTRIBUTE_POINTS_PER_LEVEL = 3; // additional points per level above 1

const fl = (n: number) => Math.floor(n);
const ATTRIBUTE_KEYS_SET = new Set<string>(ATTRIBUTE_KEYS);

// ─── Stat Accessors ───────────────────────────────────────────────────────────
//
// Every numeric stat that passives, scaling passives, and buffs can modify, keyed by its
// passive / BuffableStat key. The modifier phases iterate this table instead of listing
// each stat by hand.

type ScalarStatKey = 'hp' | 'mp' | 'hpRegen' | 'mpRegen' | 'initiative' | 'movement' | 'armor' | 'dodge'
  | 'parry' | 'block' | 'glancingBlow' | 'magicResistance' | 'healing' | 'threatMultiplier';

interface StatAccessor {
  key: string;
  get: (s: Stats) => number;
  set: (s: Stats, v: number) => void;
  noFloor?: boolean;  // real-valued stat — percent modifiers are not floored
  min?: number;       // lower clamp when buffs modify the stat (default 0)
}

const capitalize = (k: string) => k[0].toUpperCase() + k.slice(1);
const EMPTY_ELEMENT_STATS: ElementStats = { hit: 0, crit: 0, damage: 0, resistance: 0, penetration: 0 };

const scalar = (key: ScalarStatKey, opts: Partial<StatAccessor> = {}): StatAccessor =>
  ({ key, get: s => s[key], set: (s, v) => { s[key] = v; }, ...opts });

const STAT_ACCESSORS: StatAccessor[] = [
  ...(['hp', 'mp', 'hpRegen', 'mpRegen', 'initiative', 'armor', 'dodge', 'parry', 'block', 'glancingBlow', 'magicResistance', 'healing'] as const)
    .map(k => scalar(k)),
  scalar('movement', { min: 1 }),
  scalar('threatMultiplier', { noFloor: true, min: 0.1 }),
  ...(['melee', 'ranged', 'magic'] as const).flatMap(cat =>
    (['hit', 'damage', 'crit', 'penetration'] as const).map((f): StatAccessor => ({
      key: `${cat}${capitalize(f)}`,
      get: s => s[cat][f],
      set: (s, v) => { s[cat][f] = v; },
    }))),
  ...DAMAGE_ELEMENTS.flatMap(el =>
    (['hit', 'crit', 'damage', 'resistance', 'penetration'] as const).map((f): StatAccessor => ({
      key: `${el}${capitalize(f)}`,
      get: s => s.elementalStats[el]?.[f] ?? 0,
      set: (s, v) => { s.elementalStats[el] = { ...(s.elementalStats[el] ?? EMPTY_ELEMENT_STATS), [f]: v }; },
    }))),
];

/** Copy a Stats block deeply enough that STAT_ACCESSORS setters don't mutate the original. */
function cloneStats(stats: Stats): Stats {
  return { ...stats, melee: { ...stats.melee }, ranged: { ...stats.ranged }, magic: { ...stats.magic }, elementalStats: { ...stats.elementalStats } };
}

/** Drop all-zero elemental entries so consumers only see elements with real modifiers. */
function pruneElementalStats(s: Stats): Stats {
  for (const el of DAMAGE_ELEMENTS) {
    const e = s.elementalStats[el];
    if (e && !e.hit && !e.crit && !e.damage && !e.resistance && !e.penetration) delete s.elementalStats[el];
  }
  return s;
}

// ─── Enemy Attribute Point Generation ────────────────────────────────────────


/**
 * Distribute attribute points for an enemy based on level and high/low preferences.
 * Returns pointsSpent (allocated beyond BASE_ATTRIBUTES), same shape as player point-buy.
 */
export function generateEnemyAttributePoints(
  level: number,
  highAttributes: AttributeKey[],
  lowAttributes: AttributeKey[],
): Record<AttributeKey, number> {
  const total = STARTING_ATTR_POINTS + ATTRIBUTE_POINTS_PER_LEVEL * (level - 1);
  const alloc: Record<AttributeKey, number> = { strength: 0, toughness: 0, finesse: 0, mind: 0, spirit: 0, speed: 0 };
  const neutral = ATTRIBUTE_KEYS.filter(a => !highAttributes.includes(a) && !lowAttributes.includes(a));

  // Weighted random allocation
  const weight = (a: AttributeKey) => highAttributes.includes(a) ? 3 : lowAttributes.includes(a) ? 0.5 : 1;
  const totalWeight = ATTRIBUTE_KEYS.reduce((sum, a) => sum + weight(a), 0);

  for (let i = 0; i < total; i++) {
    let r = Math.random() * totalWeight;
    for (const attr of ATTRIBUTE_KEYS) {
      r -= weight(attr);
      if (r <= 0) { alloc[attr]++; break; }
    }
  }

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

// ─── Minimal Enemy Class Shape (for stat computation) ─────────────────────────
//
// EnemyClassData in enemies.ts satisfies this structurally — no circular import needed.
// stats.ts only needs these fields; display/AI fields live on EnemyClassData.

export interface EnemyClassStats {
  attributes: Partial<Record<AttributeKey, number>>;
  skills?: Partial<Record<SkillKey, number>>;
  baseArmor: number;
  armorPerLevel: number;
  passives?: Record<string, Passive>;
  scalingPassives?: ScalingPassive[];
}

// ─── Stat Calculation Input Types ─────────────────────────────────────────────

export type PlayerStatInput = {
  mode: 'player';
  classKey: ClassKey | null;
  gearArmorBonus?: number;
  attrBuffs?: Partial<Record<AttributeKey, number>>;
};

export type EnemyStatInput = {
  mode: 'enemy';
  classData: EnemyClassStats;
  /** Auto-allocated attribute points (generateEnemyAttributePoints). */
  pointsSpent: Record<AttributeKey, number>;
  level: number;
  attrBuffs?: Partial<Record<AttributeKey, number>>;
};

// ─── Stat Calculation ─────────────────────────────────────────────────────────

/** Phase 1 — pure attribute + skill formulas, no passives. */
function buildRawStats(
  attrs: Record<AttributeKey, number>,
  skills: Record<SkillKey, number>,
  level: number,
  armorBonus: number,
  movement: number,
): Stats {
  const { strength: str, toughness: tou, finesse: fin, mind: mnd, spirit: spr, speed: spd } = attrs;
  const { perception, stealth, expertise, spellcraft, evasion, redoubt, devotion } = skills;
  return {
    level,
    attributes: attrs,
    skills,
    hp:              fl(20 + (2 * tou) + (str / 2) + (2 * level)),
    mp:              fl(10 + (3 * mnd) + spr + level),
    hpRegen:         1 + fl((spr / 6) + (tou / 12)),
    mpRegen:         1 + fl((spr / 6) + (mnd / 12) + (devotion / 6)),
    initiative:      fl(3 + (spd / 4) + (fin / 8) + (perception / 3) + (stealth / 6)),
    movement:        movement + fl(spd / 12),
    armor:           fl(tou + (armorBonus * (1 + redoubt * 0.02))),
    dodge:           3 + (spd / 3) + (fin / 6) + (evasion / 4),
    parry:           (spd / 6) + (fin / 6) + (evasion / 6),
    block:           0,
    glancingBlow:    (armorBonus * (0.05 + redoubt * 0.01)) + (spd / 4) + (evasion / 4),
    magicResistance: fl(spr + (mnd / 3) + devotion),
    healing:         fl((spr / 3) + (devotion / 4)),
    melee: {
      hit:         (str / 4) + (fin / 3) + (expertise / 3),
      damage:      fl((str / 3) + (fin / 6)),
      crit:        5 + (fin / 4) + (str / 4) + (expertise / 3),
      penetration: expertise / 3,
    },
    ranged: {
      hit:         (fin / 2) + (expertise / 3),
      damage:      fl(fin / 3),
      crit:        5 + (fin / 2) + (expertise / 3),
      penetration: expertise / 3,
    },
    magic: {
      hit:         (mnd / 2) + (spellcraft / 3),
      damage:      fl(mnd / 3),
      crit:        5 + (mnd / 2) + (spellcraft / 3),
      penetration: spellcraft / 3,
    },
    threatMultiplier: 1 - (stealth * 0.02),
    elementalStats:  {},
  };
}

/** Phase 2 — add flat class passive bonuses. Block's flat passive is scaled by Redoubt (via stats.skills). */
function applyFlatPassives(stats: Stats, passives: Record<string, Passive>): Stats {
  const s = cloneStats(stats);
  const blockScale = 1 + stats.skills.redoubt * 0.02;
  for (const a of STAT_ACCESSORS) {
    const flat = passives[a.key]?.flat;
    if (flat) a.set(s, a.get(s) + (a.key === 'block' ? flat * blockScale : flat));
  }
  return s;
}

/** Phase 3 — add scaling passive outputs (computed from post-flat attributes), then apply percent passives. */
function applyScalingAndPctPassives(
  stats: Stats,
  passives: Record<string, Passive>,
  scalingPassives: ScalingPassive[],
): Stats {
  const s = cloneStats(stats);

  const attrSource: Record<string, number> = { ...stats.attributes, level: stats.level };
  const scalingBonus: Record<string, number> = {};
  for (const sp of scalingPassives) {
    scalingBonus[sp.targetKey] = (scalingBonus[sp.targetKey] ?? 0) + fl((attrSource[sp.source] ?? 0) * sp.factor);
  }

  for (const a of STAT_ACCESSORS) {
    const bonus = scalingBonus[a.key] ?? 0;
    const pct = passives[a.key]?.percent;
    if (!bonus && !pct) continue;
    let v = a.get(s) + bonus;
    if (pct) v = a.noFloor ? v * (1 + pct / 100) : fl(v * (1 + pct / 100));
    a.set(s, v);
  }
  return pruneElementalStats(s);
}

export function calculateStats(input: PlayerStatInput | EnemyStatInput): Stats {
  // Players: their class (none yet in the builder), level 1, armor from gear. Enemies: their class, level
  // and level-scaled armor, plus their auto-allocated attribute points. Players have no point-buy.
  const classData: EnemyClassStats | ClassData | null = input.mode === 'player' ? (input.classKey ? CLASSES[input.classKey] : null) : input.classData;
  const level = input.mode === 'player' ? 1 : input.level;
  const armorBonus = input.mode === 'player' ? (input.gearArmorBonus ?? 0) : input.classData.baseArmor + input.classData.armorPerLevel * level;
  const movement = 3;

  const attrs = Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, Math.max(0,
    BASE_ATTRIBUTES + (classData?.attributes[key] ?? 0) + (input.mode === 'enemy' ? input.pointsSpent[key] : 0) + (input.attrBuffs?.[key] ?? 0),
  )])) as Record<AttributeKey, number>;
  const skills = Object.fromEntries(SKILL_KEYS.map(key => [key, BASE_SKILLS + (classData?.skills?.[key] ?? 0)])) as Record<SkillKey, number>;
  const passives = classData?.passives ?? {};
  const scalingPassives = classData?.scalingPassives ?? [];

  let stats = buildRawStats(attrs, skills, level, armorBonus, movement);
  stats = applyFlatPassives(stats, passives);
  stats = applyScalingAndPctPassives(stats, passives, scalingPassives);
  return stats;
}



/**
 * Apply non-attribute buffs/debuffs to a Stats block.
 *
 * Order: flat bonuses applied first, then percentages applied to that total.
 * Formula per stat:  result = floor((base + ∑flats) × (1 + ∑percents / 100))
 *
 * Attribute buffs are handled upstream (attrBuffs param in calculateStats)
 * so all derived values are recomputed correctly.
 */
export function applyStatBuffs(stats: Stats, buffs: ActiveBuff[]): Stats {
  const flatMap = new Map<string, number>();
  const pctMap  = new Map<string, number>();
  for (const buff of buffs) {
    if (ATTRIBUTE_KEYS_SET.has(buff.stat)) continue;
    if (buff.amount)  flatMap.set(buff.stat, (flatMap.get(buff.stat) ?? 0) + buff.amount);
    if (buff.percent) pctMap.set(buff.stat,  (pctMap.get(buff.stat)  ?? 0) + buff.percent);
  }
  if (flatMap.size === 0 && pctMap.size === 0) return stats;

  const s = cloneStats(stats);
  for (const a of STAT_ACCESSORS) {
    const f = flatMap.get(a.key) ?? 0;
    const p = pctMap.get(a.key)  ?? 0;
    if (f === 0 && p === 0) continue;
    const result = (a.get(s) + f) * (1 + p / 100);
    a.set(s, Math.max(a.min ?? 0, a.noFloor ? result : fl(result)));
  }
  return pruneElementalStats(s);
}

/**
 * Recompute effective stats for any entity given a new buff list.
 * Attribute buffs are extracted and fed into calculateStats so all derived
 * values are re-derived; non-attribute buffs are then applied additively on top.
 */
export function recomputeStats(input: PlayerStatInput | EnemyStatInput, buffs: ActiveBuff[]): Stats {
  const attrBuffs: Partial<Record<AttributeKey, number>> = {};
  for (const buff of buffs) {
    if (ATTRIBUTE_KEYS_SET.has(buff.stat)) {
      const k = buff.stat as AttributeKey;
      attrBuffs[k] = (attrBuffs[k] ?? 0) + buff.amount;
    }
  }
  return applyStatBuffs(calculateStats({ ...input, attrBuffs }), buffs);
}
