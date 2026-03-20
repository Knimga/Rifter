import { CLASSES } from './classes';
import type { ClassKey, ClassData, Passive, ScalingPassive } from './classes';
import { DAMAGE_ELEMENTS } from './gear';
import type { DamageElement } from './gear';

// ─── Attribute Types ──────────────────────────────────────────────────────────

export type AttributeKey = 'strength' | 'toughness' | 'finesse' | 'mind' | 'spirit' | 'speed';
export const ATTRIBUTE_KEYS: AttributeKey[] = ['strength', 'toughness', 'finesse', 'mind', 'spirit', 'speed'];

// ─── Skills ───────────────────────────────────────────────────────────────────

export type SkillKey = 'perception' | 'stealth' | 'expertise' | 'spellcraft' | 'evasion'
  | 'redoubt' | 'devotion';
export const SKILL_KEYS: SkillKey[] = ['perception', 'stealth', 'expertise', 'spellcraft', 
  'evasion', 'redoubt', 'devotion'];

// ─── Buff / Debuff System ─────────────────────────────────────────────────────

/** Element-specific stat keys: e.g. 'fireResistance', 'iceHit', 'shadowDamage' */
export type ElementStatKey = `${DamageElement}${'Hit' | 'Crit' | 'Damage' | 'Resistance' | 'Penetration'}`;

/** Every stat that can be raised or lowered by a buff/debuff. */
export type BuffableStat =
  | AttributeKey | SkillKey
  | 'hpRegen' | 'mpRegen' | 'initiative' | 'movement'
  | 'armor' | 'dodge' | 'parry' | 'block' | 'glancingBlow' | 'magicResistance' | 'healing'
  | 'meleeHit' | 'meleeDamage' | 'meleeCrit' | 'meleePenetration'
  | 'rangedHit' | 'rangedDamage' | 'rangedCrit' | 'rangedPenetration'
  | 'magicHit' | 'magicDamage' | 'magicCrit' | 'magicPenetration'
  | 'threatMultiplier'
  | ElementStatKey;

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
  armorPenetration?: number;  // % points reducing armor DR on each tick
  elementPenetration?: number; // % points reducing element resistance on each tick
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

// ─── Internal Helpers ─────────────────────────────────────────────────────────

export const BASE_ATTRIBUTES = 5;
export const BASE_SKILLS = 0;
export const STARTING_ATTR_POINTS = 6;            // attribute points at level 1
export const STARTING_SKILL_POINTS = 6;           // skill points at level 1
export const ATTRIBUTE_POINTS_PER_LEVEL = 3; // additional points per level above 1
export const SKILL_POINTS_PER_LEVEL = 3;

const fl = (n: number) => Math.floor(n);
const ATTRIBUTE_KEYS_SET = new Set<string>(ATTRIBUTE_KEYS);

type ElKeyEntry = { element: DamageElement; key: 'hit' | 'crit' | 'damage' | 'resistance' | 'penetration' };
const ELEMENT_STAT_KEY_MAP = new Map<string, ElKeyEntry>(
  DAMAGE_ELEMENTS.flatMap(el => [
    [`${el}Hit`,         { element: el, key: 'hit'         }],
    [`${el}Crit`,        { element: el, key: 'crit'        }],
    [`${el}Damage`,      { element: el, key: 'damage'      }],
    [`${el}Resistance`,  { element: el, key: 'resistance'  }],
    [`${el}Penetration`, { element: el, key: 'penetration' }],
  ] as [string, ElKeyEntry][])
);

// ─── Enemy Attribute Point Generation ────────────────────────────────────────

const ALL_ATTRIBUTES: AttributeKey[] = ['strength', 'toughness', 'finesse', 'mind', 'spirit', 'speed'];

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
  const neutral = ALL_ATTRIBUTES.filter(a => !highAttributes.includes(a) && !lowAttributes.includes(a));

  // Weighted random allocation
  const weight = (a: AttributeKey) => highAttributes.includes(a) ? 3 : lowAttributes.includes(a) ? 0.5 : 1;
  const totalWeight = ALL_ATTRIBUTES.reduce((sum, a) => sum + weight(a), 0);

  for (let i = 0; i < total; i++) {
    let r = Math.random() * totalWeight;
    for (const attr of ALL_ATTRIBUTES) {
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
  pointsSpent: Record<AttributeKey, number>;
  skillPointsSpent?: Partial<Record<SkillKey, number>>;
  gearArmorBonus?: number;
  attrBuffs?: Partial<Record<AttributeKey, number>>;
};

export type EnemyStatInput = {
  mode: 'enemy';
  classData: EnemyClassStats;
  pointsSpent: Record<AttributeKey, number>;
  level: number;
  attrBuffs?: Partial<Record<AttributeKey, number>>;
};

// ─── Stat Calculation ─────────────────────────────────────────────────────────

export function getTotalAttribute(
  attr: AttributeKey,
  pointsSpent: Record<AttributeKey, number>,
  selectedClass: ClassKey | null
) {
  return BASE_ATTRIBUTES + pointsSpent[attr] + (selectedClass ? (CLASSES[selectedClass].attributes[attr] ?? 0) : 0);
}

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
    hp:              fl(20 + (2 * tou) + (str / 3) + (2 * level)),
    mp:              fl(10 + (3 * mnd) + spr + level),
    hpRegen:         1 + fl((spr / 6) + (tou / 12)),
    mpRegen:         1 + fl((spr / 6) + (mnd / 12) + (devotion / 6)),
    initiative:      fl(3 + (spd / 4) + (fin / 8) + (perception / 4) + (stealth / 6)),
    movement:        movement + fl(spd / 12),
    armor:           tou + (armorBonus * (1 + redoubt * 0.02)),
    dodge:           fl(3 + (spd / 4) + (fin / 6) + (evasion / 5)),
    parry:           (spd / 6) + (fin / 6) + (evasion / 6),
    block:           0,
    glancingBlow:    (armorBonus * (0.1 + redoubt * 0.01)) + (spd / 4) + (evasion / 4),
    magicResistance: fl(spr + (mnd / 3) + devotion),
    healing:         fl((spr / 3) + (devotion / 4)),
    melee: {
      hit:    fl((str / 4) + (fin / 3) + (expertise / 3)),
      damage:      fl((str / 3) + (fin / 6)),
      crit:        fl(5 + (fin / 4) + (str / 4) + (expertise / 3)),
      penetration: expertise / 3,
    },
    ranged: {
      hit:    fl((fin / 2) + (expertise / 3)),
      damage:      fl(fin / 3),
      crit:        fl(5 + (fin / 2) + (expertise / 3)),
      penetration: expertise / 3,
    },
    magic: {
      hit:    fl((mnd / 2) + (spellcraft / 3)),
      damage:      fl(mnd / 3),
      crit:        fl(5 + (mnd / 2) + (spellcraft / 3)),
      penetration: spellcraft / 3,
    },
    threatMultiplier: 1 - (stealth * 0.02),
    elementalStats:  {},
  };
}

/** Phase 2 — add flat class passive bonuses. Block's flat passive is scaled by Redoubt (via stats.skills). */
function applyFlatPassives(stats: Stats, passives: Record<string, Passive>): Stats {
  const pf = (key: string) => passives[key]?.flat ?? 0;
  const { redoubt } = stats.skills;
  const s = { ...stats, melee: { ...stats.melee }, ranged: { ...stats.ranged }, magic: { ...stats.magic }, elementalStats: { ...stats.elementalStats } };

  s.hp              += pf('hp');
  s.mp              += pf('mp');
  s.hpRegen         += pf('hpRegen');
  s.mpRegen         += pf('mpRegen');
  s.initiative      += pf('initiative');
  s.movement        += pf('movement');
  s.armor           += pf('armor');
  s.dodge           += pf('dodge');
  s.parry           += pf('parry');
  s.block            = pf('block') * (1 + redoubt * 0.02);
  s.glancingBlow    += pf('glancingBlow');
  s.magicResistance += pf('magicResistance');
  s.healing         += pf('healing');
  s.melee.hit       += pf('meleeHit');
  s.melee.damage      += pf('meleeDamage');
  s.melee.crit        += pf('meleeCrit');
  s.melee.penetration += pf('meleePenetration');
  s.ranged.hit        += pf('rangedHit');
  s.ranged.damage      += pf('rangedDamage');
  s.ranged.crit        += pf('rangedCrit');
  s.ranged.penetration += pf('rangedPenetration');
  s.magic.hit         += pf('magicHit');
  s.magic.damage      += pf('magicDamage');
  s.magic.crit        += pf('magicCrit');
  s.magic.penetration += pf('magicPenetration');
  s.threatMultiplier  += pf('threatMultiplier');

  for (const el of DAMAGE_ELEMENTS) {
    const hit = pf(`${el}Hit`), crit = pf(`${el}Crit`), damage = pf(`${el}Damage`);
    const resistance = pf(`${el}Resistance`), penetration = pf(`${el}Penetration`);
    if (hit || crit || damage || resistance || penetration) {
      const cur = s.elementalStats[el] ?? { hit: 0, crit: 0, damage: 0, resistance: 0, penetration: 0 };
      s.elementalStats[el] = { hit: cur.hit + hit, crit: cur.crit + crit, damage: cur.damage + damage, resistance: cur.resistance + resistance, penetration: cur.penetration + penetration };
    }
  }
  return s;
}

/** Phase 3 — add scaling passive outputs (computed from post-flat attributes), then apply percent passives. */
function applyScalingAndPctPassives(
  stats: Stats,
  passives: Record<string, Passive>,
  scalingPassives: ScalingPassive[],
): Stats {
  const s = { ...stats, melee: { ...stats.melee }, ranged: { ...stats.ranged }, magic: { ...stats.magic }, elementalStats: { ...stats.elementalStats } };

  const attrSource: Record<string, number> = { ...stats.attributes, level: stats.level };
  const scalingBonus: Record<string, number> = {};
  for (const sp of scalingPassives) {
    scalingBonus[sp.targetKey] = (scalingBonus[sp.targetKey] ?? 0) + fl((attrSource[sp.source] ?? 0) * sp.factor);
  }
  const sb = (key: string) => scalingBonus[key] ?? 0;

  s.hp              += sb('hp');
  s.mp              += sb('mp');
  s.hpRegen         += sb('hpRegen');
  s.mpRegen         += sb('mpRegen');
  s.initiative      += sb('initiative');
  s.movement        += sb('movement');
  s.armor           += sb('armor');
  s.dodge           += sb('dodge');
  s.parry           += sb('parry');
  s.block           += sb('block');
  s.glancingBlow    += sb('glancingBlow');
  s.magicResistance += sb('magicResistance');
  s.healing         += sb('healing');
  s.melee.hit    += sb('meleeHit');
  s.melee.damage      += sb('meleeDamage');
  s.melee.crit        += sb('meleeCrit');
  s.melee.penetration += sb('meleePenetration');
  s.ranged.hit    += sb('rangedHit');
  s.ranged.damage      += sb('rangedDamage');
  s.ranged.crit        += sb('rangedCrit');
  s.ranged.penetration += sb('rangedPenetration');
  s.magic.hit    += sb('magicHit');
  s.magic.damage      += sb('magicDamage');
  s.magic.crit        += sb('magicCrit');
  s.magic.penetration += sb('magicPenetration');
  s.threatMultiplier  += sb('threatMultiplier');

  const withPct = (val: number, key: string): number => { const p = passives[key]?.percent; return p ? fl(val * (1 + p / 100)) : val; };

  s.hp              = withPct(s.hp,              'hp');
  s.mp              = withPct(s.mp,              'mp');
  s.hpRegen         = withPct(s.hpRegen,         'hpRegen');
  s.mpRegen         = withPct(s.mpRegen,         'mpRegen');
  s.initiative      = withPct(s.initiative,      'initiative');
  s.movement        = withPct(s.movement,        'movement');
  s.armor           = withPct(s.armor,           'armor');
  s.dodge           = withPct(s.dodge,           'dodge');
  s.parry           = withPct(s.parry,           'parry');
  s.block           = withPct(s.block,           'block');
  s.glancingBlow    = withPct(s.glancingBlow,    'glancingBlow');
  s.magicResistance = withPct(s.magicResistance, 'magicResistance');
  s.healing         = withPct(s.healing,         'healing');
  s.melee.hit       = withPct(s.melee.hit,    'meleeHit');
  s.melee.damage      = withPct(s.melee.damage,      'meleeDamage');
  s.melee.crit        = withPct(s.melee.crit,        'meleeCrit');
  s.melee.penetration = withPct(s.melee.penetration, 'meleePenetration');
  s.ranged.hit        = withPct(s.ranged.hit,    'rangedHit');
  s.ranged.damage      = withPct(s.ranged.damage,      'rangedDamage');
  s.ranged.crit        = withPct(s.ranged.crit,        'rangedCrit');
  s.ranged.penetration = withPct(s.ranged.penetration, 'rangedPenetration');
  s.magic.hit         = withPct(s.magic.hit,    'magicHit');
  s.magic.damage      = withPct(s.magic.damage,      'magicDamage');
  s.magic.crit        = withPct(s.magic.crit,        'magicCrit');
  s.magic.penetration = withPct(s.magic.penetration, 'magicPenetration');
  // threatMultiplier is a real-valued multiplier — not floored
  const threatPct = passives['threatMultiplier']?.percent;
  if (threatPct) s.threatMultiplier *= (1 + threatPct / 100);

  for (const el of DAMAGE_ELEMENTS) {
    const cur = s.elementalStats[el] ?? { hit: 0, crit: 0, damage: 0, resistance: 0, penetration: 0 };
    const hit = withPct(cur.hit + sb(`${el}Hit`), `${el}Hit`), crit = withPct(cur.crit + sb(`${el}Crit`), `${el}Crit`);
    const damage = withPct(cur.damage + sb(`${el}Damage`), `${el}Damage`), resistance = withPct(cur.resistance + sb(`${el}Resistance`), `${el}Resistance`);
    const penetration = withPct(cur.penetration + sb(`${el}Penetration`), `${el}Penetration`);
    if (hit || crit || damage || resistance || penetration) s.elementalStats[el] = { hit, crit, damage, resistance, penetration };
    else delete s.elementalStats[el];
  }
  return s;
}

export function calculateStats(input: PlayerStatInput | EnemyStatInput): Stats {
  let armorBonus: number, level: number, movement: number;
  let passives: Record<string, Passive>, scalingPassives: ScalingPassive[];
  let str: number, tou: number, fin: number, mnd: number, spr: number, spd: number;

  const clamp = (n: number) => Math.max(0, n);

  if (input.mode === 'player') {
    // ── PLAYER: class base + manual point-buy ────────────────────────────────
    const classData: ClassData | null = input.classKey ? CLASSES[input.classKey] : null;
    passives        = classData?.passives ?? {};
    scalingPassives = classData?.scalingPassives ?? [];
    level           = 1;
    armorBonus      = input.gearArmorBonus ?? 0;
    movement        = 3;
    str = clamp(getTotalAttribute('strength',  input.pointsSpent, input.classKey) + (input.attrBuffs?.strength  ?? 0));
    tou = clamp(getTotalAttribute('toughness', input.pointsSpent, input.classKey) + (input.attrBuffs?.toughness ?? 0));
    fin = clamp(getTotalAttribute('finesse',   input.pointsSpent, input.classKey) + (input.attrBuffs?.finesse   ?? 0));
    mnd = clamp(getTotalAttribute('mind',      input.pointsSpent, input.classKey) + (input.attrBuffs?.mind      ?? 0));
    spr = clamp(getTotalAttribute('spirit',    input.pointsSpent, input.classKey) + (input.attrBuffs?.spirit    ?? 0));
    spd = clamp(getTotalAttribute('speed',     input.pointsSpent, input.classKey) + (input.attrBuffs?.speed     ?? 0));
  } else {
    // ── ENEMY: class base + auto point-buy ──────────────────────────────────
    const ca        = (attr: AttributeKey) => input.classData.attributes[attr] ?? 0;
    passives        = input.classData.passives ?? {};
    scalingPassives = input.classData.scalingPassives ?? [];
    level           = input.level;
    armorBonus      = input.classData.baseArmor + input.classData.armorPerLevel * level;
    movement        = 3;
    str = clamp(BASE_ATTRIBUTES + ca('strength')  + input.pointsSpent.strength  + (input.attrBuffs?.strength  ?? 0));
    tou = clamp(BASE_ATTRIBUTES + ca('toughness') + input.pointsSpent.toughness + (input.attrBuffs?.toughness ?? 0));
    fin = clamp(BASE_ATTRIBUTES + ca('finesse')   + input.pointsSpent.finesse   + (input.attrBuffs?.finesse   ?? 0));
    mnd = clamp(BASE_ATTRIBUTES + ca('mind')      + input.pointsSpent.mind      + (input.attrBuffs?.mind      ?? 0));
    spr = clamp(BASE_ATTRIBUTES + ca('spirit')    + input.pointsSpent.spirit    + (input.attrBuffs?.spirit    ?? 0));
    spd = clamp(BASE_ATTRIBUTES + ca('speed')     + input.pointsSpent.speed     + (input.attrBuffs?.speed     ?? 0));
  }

  const attrs: Record<AttributeKey, number> = { strength: str, toughness: tou, finesse: fin, mind: mnd, spirit: spr, speed: spd };

  // ── SKILLS: class inherent + player point-buy (enemies have no skill point-buy) ──
  const skills = Object.fromEntries(SKILL_KEYS.map(key => {
    const classVal = input.mode === 'player'
      ? (input.classKey ? (CLASSES[input.classKey].skills[key] ?? 0) : 0)
      : (input.classData.skills?.[key] ?? 0);
    const spent = input.mode === 'player' ? (input.skillPointsSpent?.[key] ?? 0) : 0;
    return [key, BASE_SKILLS + classVal + spent];
  })) as Record<SkillKey, number>;

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
  s.parry           = apply('parry',            s.parry);
  s.block           = apply('block',            s.block);
  s.glancingBlow    = apply('glancingBlow',     s.glancingBlow);
  s.magicResistance = apply('magicResistance',  s.magicResistance);
  s.healing         = apply('healing',          s.healing);
  s.melee.hit       = apply('meleeHit',          s.melee.hit);
  s.melee.damage      = apply('meleeDamage',       s.melee.damage);
  s.melee.crit        = apply('meleeCrit',         s.melee.crit);
  s.melee.penetration = apply('meleePenetration',  s.melee.penetration);
  s.ranged.hit        = apply('rangedHit',         s.ranged.hit);
  s.ranged.damage      = apply('rangedDamage',      s.ranged.damage);
  s.ranged.crit        = apply('rangedCrit',        s.ranged.crit);
  s.ranged.penetration = apply('rangedPenetration', s.ranged.penetration);
  s.magic.hit         = apply('magicHit',          s.magic.hit);
  s.magic.damage      = apply('magicDamage',       s.magic.damage);
  s.magic.crit        = apply('magicCrit',         s.magic.crit);
  s.magic.penetration = apply('magicPenetration',  s.magic.penetration);
  s.threatMultiplier = apply('threatMultiplier', s.threatMultiplier, 0.1, true);

  // Element stat buffs — route to elementalStats map
  for (const [statKey, entry] of ELEMENT_STAT_KEY_MAP) {
    const f = flatMap.get(statKey) ?? 0;
    const p = pctMap.get(statKey)  ?? 0;
    if (f === 0 && p === 0) continue;
    const cur = s.elementalStats[entry.element] ?? { hit: 0, crit: 0, damage: 0, resistance: 0, penetration: 0 };
    s.elementalStats[entry.element] = { ...cur, [entry.key]: apply(statKey, cur[entry.key]) };
  }

  return s;
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
