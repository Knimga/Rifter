// How each random gear affix rolls: one entry per stat (AFFIX_ROLLS). Tune values here.
import { ATTRIBUTE_KEYS, SKILL_KEYS, DAMAGE_ELEMENTS, type BuffableStat, type ElementStatKey } from '../stats';

/**
 * How an affix's value is rolled for an item of level L:
 *   low  = lv1[0] + perLevel[0] × (L − 1)
 *   high = lv1[1] + perLevel[1] × (L − 1)
 *   value = an integer from low to high, evenly likely (see rollAffixValue)
 * `weight`: how likely the stat is chosen among an item's possible affixes (1 = normal, 0.5 = half as often).
 */
export interface AffixRoll {
  lv1: [number, number];
  perLevel: [number, number];
  weight?: number;
}

// Growth shapes carried over from the old potency tiers (value = 1..level, divided by 1, 2 or 3, rounded
// up): the same ranges, now as table entries so each stat can be tuned on its own. (A top below the bottom
// at level 1 just means the roll is 1.)
const LOW: AffixRoll = { lv1: [1, 1], perLevel: [0, 1] };             // 1..L
const MEDIUM: AffixRoll = { lv1: [1, 1 / 2], perLevel: [0, 1 / 2] };  // 1..ceil(L/2)
const HIGH: AffixRoll = { lv1: [1, 1 / 3], perLevel: [0, 1 / 3] };    // 1..ceil(L/3)

/** Elemental affixes, the same for every element (e.g. fireResistance, shadowDamage). */
const ELEMENT_ROLLS: Record<'Hit' | 'Crit' | 'Damage' | 'Resistance' | 'Penetration', AffixRoll> = {
  Hit:         { lv1: [1, 3], perLevel: [0.1, 0.22] },                 // %: 1-3 at L1, ~2-5 at L10
  Crit:        { lv1: [1, 3], perLevel: [0.1, 0.22] },                 // %
  Damage:      { lv1: [1, 3], perLevel: [0.1, 0.33] },                 // flat: +1-3 at L1, ~+2-6 at L10
  // %: 4-8 rolled + a base 5 (no resistance affix below 9%): 9-13 at L1, ~13-18 at L10.
  // Half as likely as other affixes. Total resistance is capped (ELEMENT_RESISTANCE_CAP, stats.ts).
  Resistance:  { lv1: [9, 13], perLevel: [0.45, 0.6], weight: 0.5 },
  Penetration: { lv1: [1, 3], perLevel: [0.1, 0.22] },                 // %
};

export const AFFIX_ROLLS: Record<BuffableStat, AffixRoll> = {
  ...Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, LOW])),
  ...Object.fromEntries(SKILL_KEYS.map((k) => [k, LOW])),
  armor: LOW,
  dodge: LOW,
  parry: LOW,
  block: LOW,
  glancingBlow: LOW,
  magicResistance: LOW,
  initiative: LOW,
  threatMultiplier: LOW,
  meleeDamage: LOW,
  rangedDamage: LOW,
  magicDamage: LOW,
  healing: MEDIUM,
  meleeHit: MEDIUM,
  meleeCrit: MEDIUM,
  meleePenetration: MEDIUM,
  rangedHit: MEDIUM,
  rangedCrit: MEDIUM,
  rangedPenetration: MEDIUM,
  magicHit: MEDIUM,
  magicCrit: MEDIUM,
  magicPenetration: MEDIUM,
  hpRegen: HIGH,
  mpRegen: HIGH,
  movement: HIGH,
  ...Object.fromEntries(DAMAGE_ELEMENTS.flatMap((el) =>
    (Object.entries(ELEMENT_ROLLS) as [keyof typeof ELEMENT_ROLLS, AffixRoll][]).map(([suffix, roll]) => [`${el}${suffix}` as ElementStatKey, roll]))),
} as Record<BuffableStat, AffixRoll>;

/** Roll an affix's value for an item of `level` (see AffixRoll). Always at least 1. */
export function rollAffixValue(stat: BuffableStat, level: number): number {
  const { lv1, perLevel } = AFFIX_ROLLS[stat];
  const low = lv1[0] + perLevel[0] * (level - 1), high = lv1[1] + perLevel[1] * (level - 1);
  return Math.max(1, Math.floor(low + Math.random() * (high + 1 - low)));
}
