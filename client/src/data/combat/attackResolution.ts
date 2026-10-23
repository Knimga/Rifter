import { PHYSICAL_ELEMENTS, type AttackCategory, type DamageElement } from '../gear';
import { ELEMENT_RESISTANCE_FLOOR, type Stats } from '../units/stats';
import { randInt } from '../random';

// ─── Tuning Constants ────────────────────────────────────────────────────────

const BASE_HIT_CHANCE = 80;           // base % chance any attack lands
const DR_DIVISOR = 50;                // at level 1: higher value = slower scaling of DR
const DR_DIVISOR_PER_LEVEL = 5;       // the divisor grows with the defender's level, so a DR% takes more defense later
const MAGIC_ARMOR_SHARE = 0.25;       // how much of a unit's armor counts toward its magical defense
const DR_CAP = 0.75;                  // lower value = more threatening endgame damage
export const CRIT_MULTIPLIER = 2;    // damage and heals
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

/** Whether a landed hit or a heal crits, by the offense's crit% (category + element). */
export const rollCrit = (offense: Offense): boolean => roll100() <= offense.crit;

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

/**
 * A unit's defense against a hit: its armor against physical damage; a quarter of its armor
 * (MAGIC_ARMOR_SHARE) plus its magic resistance against magical.
 */
const defenseAgainst = (target: Pick<Stats, 'armor' | 'magicResistance'>, physical: boolean): number =>
  physical ? target.armor : target.armor * MAGIC_ARMOR_SHARE + target.magicResistance;

/**
 * The damage reduction (0..DR_CAP, a fraction) a unit's defense gives against physical or magical hits, before
 * penetration. Diminishing returns, against a divisor that grows with the unit's level (DR_DIVISOR_PER_LEVEL).
 */
export function damageReduction(target: Pick<Stats, 'armor' | 'magicResistance' | 'level'>, physical: boolean): number {
  const defense = defenseAgainst(target, physical);
  const divisor = DR_DIVISOR + DR_DIVISOR_PER_LEVEL * Math.max(0, target.level - 1);
  return (defense / (defense + divisor)) * DR_CAP;
}

/** Damage after armor/MR DR, then element resistance. Used by attacks and DoT ticks. Min 1. */
export function applyDR(
  rawDamage: number,
  element: DamageElement,
  target: Stats,
  penetration = 0,          // % points subtracted from armor/MR DR (e.g. 5 reduces 15% DR to 10%)
  elementPenetration = 0,   // % points subtracted from element resistance
): number {
  const drPercent = Math.max(0, damageReduction(target, PHYSICAL_ELEMENTS.has(element)) - penetration / 100);
  // Rounded to the nearest point (not down), so on average the reduction matches DR% even for small hits
  const afterArmor = Math.max(1, rawDamage - Math.round(rawDamage * drPercent));
  // Negative resistance (a weakness, or penetration past zero) adds damage, down to the floor (-75 = 1.75x)
  const elementRes = Math.max(ELEMENT_RESISTANCE_FLOOR, (target.elementalStats[element]?.resistance ?? 0) - elementPenetration);
  if (elementRes === 0) return afterArmor;
  return Math.max(1, Math.round(afterArmor * (1 - elementRes / 100)));
}

// ─── Resolve ─────────────────────────────────────────────────────────────────

/**
 * Roll whether an attack connects. Miss, dodge, parry and block each prevent the hit entirely; only
 * melee attacks can be parried. Glancing blow and crit are only rolled once the attack has landed.
 */
export function rollHit(offense: Offense, category: AttackCategory, target: Stats): HitRoll {
  const stopped = (outcome: HitOutcome): HitRoll => ({ outcome, crit: false, glancing: false });
  if (roll100() > BASE_HIT_CHANCE + offense.hit) return stopped('miss');
  if (roll100() <= target.dodge) return stopped('dodge');
  if (category === 'melee' && roll100() <= target.parry) return stopped('parry');
  if (roll100() <= target.block) return stopped('block');
  return {
    outcome: 'hit',
    glancing: roll100() <= target.glancingBlow,
    crit: rollCrit(offense),
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
