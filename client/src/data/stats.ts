import { CLASSES } from './classes';
import type { ClassKey, ClassData } from './classes';
import { ALL_DAMAGE_ELEMENTS } from './gear';
import type { DamageElement } from './gear';

// ─── Attribute Types ──────────────────────────────────────────────────────────

export type AttributeKey = 'strength' | 'toughness' | 'finesse' | 'mind' | 'spirit';
export const ATTRIBUTE_KEYS: AttributeKey[] = ['strength', 'toughness', 'finesse', 'mind', 'spirit'];

// ─── Buff / Debuff System ─────────────────────────────────────────────────────

/** Element-specific stat keys: e.g. 'fireResistance', 'iceHit', 'shadowDamage' */
export type ElementStatKey = `${DamageElement}${'Hit' | 'Crit' | 'Damage' | 'Resistance'}`;

/** Every stat that can be raised or lowered by a buff/debuff. */
export type BuffableStat =
  | AttributeKey
  | 'hpRegen' | 'mpRegen' | 'initiative' | 'movement'
  | 'armor' | 'dodge' | 'magicResistance' | 'healing'
  | 'meleeHit' | 'meleeDamage' | 'meleeCrit'
  | 'rangedHit' | 'rangedDamage' | 'rangedCrit'
  | 'magicHit' | 'magicDamage' | 'magicCrit'
  | 'threatMultiplier'
  | ElementStatKey;

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

// ─── Stat Display Helpers ─────────────────────────────────────────────────────

/** Stat keys (BuffableStat with 'Bonus' stripped) whose values display as percentages. */
export const PERCENT_STATS = new Set([
  'dodge', 'meleeHit', 'meleeCrit', 'rangedHit', 'rangedCrit', 'magicHit', 'magicCrit',
]);

/** Returns '%' for percent-formatted stats, '' otherwise. */
export function statSuffix(key: string): string {
  if (PERCENT_STATS.has(key)) return '%';
  // element hit, crit, and resistance are percentages; element damage is flat
  if (key.endsWith('Hit') || key.endsWith('Crit') || key.endsWith('Resistance')) return '%';
  return '';
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

export const BASE_ATTRIBUTES = 5;
export const TOTAL_POINTS = 6;            // attribute points at level 1
export const ATTRIBUTE_POINTS_PER_LEVEL = 3; // additional points per level above 1

const fl = (n: number) => Math.floor(n);
const ATTRIBUTE_KEYS_SET = new Set<string>(ATTRIBUTE_KEYS);

type ElKeyEntry = { element: DamageElement; key: 'hit' | 'crit' | 'damage' | 'resistance' };
const ELEMENT_STAT_KEY_MAP = new Map<string, ElKeyEntry>(
  ALL_DAMAGE_ELEMENTS.flatMap(el => [
    [`${el}Hit`,        { element: el, key: 'hit'        }],
    [`${el}Crit`,       { element: el, key: 'crit'       }],
    [`${el}Damage`,     { element: el, key: 'damage'     }],
    [`${el}Resistance`, { element: el, key: 'resistance' }],
  ] as [string, ElKeyEntry][])
);

// ─── Stat Calculation ─────────────────────────────────────────────────────────

export function getTotalAttribute(
  attr: AttributeKey,
  pointsSpent: Record<AttributeKey, number>,
  selectedClass: ClassKey | null
) {
  return BASE_ATTRIBUTES + pointsSpent[attr] + (selectedClass ? CLASSES[selectedClass].attributes[attr] : 0);
}

export function calculateStats(
  selectedClass: ClassKey | null,
  pointsSpent: Record<AttributeKey, number>,
  gearArmorBonus = 0,
  attrBuffs: Partial<Record<AttributeKey, number>> = {},
) {
  const level = 1;
  const classData: ClassData | null = selectedClass ? CLASSES[selectedClass] : null;
  const passives = classData?.passives ?? {};
  // Flat passive bonuses that boost attributes — accepts both 'strengthBonus' and bare 'strength' as key
  const apf = (attr: AttributeKey) => (passives[`${attr}Bonus`]?.flat ?? 0) + (passives[attr]?.flat ?? 0);
  const clampAttr = (n: number) => Math.max(0, n);
  const str = clampAttr(getTotalAttribute('strength', pointsSpent, selectedClass) + (attrBuffs.strength ?? 0) + apf('strength'));
  const tou = clampAttr(getTotalAttribute('toughness', pointsSpent, selectedClass) + (attrBuffs.toughness ?? 0) + apf('toughness'));
  const fin = clampAttr(getTotalAttribute('finesse', pointsSpent, selectedClass) + (attrBuffs.finesse ?? 0) + apf('finesse'));
  const mnd = clampAttr(getTotalAttribute('mind', pointsSpent, selectedClass) + (attrBuffs.mind ?? 0) + apf('mind'));
  const spr = clampAttr(getTotalAttribute('spirit', pointsSpent, selectedClass) + (attrBuffs.spirit ?? 0) + apf('spirit'));

  // Scaling passives: floor(sourceValue * factor) added as extra flat to the target key
  const scalingFlats: Record<string, number> = {};
  const attrValues: Record<string, number> = { strength: str, toughness: tou, finesse: fin, mind: mnd, spirit: spr, level };
  for (const sp of classData?.scalingPassives ?? []) {
    scalingFlats[sp.targetKey] = (scalingFlats[sp.targetKey] ?? 0) + Math.floor((attrValues[sp.source] ?? 0) * sp.factor);
  }
  const pv = (key: string) => (passives[key]?.flat ?? 0) + (scalingFlats[key] ?? 0);

  // Apply percent passive on top of (base + flat passive): floor(val * (1 + pct/100))
  const withPct = (val: number, key: string): number => {
    const pct = passives[key]?.percent;
    return pct ? fl(val * (1 + pct / 100)) : val;
  };

  // Element stats from class passives — key convention: e.g. 'fireDamageBonus', 'iceResistanceBonus'
  type ElStats = { hit: number; crit: number; damage: number; resistance: number };
  const elementalStats: Partial<Record<DamageElement, ElStats>> = {};
  for (const el of ALL_DAMAGE_ELEMENTS) {
    const hit        = withPct(pv(`${el}HitBonus`),        `${el}HitBonus`);
    const crit       = withPct(pv(`${el}CritBonus`),       `${el}CritBonus`);
    const damage     = withPct(pv(`${el}DamageBonus`),     `${el}DamageBonus`);
    const resistance = withPct(pv(`${el}ResistanceBonus`), `${el}ResistanceBonus`);
    if (hit || crit || damage || resistance) elementalStats[el] = { hit, crit, damage, resistance };
  }

  return {
    level,
    attributes: { strength: str, toughness: tou, finesse: fin, mind: mnd, spirit: spr },
    hp: fl(20 + (2 * tou) + (str / 4) + (2 * level)),
    mp: fl(10 + (3 * mnd) + spr + level),
    hpRegen:         withPct(1 + fl(spr / 6)               + pv('hpRegenBonus'),        'hpRegenBonus'),
    mpRegen:         withPct(1 + fl((spr / 4) + (mnd / 6)) + pv('mpRegenBonus'),        'mpRegenBonus'),
    initiative:      withPct(fl(5 + (fin / 3) + (mnd / 4)) + pv('initiativeBonus'),     'initiativeBonus'),
    movement: 3,
    armor:           withPct(fl(tou + (str / 2)) + pv('armorBonus') + gearArmorBonus,   'armorBonus'),
    dodge:           withPct(fl(5 + (fin / 2))   + pv('dodgeBonus'),                    'dodgeBonus'),
    magicResistance: withPct(fl(spr + (mnd / 2)) + pv('magicResistanceBonus'),          'magicResistanceBonus'),
    healing:         withPct(fl(spr / 3)          + pv('healingBonus'),                 'healingBonus'),
    melee: {
      hitBonus: withPct(fl((str / 4) + (fin / 3)) + pv('meleeHitBonus'),    'meleeHitBonus'),
      damage:   withPct(fl(str / 3)               + pv('meleeDamageBonus'), 'meleeDamageBonus'),
      crit:     withPct(fl(5 + (fin / 4) + (str / 4)) + pv('meleeCritBonus'), 'meleeCritBonus'),
    },
    ranged: {
      hitBonus: withPct(fl(fin / 2) + pv('rangedHitBonus'),    'rangedHitBonus'),
      damage:   withPct(fl(fin / 3) + pv('rangedDamageBonus'), 'rangedDamageBonus'),
      crit:     withPct(fl(5 + (fin / 2)) + pv('rangedCritBonus'), 'rangedCritBonus'),
    },
    magic: {
      hitBonus: withPct(fl(mnd / 2) + pv('magicHitBonus'),    'magicHitBonus'),
      damage:   withPct(fl(mnd / 3) + pv('magicDamageBonus'), 'magicDamageBonus'),
      crit:     withPct(fl(5 + (mnd / 2)) + pv('magicCritBonus'), 'magicCritBonus'),
    },
    threatMultiplier: (1 + pv('threatMultiplierBonus')) * (1 + (passives.threatMultiplierBonus?.percent ?? 0) / 100),
    elementalStats,
  };
}

export type Stats = ReturnType<typeof calculateStats>;

/**
 * Apply non-attribute buffs/debuffs to a Stats block.
 *
 * Order: flat bonuses applied first, then percentages applied to that total.
 * Formula per stat:  result = floor((base + ∑flats) × (1 + ∑percents / 100))
 *
 * Attribute buffs are handled upstream (attrBuffs param in calculateStats /
 * generateEnemyStats) so all derived values are recomputed correctly.
 */
export function applyStatBuffs(stats: Stats, buffs: ActiveBuff[]): Stats {
  if (buffs.length === 0) return stats;
  const s = {
    ...stats,
    melee: { ...stats.melee },
    ranged: { ...stats.ranged },
    magic: { ...stats.magic },
    elementalStats: { ...stats.elementalStats },
  };

  // Collect flat and percent totals per non-attribute stat
  const flatMap = new Map<string, number>();
  const pctMap  = new Map<string, number>();
  for (const buff of buffs) {
    if (ATTRIBUTE_KEYS_SET.has(buff.stat)) continue;
    if (buff.amount)  flatMap.set(buff.stat, (flatMap.get(buff.stat) ?? 0) + buff.amount);
    if (buff.percent) pctMap.set(buff.stat,  (pctMap.get(buff.stat)  ?? 0) + buff.percent);
  }
  if (flatMap.size === 0 && pctMap.size === 0) return stats;

  // (base + flat) * (1 + pct/100), floored and clamped
  const apply = (st: string, base: number, minVal = 0, noFloor = false): number => {
    const f = flatMap.get(st) ?? 0;
    const p = pctMap.get(st)  ?? 0;
    if (f === 0 && p === 0) return base;
    const withFlat = base + f;
    const result = p !== 0 ? withFlat * (1 + p / 100) : withFlat;
    return Math.max(minVal, noFloor ? result : fl(result));
  };

  s.hpRegen         = apply('hpRegen',         s.hpRegen);
  s.mpRegen         = apply('mpRegen',          s.mpRegen);
  s.initiative      = apply('initiative',       s.initiative);
  s.movement        = apply('movement',         s.movement,        1);
  s.armor           = apply('armor',            s.armor);
  s.dodge           = apply('dodge',            s.dodge);
  s.magicResistance = apply('magicResistance',  s.magicResistance);
  s.healing         = apply('healing',          s.healing);
  s.melee.hitBonus  = apply('meleeHit',         s.melee.hitBonus);
  s.melee.damage    = apply('meleeDamage',      s.melee.damage);
  s.melee.crit      = apply('meleeCrit',        s.melee.crit);
  s.ranged.hitBonus = apply('rangedHit',        s.ranged.hitBonus);
  s.ranged.damage   = apply('rangedDamage',     s.ranged.damage);
  s.ranged.crit     = apply('rangedCrit',       s.ranged.crit);
  s.magic.hitBonus  = apply('magicHit',         s.magic.hitBonus);
  s.magic.damage    = apply('magicDamage',      s.magic.damage);
  s.magic.crit      = apply('magicCrit',        s.magic.crit);
  s.threatMultiplier = apply('threatMultiplier', s.threatMultiplier, 0.1, true);

  // Element stat buffs — route to elementalStats map
  for (const [statKey, entry] of ELEMENT_STAT_KEY_MAP) {
    const f = flatMap.get(statKey) ?? 0;
    const p = pctMap.get(statKey)  ?? 0;
    if (f === 0 && p === 0) continue;
    const cur = s.elementalStats[entry.element] ?? { hit: 0, crit: 0, damage: 0, resistance: 0 };
    s.elementalStats[entry.element] = { ...cur, [entry.key]: apply(statKey, cur[entry.key]) };
  }

  return s;
}
