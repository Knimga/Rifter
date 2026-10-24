import { CLASSES } from './classes';
import { capitalize } from '../detailStrings';
import type { ClassKey, ClassData, Passive, ScalingPassive } from './classes';

//

export const ATTRIBUTE_KEYS = ['strength', 'toughness', 'finesse', 'mind', 'spirit', 'speed'] as const;
export const SKILL_KEYS = ['perception', 'stealth', 'expertise', 'spellcraft', 'evasion', 'redoubt', 'devotion'] as const;
export const DAMAGE_ELEMENTS = ['physical', 'fire', 'ice', 'lightning', 'shadow', 'poison', 'holy', 'nature'] as const;
/** The stats every damage element has: e.g. fireHit, fireCrit, fireDamage, fireResistance, firePenetration. */
export const ELEMENT_STAT_SUFFIXES = ['Hit', 'Crit', 'Damage', 'Resistance', 'Penetration'] as const;
export type ElementStatSuffix = typeof ELEMENT_STAT_SUFFIXES[number];

export type AttributeKey = typeof ATTRIBUTE_KEYS[number];
export type SkillKey = typeof SKILL_KEYS[number];
export type DamageElement = typeof DAMAGE_ELEMENTS[number];
export type ElementStatKey = `${DamageElement}${typeof ELEMENT_STAT_SUFFIXES[number]}`;

const MISC_STATS = [
  'hpRegen', 'mpRegen', 'initiative', 'movement', 'apMax',
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
  /** Action points each combat turn: moving (1 per movement's worth of tiles) and abilities spend them. */
  apMax:           number;
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
  /** A root (Effect 'root'): while it lasts the unit can't move (isRooted). Its stat change is none. */
  roots?: boolean;
}

/** Whether a root is on the unit (a condition, not a stat): in combat it can't move at all (moveBudget). */
export const isRooted = (buffs: ActiveBuff[]) => buffs.some(b => b.roots);

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
  sourceKey?: string;         // threat key of the party-side unit that applied it (party member or summon: threatKey)
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
/** Attribute points gained per level above 1 (party members on each level-up; enemies auto-allocate theirs). */
export const ATTRIBUTE_POINTS_PER_LEVEL = 3;
/** Skill points a party member gains per level-up. */
export const SKILL_POINTS_PER_LEVEL = 3;

const fl = (n: number) => Math.floor(n);

/**
 * Attributes and skills: the base stats every other stat is derived from. Bonuses to them (buffs, gear,
 * class passives) go into the base calculation (calculateStats `baseBonuses`), so what derives from them
 * (HP from toughness, crit from expertise...) follows. Every other stat goes through STAT_ACCESSORS.
 */
export type BaseStatKey = AttributeKey | SkillKey;
const BASE_STAT_KEYS = new Set<string>([...ATTRIBUTE_KEYS, ...SKILL_KEYS]);
const isBaseStat = (key: string): key is BaseStatKey => BASE_STAT_KEYS.has(key);

/** Bonuses to base stats, flat and percent (applied after the flats): from buffs and gear. */
export type BaseStatBonuses = Partial<Record<BaseStatKey, { flat: number; percent: number }>>;

// ─── Stat Accessors ───────────────────────────────────────────────────────────
//
// Every numeric stat that passives, scaling passives, and buffs can modify, keyed by its
// passive / BuffableStat key. The modifier phases iterate this table instead of listing
// each stat by hand.

/** The least threatMultiplier can be (high stealth, buffs): threat is always gained, never lost. */
export const MIN_THREAT_MULTIPLIER = 0.1;

type ScalarStatKey = 'hp' | 'mp' | 'hpRegen' | 'mpRegen' | 'initiative' | 'movement' | 'apMax' | 'armor' | 'dodge'
  | 'parry' | 'block' | 'glancingBlow' | 'magicResistance' | 'healing' | 'threatMultiplier';

interface StatAccessor {
  key: string;
  get: (s: Stats) => number;
  set: (s: Stats, v: number) => void;
  noFloor?: boolean;  // real-valued stat — percent modifiers are not floored
  // Its floor. Buffs never take a stat below it (default 0); passives never take one that declares it below
  // it (applyStatMinimums), so e.g. movement is always at least 1.
  min?: number;
}

const EMPTY_ELEMENT_STATS: ElementStats = { hit: 0, crit: 0, damage: 0, resistance: 0, penetration: 0 };

/** Most an element resistance can reduce damage by (%), whatever stacks up (gear, passives, buffs). */
export const ELEMENT_RESISTANCE_CAP = 75;
/**
 * Lowest an element resistance can go (%): negative resistance is a weakness, adding that much damage taken
 * (-75 = 1.75x damage), whatever stacks up (debuffs, penetration).
 */
export const ELEMENT_RESISTANCE_FLOOR = -75;

const scalar = (key: ScalarStatKey, opts: Partial<StatAccessor> = {}): StatAccessor =>
  ({ key, get: s => s[key], set: (s, v) => { s[key] = v; }, ...opts });

const STAT_ACCESSORS: StatAccessor[] = [
  ...(['hp', 'mp', 'hpRegen', 'mpRegen', 'initiative', 'armor', 'dodge', 'parry', 'block', 'glancingBlow', 'magicResistance', 'healing'] as const)
    .map(k => scalar(k)),
  scalar('movement', { min: 1 }),
  scalar('apMax'), // a stun can take it to 0: the unit skips its turn
  scalar('threatMultiplier', { noFloor: true, min: MIN_THREAT_MULTIPLIER }),
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
      // Resistance may go negative (a weakness), down to the floor
      ...(f === 'resistance' ? { min: ELEMENT_RESISTANCE_FLOOR } : {}),
    }))),
];

/** Copy a Stats block deeply enough that STAT_ACCESSORS setters don't mutate the original. */
function cloneStats(stats: Stats): Stats {
  return { ...stats, melee: { ...stats.melee }, ranged: { ...stats.ranged }, magic: { ...stats.magic }, elementalStats: { ...stats.elementalStats } };
}

/**
 * Finish elemental stats: keep each resistance between ELEMENT_RESISTANCE_FLOOR and ELEMENT_RESISTANCE_CAP,
 * and drop all-zero entries so consumers only see elements with real modifiers.
 */
function pruneElementalStats(s: Stats): Stats {
  for (const el of DAMAGE_ELEMENTS) {
    const e = s.elementalStats[el];
    if (e && (e.resistance > ELEMENT_RESISTANCE_CAP || e.resistance < ELEMENT_RESISTANCE_FLOOR)) {
      s.elementalStats[el] = { ...e, resistance: Math.min(ELEMENT_RESISTANCE_CAP, Math.max(ELEMENT_RESISTANCE_FLOOR, e.resistance)) };
    }
    if (e && !e.hit && !e.crit && !e.damage && !e.resistance && !e.penetration) delete s.elementalStats[el];
  }
  return s;
}

// ─── Minimal Enemy Class Shape (for stat computation) ─────────────────────────
//
// EnemyClassData in enemies.ts satisfies this structurally — no circular import needed.
// stats.ts only needs these fields; display/AI fields live on EnemyClassData.

export interface EnemyClassStats {
  attributes: Partial<Record<AttributeKey, number>>;
  baseHp: number;
  skills?: Partial<Record<SkillKey, number>>;
  baseArmor: number;
  armorPerLevel: number;
  /** Inherent damage type resistances (%): flat, like a passive on `${element}Resistance`. */
  resistances?: Partial<Record<DamageElement, number>>;
  passives?: Record<string, Passive>;
  scalingPassives?: ScalingPassive[];
}

// ─── Stat Calculation Input Types ─────────────────────────────────────────────

export type PlayerStatInput = {
  mode: 'player';
  classKey: ClassKey;
  /** The party's level (default 1). */
  level?: number;
  gearArmorBonus?: number;
  /** Attribute and skill points the member has spent (level-ups). */
  pointsSpent?: Partial<Record<AttributeKey, number>>;
  skillPointsSpent?: Partial<Record<SkillKey, number>>;
  /** Buffs and gear on attributes and skills (recomputeStats collects them). */
  baseBonuses?: BaseStatBonuses;
};

export type EnemyStatInput = {
  mode: 'enemy';
  classData: EnemyClassStats;
  /** Auto-allocated attribute points (generateEnemyAttributePoints). */
  pointsSpent: Record<AttributeKey, number>;
  level: number;
  /** Buffs on attributes and skills (recomputeStats collects them). */
  baseBonuses?: BaseStatBonuses;
};

// ─── Stat Calculation ─────────────────────────────────────────────────────────

/** Action points per combat turn (Stats.apMax): the party's and every enemy's. */
export const PLAYER_AP_MAX = 3;
export const ENEMY_AP_MAX = 3;

/** Phase 1 — pure attribute + skill formulas, no passives. */
function buildRawStats(
  attrs: Record<AttributeKey, number>,
  skills: Record<SkillKey, number>,
  level: number,
  armorBonus: number,
  movement: number,
  apMax: number,
  baseHp: number,
): Stats {
  const { strength: str, toughness: tou, finesse: fin, mind: mnd, spirit: spr, speed: spd } = attrs;
  const { perception, stealth, expertise, spellcraft, evasion, redoubt, devotion } = skills;
  return {
    level,
    attributes: attrs,
    skills,
    hp:              fl(baseHp + (str / 2) + (fl(tou / 2) * level)),
    mp:              fl(10 + spr + (mnd * level)),
    hpRegen:         1 + fl((spr / 6) + (tou / 12)),
    mpRegen:         1 + fl((spr / 6) + (mnd / 12) + (devotion / 6)),
    initiative:      fl(3 + (spd / 4) + (fin / 8) + (perception / 3) + (stealth / 6)),
    movement:        movement + fl(spd / 12),
    apMax,
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
      crit:        5 + (fin / 4) + (str / 6) + (expertise / 3) + (stealth / 5),
      penetration: expertise / 3,
    },
    ranged: {
      hit:         (fin / 2) + (expertise / 3),
      damage:      fl(fin / 3),
      crit:        5 + (fin / 2) + (expertise / 3) + (stealth / 5),
      penetration: expertise / 3,
    },
    magic: {
      hit:         (mnd / 2) + (spellcraft / 3),
      damage:      fl(mnd / 3),
      crit:        5 + (mnd / 2) + (spellcraft / 3) + (stealth / 5),
      penetration: spellcraft / 3,
    },
    threatMultiplier: 1 - (stealth * 0.05), // floored at MIN_THREAT_MULTIPLIER (applyStatMinimums)
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
  // Players: their class, the party's level, armor from gear, the points they've spent on level-ups.
  // Enemies: their class, level and level-scaled armor, plus their auto-allocated attribute points.
  const classData: EnemyClassStats | ClassData = input.mode === 'player' ? CLASSES[input.classKey] : input.classData;
  const level = input.mode === 'player' ? (input.level ?? 1) : input.level;
  const armorBonus = input.mode === 'player' ? (input.gearArmorBonus ?? 0) : input.classData.baseArmor + input.classData.armorPerLevel * level;
  const movement = 3;
  const apMax = input.mode === 'player' ? PLAYER_AP_MAX : ENEMY_AP_MAX;
  const skillPointsSpent = input.mode === 'player' ? input.skillPointsSpent : undefined;

  // A creature's inherent resistances count as flat passives on its element resistances
  const resistances = input.mode === 'enemy' ? input.classData.resistances ?? {} : {};
  const passives: Record<string, Passive> = { ...classData.passives };
  for (const [el, v] of Object.entries(resistances)) {
    const key = `${el}Resistance`;
    passives[key] = { ...passives[key], name: passives[key]?.name ?? 'Inherent', flat: (passives[key]?.flat ?? 0) + (v ?? 0) };
  }
  const scalingPassives = classData.scalingPassives ?? [];

  // A base stat: its innate value, plus the flat bonuses on it (class passives, buffs, gear), then the
  // percent ones; never below 0
  const base = (key: BaseStatKey, innate: number): number => {
    const bonus = input.baseBonuses?.[key];
    const flat = (passives[key]?.flat ?? 0) + (bonus?.flat ?? 0);
    const percent = (passives[key]?.percent ?? 0) + (bonus?.percent ?? 0);
    return Math.max(0, fl((innate + flat) * (1 + percent / 100)));
  };
  const attrs = Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key,
    base(key, BASE_ATTRIBUTES + (classData.attributes[key] ?? 0) + (input.pointsSpent?.[key] ?? 0)),
  ])) as Record<AttributeKey, number>;
  const skills = Object.fromEntries(SKILL_KEYS.map(key => [key,
    base(key, BASE_SKILLS + (classData.skills?.[key] ?? 0) + (skillPointsSpent?.[key] ?? 0)),
  ])) as Record<SkillKey, number>;

  let stats = buildRawStats(attrs, skills, level, armorBonus, movement, apMax, classData.baseHp);
  stats = applyFlatPassives(stats, passives);
  stats = applyScalingAndPctPassives(stats, passives, scalingPassives);
  return applyStatMinimums(stats);
}

/**
 * Hold every stat with a declared floor (StatAccessor.min: movement 1, threatMultiplier, element resistance)
 * at or above it, whatever passives did. Buffs keep to the same floors (applyStatBuffs). Stats without one
 * may go negative from passives (e.g. a Clumsy -10 melee hit).
 */
function applyStatMinimums(stats: Stats): Stats {
  const low = STAT_ACCESSORS.filter(a => a.min !== undefined && a.get(stats) < a.min);
  if (low.length === 0) return stats;
  const s = cloneStats(stats);
  for (const a of low) a.set(s, a.min!);
  return s;
}



/**
 * Apply buffs/debuffs on derived stats (everything but attributes and skills) to a Stats block.
 *
 * Order: flat bonuses applied first, then percentages applied to that total.
 * Formula per stat:  result = floor((base + ∑flats) × (1 + ∑percents / 100))
 *
 * Attribute and skill buffs are handled upstream (calculateStats `baseBonuses`, via recomputeStats) so
 * every value derived from them is recomputed correctly.
 */
export function applyStatBuffs(stats: Stats, buffs: ActiveBuff[]): Stats {
  const flatMap = new Map<string, number>();
  const pctMap  = new Map<string, number>();
  for (const buff of buffs) {
    if (isBaseStat(buff.stat)) continue;
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
 * Recompute effective stats for any entity given a new buff list (buffs, debuffs and gear: getGearBuffs).
 * Attribute and skill buffs (flat and percent) are fed into calculateStats so every value derived from them
 * is re-derived; buffs on other stats are then applied on top (applyStatBuffs).
 */
export function recomputeStats(input: PlayerStatInput | EnemyStatInput, buffs: ActiveBuff[]): Stats {
  const baseBonuses: BaseStatBonuses = {};
  for (const buff of buffs) {
    if (!isBaseStat(buff.stat)) continue;
    const b = baseBonuses[buff.stat] ??= { flat: 0, percent: 0 };
    b.flat += buff.amount;
    b.percent += buff.percent ?? 0;
  }
  return applyStatBuffs(calculateStats({ ...input, baseBonuses }), buffs);
}

// Every buffable stat must have a way to apply: attributes and skills through the base calculation, the
// rest through STAT_ACCESSORS. A stat with neither would be silently ignored on gear, buffs and passives.
{
  const accessorKeys = new Set(STAT_ACCESSORS.map(a => a.key));
  const missing = BUFFABLE_STATS.filter(s => !isBaseStat(s) && !accessorKeys.has(s));
  if (missing.length) throw new Error(`stats.ts: buffable stats with no way to apply: ${missing.join(', ')}`);
}
