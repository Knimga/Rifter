import { PHYSICAL_ELEMENTS, type DamageElement } from './gear';

// ─── Tuning Constants ────────────────────────────────────────────────────────

const BASE_HIT_CHANCE = 75;           // base % chance any attack lands
const DR_DIVISOR = 50;                // higher value = slower scaling of DR
const DR_CAP = 0.75;                  // lower value = more threatening endgame damage

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AttackParams {
  hit: number;                // attacker's hit% for this attackCategory (melee/ranged/magic)
  damageBonus: number;        // attacker's category damage bonus (melee/ranged/magic rules — see callers)
  critChance: number;         // attacker's crit% for this attackCategory
  minDamage: number;          // weapon / ability min damage
  maxDamage: number;          // weapon / ability max damage
  damageElement: DamageElement; // determines which defense stat applies
  targetDodge: number;        // target's dodge stat (dodge of 5 = 5%)
  targetArmor: number;        // target's armor stat
  targetMagicResistance: number; // target's magic resistance stat
  targetParry?: number;             // target's parry% — negates the attack entirely (default 0)
  targetBlock?: number;             // target's block% — negates the attack entirely (default 0)
  targetGlancingBlow?: number;      // target's glancing blow% — reduces hit damage by 30% (default 0)
  // Element-specific bonuses/resistances (all optional, default 0)
  elementHit?: number;              // attacker's extra hit% for this element (stacks with hit)
  elementCrit?: number;             // attacker's extra crit% for this element (stacks with critChance)
  elementDamage?: number;           // attacker's element-specific flat damage (stacks with damageBonus)
  targetElementResistance?: number; // target's % damage reduction for this element
  // Penetration (all optional, default 0)
  categoryPenetration?: number;     // reduces armor/MR DR% by this many % points
  elementPenetration?: number;      // reduces target element resistance by this many % points
}

export interface AttackResult {
  hit: boolean;
  dodged: boolean;
  parried: boolean;
  blocked: boolean;
  glancingBlow: boolean;      // hit landed but damage reduced by 30%
  crit: boolean;
  weaponRoll: number;         // random roll within weapon min/max
  rawDamage: number;          // weaponRoll + damageBonus (doubled on crit, reduced on glancing)
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
  targetElementResistance = 0,  // % reduction for this element, e.g. 25 = 25% less damage
  armorPenetration = 0,         // % points subtracted from armor DR (e.g. 5 reduces 15% DR to 10%)
  elementPenetration = 0,       // % points subtracted from element resistance
): number {
  let effectiveDefense: number;
  if (PHYSICAL_ELEMENTS.has(damageElement)) {
    effectiveDefense = targetArmor;
  } else {
    effectiveDefense = targetArmor * 0.5 + targetMagicResistance;
  }
  const baseDRPercent = (effectiveDefense / (effectiveDefense + DR_DIVISOR)) * DR_CAP;
  const drPercent = Math.max(0, baseDRPercent - armorPenetration / 100);
  const damageReduction = Math.floor(rawDamage * drPercent);
  const afterArmor = Math.max(1, rawDamage - damageReduction);
  const effectiveElementRes = Math.max(0, targetElementResistance - elementPenetration);
  if (effectiveElementRes === 0) return afterArmor;
  return Math.max(1, Math.round(afterArmor * (1 - effectiveElementRes / 100)));
}

// ─── Resolve ─────────────────────────────────────────────────────────────────

export function resolveAttack(params: AttackParams): AttackResult {
  const {
    hit, damageBonus, critChance,
    minDamage, maxDamage, damageElement,
    targetDodge, targetArmor, targetMagicResistance,
    targetParry = 0, targetBlock = 0, targetGlancingBlow = 0,
    elementHit = 0, elementCrit = 0, elementDamage = 0, targetElementResistance = 0,
    categoryPenetration = 0, elementPenetration = 0,
  } = params;

  const miss = { hit: false, dodged: false, parried: false, blocked: false, glancingBlow: false, crit: false, weaponRoll: 0, rawDamage: 0, damageReduction: 0, finalDamage: 0 };

  // 1. Hit check — base 75% + attacker's hit% + element hit bonus
  const hitChance = BASE_HIT_CHANCE + hit + elementHit;
  if (roll100() > hitChance) return miss;

  // 2. Dodge check — target's dodge value is their dodge %
  if (roll100() <= targetDodge) return { ...miss, hit: true, dodged: true };

  // 3. Parry check
  if (targetParry > 0 && roll100() <= targetParry) return { ...miss, hit: true, parried: true };

  // 4. Block check
  if (targetBlock > 0 && roll100() <= targetBlock) return { ...miss, hit: true, blocked: true };

  // 5. Glancing blow check — damage is dealt but reduced by 30%
  const isGlancing = targetGlancingBlow > 0 && roll100() <= targetGlancingBlow;

  // 6. Crit check — attacker's crit value is their crit % + element crit bonus
  const crit = roll100() <= (critChance + elementCrit);

  // 7. Damage roll
  const weaponRoll = rand(minDamage, maxDamage);
  let rawDamage = weaponRoll + damageBonus + elementDamage;
  if (crit) rawDamage *= 2;
  if (isGlancing) rawDamage = Math.floor(rawDamage * 0.7);

  // 8. Damage reduction (armor/MR) then element resistance
  const finalDamage = applyDR(rawDamage, damageElement, targetArmor, targetMagicResistance, targetElementResistance, categoryPenetration, elementPenetration);
  const damageReduction = rawDamage - finalDamage;

  return { hit: true, dodged: false, parried: false, blocked: false, glancingBlow: isGlancing, crit, weaponRoll, rawDamage, damageReduction, finalDamage };
}
