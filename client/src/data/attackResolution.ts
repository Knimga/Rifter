import { PHYSICAL_ELEMENTS, type DamageElement } from './gear';

// ─── Tuning Constants ────────────────────────────────────────────────────────

const BASE_HIT_CHANCE = 75;           // base % chance any attack lands
const DR_DIVISOR = 50;                // higher value = slower scaling of DR
const DR_CAP = 0.75;                  // lower value = more threatening endgame damage

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AttackParams {
  hitBonus: number;           // attacker's hitBonus% for this attack type
  damageBonus: number;        // attacker's damage bonus for this attack type
  critChance: number;         // attacker's crit% for this attack type
  minDamage: number;          // weapon / ability min damage
  maxDamage: number;          // weapon / ability max damage
  damageElement: DamageElement; // determines which defense stat applies
  targetDodge: number;        // target's dodge stat (dodge of 5 = 5%)
  targetArmor: number;        // target's armor stat
  targetMagicResistance: number; // target's magic resistance stat
}

export interface AttackResult {
  hit: boolean;
  dodged: boolean;
  crit: boolean;
  weaponRoll: number;         // random roll within weapon min/max
  rawDamage: number;          // weaponRoll + damageBonus (doubled on crit)
  damageReduction: number;    // amount subtracted by DR
  finalDamage: number;        // actual damage dealt (min 1 on hit)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function roll100(): number {
  return rand(1, 100);
}

// ─── Damage Reduction ─────────────────────────────────────────────────────────

/** Calculate damage after DR. Used by both attack resolution and DoT ticks. */
export function applyDR(
  rawDamage: number,
  damageElement: DamageElement,
  targetArmor: number,
  targetMagicResistance: number,
): number {
  let effectiveDefense: number;
  if (PHYSICAL_ELEMENTS.has(damageElement)) {
    effectiveDefense = targetArmor;
  } else {
    effectiveDefense = targetArmor * 0.5 + targetMagicResistance;
  }
  const drPercent = (effectiveDefense / (effectiveDefense + DR_DIVISOR)) * DR_CAP;
  const damageReduction = Math.floor(rawDamage * drPercent);
  return Math.max(1, rawDamage - damageReduction);
}

// ─── Resolve ─────────────────────────────────────────────────────────────────

export function resolveAttack(params: AttackParams): AttackResult {
  const {
    hitBonus, damageBonus, critChance,
    minDamage, maxDamage, damageElement,
    targetDodge, targetArmor, targetMagicResistance,
  } = params;

  const miss = { hit: false, dodged: false, crit: false, weaponRoll: 0, rawDamage: 0, damageReduction: 0, finalDamage: 0 };

  // 1. Hit check — base 75% + attacker's hitBonus%
  const hitChance = BASE_HIT_CHANCE + hitBonus;
  if (roll100() > hitChance) return miss;

  // 2. Dodge check — target's dodge value is their dodge %
  if (roll100() <= targetDodge) {
    return { ...miss, hit: true, dodged: true };
  }

  // 3. Crit check — attacker's crit value is their crit %
  const crit = roll100() <= critChance;

  // 4. Damage roll
  const weaponRoll = rand(minDamage, maxDamage);
  let rawDamage = weaponRoll + damageBonus;
  if (crit) rawDamage *= 2;

  // 5. Damage reduction
  const finalDamage = applyDR(rawDamage, damageElement, targetArmor, targetMagicResistance);
  const damageReduction = rawDamage - finalDamage;

  return { hit: true, dodged: false, crit, weaponRoll, rawDamage, damageReduction, finalDamage };
}
