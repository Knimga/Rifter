import { PHYSICAL_ELEMENTS, type AttackCategory, type DamageElement } from './gear';
import type { Stats } from './stats';
import { randInt } from './random';

// ─── Tuning Constants ────────────────────────────────────────────────────────

const BASE_HIT_CHANCE = 75;           // base % chance any attack lands
const DR_DIVISOR = 50;                // higher value = slower scaling of DR
const DR_CAP = 0.75;                  // lower value = more threatening endgame damage
const CRIT_MULTIPLIER = 2;
const GLANCING_MULTIPLIER = 0.7;      // glancing blows deal 30% less damage

// ─── Types ───────────────────────────────────────────────────────────────────

/** An attacker's effective offense for one attackCategory + damageElement pairing. */
export interface Offense {
  hit: number;                // category hit% + element hit%
  crit: number;               // category crit% + element crit%
  damage: number;             // routed category damage + element damage
  penetration: number;        // routed category penetration — % points off armor/MR DR
  elementPenetration: number; // % points off the target's element resistance
}

/** Outcomes that stop an attack before damage: miss, dodge, parry, block. */
export type HitOutcome = 'miss' | 'dodge' | 'parry' | 'block' | 'hit';

export interface HitRoll {
  outcome: HitOutcome;
  crit: boolean;
  glancing: boolean;          // landed hit whose damage is reduced (only possible when outcome === 'hit')
}

export interface DamageRoll {
  roll: number;               // random roll within min/max
  raw: number;                // roll + offense damage, after crit/glancing multipliers
  final: number;              // after DR and element resistance
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const roll100 = () => randInt(1, 100);

/**
 * Hit/crit come from the attackCategory. Damage/penetration come from the category for physical
 * elements, but from magic for magical elements — and a magic attackCategory routes ALL elements
 * (even physical) through magic damage/penetration.
 */
export function getOffense(stats: Stats, category: AttackCategory, element: DamageElement): Offense {
  const cat = stats[category];
  const routed = (!PHYSICAL_ELEMENTS.has(element) || category === 'magic') ? stats.magic : cat;
  const el = stats.elementalStats[element];
  return {
    hit: cat.hit + (el?.hit ?? 0),
    crit: cat.crit + (el?.crit ?? 0),
    damage: routed.damage + (el?.damage ?? 0),
    penetration: routed.penetration,
    elementPenetration: el?.penetration ?? 0,
  };
}

// ─── Damage Reduction ─────────────────────────────────────────────────────────

/** Damage after armor/MR DR, then element resistance. Used by attacks and DoT ticks. Min 1. */
export function applyDR(
  rawDamage: number,
  element: DamageElement,
  target: Stats,
  penetration = 0,          // % points subtracted from armor/MR DR (e.g. 5 reduces 15% DR to 10%)
  elementPenetration = 0,   // % points subtracted from element resistance
): number {
  const defense = PHYSICAL_ELEMENTS.has(element)
    ? target.armor
    : target.armor * 0.5 + target.magicResistance;
  const drPercent = Math.max(0, (defense / (defense + DR_DIVISOR)) * DR_CAP - penetration / 100);
  const afterArmor = Math.max(1, rawDamage - Math.floor(rawDamage * drPercent));
  const elementRes = Math.max(0, (target.elementalStats[element]?.resistance ?? 0) - elementPenetration);
  if (elementRes === 0) return afterArmor;
  return Math.max(1, Math.round(afterArmor * (1 - elementRes / 100)));
}

// ─── Resolve ─────────────────────────────────────────────────────────────────

/**
 * Roll whether an attack connects. Miss, dodge, parry and block each prevent the hit entirely;
 * glancing blow and crit are only rolled once the attack has landed.
 */
export function rollHit(offense: Offense, target: Stats): HitRoll {
  const stopped = (outcome: HitOutcome): HitRoll => ({ outcome, crit: false, glancing: false });
  if (roll100() > BASE_HIT_CHANCE + offense.hit) return stopped('miss');
  if (roll100() <= target.dodge) return stopped('dodge');
  if (roll100() <= target.parry) return stopped('parry');
  if (roll100() <= target.block) return stopped('block');
  return {
    outcome: 'hit',
    glancing: roll100() <= target.glancingBlow,
    crit: roll100() <= offense.crit,
  };
}

/** Roll one damage component of a landed hit. Every component of the hit shares its crit/glancing result. */
export function rollDamage(
  offense: Offense,
  element: DamageElement,
  minDamage: number,
  maxDamage: number,
  target: Stats,
  hit: HitRoll,
): DamageRoll {
  const roll = randInt(minDamage, maxDamage);
  let raw = roll + offense.damage;
  if (hit.crit) raw *= CRIT_MULTIPLIER;
  if (hit.glancing) raw = Math.floor(raw * GLANCING_MULTIPLIER);
  const final = applyDR(raw, element, target, offense.penetration, offense.elementPenetration);
  return { roll, raw, final };
}
