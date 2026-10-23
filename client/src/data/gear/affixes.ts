// Everything about the extras an item rolls: its rarity (= how many affixes), which stats (AFFIX_ROLLS:
// weight, value range; affix groups) and rollAffixes, which puts it together. Tune values here.
import { ATTRIBUTE_KEYS, BUFFABLE_STATS, SKILL_KEYS, DAMAGE_ELEMENTS, type BuffableStat, type ElementStatKey } from '../units/stats';
import { pick, pickWeighted, randFloat } from '../random';
import type { Affix, Rarity } from './types';

/**
 * How an affix's value is rolled for an item of level L:
 *   low  = lv1[0] + perLevel[0] × (L − 1)
 *   high = lv1[1] + perLevel[1] × (L − 1)
 *   value = an integer from low to high, evenly likely (see rollAffixValue)
 * `weight`: how likely the stat is chosen among an item's possible affixes (1 = normal, 0.5 = half as often).
 * `minLevel`: the lowest item level it can roll on (default 1: any).
 */
export interface AffixRoll {
  lv1: [number, number];
  perLevel: [number, number];
  weight?: number;
  minLevel?: number;
}

// Growth shapes carried over from the old potency tiers (value = 1..level, divided by 1, 2 or 3, rounded
// up): the same ranges, now as table entries so each stat can be tuned on its own. (A top below the bottom
// at level 1 just means the roll is 1.)
const LOW: AffixRoll = { lv1: [1, 1], perLevel: [0, 1] };             // 1..L
const MEDIUM: AffixRoll = { lv1: [1, 1 / 2], perLevel: [0, 1 / 2] };  // 1..ceil(L/2)
const HIGH: AffixRoll = { lv1: [1, 1 / 3], perLevel: [0, 1 / 3] };    // 1..ceil(L/3)

/** Elemental affixes, the same for every element (e.g. fireResistance, shadowDamage). */
// Weights: damage and resistance are the common elemental affixes; hit, crit and penetration are rare
// (with 10 elements, elemental stats would otherwise make up over half of all rolls).
const ELEMENT_ROLLS: Record<'Hit' | 'Crit' | 'Damage' | 'Resistance' | 'Penetration', AffixRoll> = {
  Hit:         { lv1: [1, 3], perLevel: [0.1, 0.22], weight: 0.15 },   // %: 1-3 at L1, ~2-5 at L10
  Crit:        { lv1: [1, 3], perLevel: [0.1, 0.22], weight: 0.15 },   // %
  Damage:      { lv1: [1, 3], perLevel: [0.1, 0.33], weight: 0.75 },                 // flat: +1-3 at L1, ~+2-6 at L10
  // %: 4-8 rolled + a base 5 (no resistance affix below 9%): 9-13 at L1, ~13-18 at L10.
  // Half as likely as other affixes. Total resistance is capped (ELEMENT_RESISTANCE_CAP, stats.ts).
  Resistance:  { lv1: [9, 13], perLevel: [0.45, 0.6], weight: 0.5 },
  Penetration: { lv1: [1, 3], perLevel: [0.1, 0.22], weight: 0.15 },   // %
};

/**
 * Buffable stats that never roll on gear (only buffs, debuffs and class passives change them): +1 AP on an item
 * would be far too strong, and threat is a class's identity (a tank's draw, a rogue's subtlety), not loot's.
 */
export const NON_AFFIX_STATS = ['apMax', 'threatMultiplier'] as const satisfies readonly BuffableStat[];
/** A stat that can roll as an affix. */
export type AffixStat = Exclude<BuffableStat, typeof NON_AFFIX_STATS[number]>;
export const AFFIX_STATS = BUFFABLE_STATS.filter((s): s is AffixStat => !(NON_AFFIX_STATS as readonly BuffableStat[]).includes(s));

export const AFFIX_ROLLS: Record<AffixStat, AffixRoll> = {
  ...Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, { ...LOW, weight: 2 }])), // attributes: twice as common
  ...Object.fromEntries(SKILL_KEYS.map((k) => [k, LOW])),
  armor: LOW,
  dodge: LOW,
  parry: LOW,
  block: LOW,
  glancingBlow: LOW,
  magicResistance: LOW,
  initiative: LOW,
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
  hpRegen: { ...HIGH, minLevel: 5 }, // too strong this early
  mpRegen: HIGH,
  // Always exactly +1, from item level 5: a whole extra tile per move is already a lot
  movement: { lv1: [1, 1], perLevel: [0, 0], minLevel: 5 },
  ...Object.fromEntries(DAMAGE_ELEMENTS.flatMap((el) =>
    (Object.entries(ELEMENT_ROLLS) as [keyof typeof ELEMENT_ROLLS, AffixRoll][]).map(([suffix, roll]) => [`${el}${suffix}` as ElementStatKey, roll]))),
} as Record<AffixStat, AffixRoll>;

// ─── Affix groups ─────────────────────────────────────────────────────────────
// An item's affix slots come in two groups: at most AFFIX_SLOTS_PER_GROUP affixes from each, so a full
// (4-affix) item has 2 + 2 and stays balanced. Group 1 is mostly power (attributes, offense), group 2
// protection and utility. Not shown anywhere in the UI.

export type AffixGroup = 1 | 2;
export const AFFIX_SLOTS_PER_GROUP = 2;

const elementStats = (suffixes: string[]) => DAMAGE_ELEMENTS.flatMap((el) => suffixes.map((s) => `${el}${s}` as AffixStat));

const GROUP_STATS: Record<AffixGroup, AffixStat[]> = {
  1: [
    ...ATTRIBUTE_KEYS,
    'expertise', 'spellcraft',
    ...elementStats(['Damage', 'Hit', 'Crit', 'Penetration']),
    'meleeDamage', 'meleeHit', 'meleeCrit', 'meleePenetration',
    'rangedDamage', 'rangedHit', 'rangedCrit', 'rangedPenetration',
    'magicDamage', 'magicHit', 'magicCrit', 'magicPenetration',
  ],
  2: [
    ...elementStats(['Resistance']),
    'armor', 'dodge', 'parry', 'block', 'glancingBlow',
    'hpRegen', 'mpRegen', 'magicResistance', 'healing', 'initiative', 'movement',
    'redoubt', 'devotion', 'evasion', 'perception', 'stealth',
  ],
};

/** Each stat's affix group. Every affix stat is in exactly one (checked when this module loads). */
export const AFFIX_GROUP: Record<AffixStat, AffixGroup> = (() => {
  const out = {} as Record<AffixStat, AffixGroup>;
  for (const g of [1, 2] as const) {
    for (const s of GROUP_STATS[g]) {
      if (out[s]) throw new Error(`affix '${s}' is in both affix groups (affixes.ts GROUP_STATS)`);
      out[s] = g;
    }
  }
  const missing = AFFIX_STATS.filter((s) => !out[s]);
  if (missing.length) throw new Error(`affixes in no affix group (affixes.ts GROUP_STATS): ${missing.join(', ')}`);
  return out;
})();

/** Groups an item type can't fill: fewer than AFFIX_SLOTS_PER_GROUP stats left after its exclusions. */
export function starvedAffixGroups(invalidAffixes: BuffableStat[]): AffixGroup[] {
  const invalid = new Set(invalidAffixes);
  return ([1, 2] as const).filter((g) => GROUP_STATS[g].filter((s) => !invalid.has(s)).length < AFFIX_SLOTS_PER_GROUP);
}

/** Roll an affix's value for an item of `level` (see AffixRoll). Always at least 1. */
export function rollAffixValue(stat: AffixStat, level: number): number {
  const { lv1, perLevel } = AFFIX_ROLLS[stat];
  const low = lv1[0] + perLevel[0] * (level - 1), high = lv1[1] + perLevel[1] * (level - 1);
  return Math.max(1, Math.floor(randFloat(low, high + 1)));
}

// ─── Rarity ───────────────────────────────────────────────────────────────────

/** A rarity is its number of affixes: Common has none, Exquisite 4. */
export const RarityPerAffixCount: Record<number, Rarity> = {
  0: 'Common',
  1: 'Quality',
  2: 'Superior',
  3: 'Rare',
  4: 'Exquisite'
}

/**
 * How likely each rarity is for a rolled item (relative weights) at item level 1. Higher levels tilt
 * toward the rarer end: see RARITY_TILT_PER_LEVEL and rarityWeights (below).
 */
export const RARITY_WEIGHT: Record<Rarity, number> = {
  Common: 45,
  Quality: 30,
  Superior: 15,
  Rare: 5,
  Exquisite: 5,
};

/**
 * Per item level above 1, each rarity's weight grows by this × its affix count (Common 0 ... Exquisite 4),
 * so the odds slowly shift from Common toward the rarer end. 0.04 → Common ~34% at level 10, ~26% at 20.
 */
export const RARITY_TILT_PER_LEVEL = 0.04;

/** Each rarity's chance weight for an item of `level` (RARITY_WEIGHT, tilted toward rarer by RARITY_TILT_PER_LEVEL). */
export function rarityWeights(level: number): Record<Rarity, number> {
  const tilt = RARITY_TILT_PER_LEVEL * Math.max(0, level - 1);
  return Object.fromEntries(
    Object.entries(RarityPerAffixCount).map(([count, rarity]) => [rarity, RARITY_WEIGHT[rarity] * (1 + tilt * Number(count))]),
  ) as Record<Rarity, number>;
}

// ─── Rolling an item's affixes ────────────────────────────────────────────────

/**
 * An item's rarity and affixes: the rarity is rolled first (rarityWeights), and the item gets that many
 * affixes (RarityPerAffixCount), never one of `invalidAffixes` (its type's). Disabled (starting gear) =
 * Common, no affixes. `weights`: the rarity odds to use instead of the item level's (e.g. a chest's).
 */
export function rollAffixes(invalidAffixes: BuffableStat[], level: number, enabled: boolean, weights: Record<Rarity, number> = rarityWeights(level)): { affixes: Affix[]; rarity: Rarity } {
  const affixes: Affix[] = [];
  if (enabled) {
    const rarity = pickWeighted(Object.keys(weights) as Rarity[], r => weights[r]);
    const count = Number(Object.keys(RarityPerAffixCount).find(c => RarityPerAffixCount[Number(c)] === rarity));
    const invalid = new Set(invalidAffixes);
    const used = new Set<BuffableStat>();
    const filled: Record<AffixGroup, number> = { 1: 0, 2: 0 };
    while (affixes.length < count) {
      // Each affix: first a group that still has room (equally likely), then a stat within it by weight. So
      // items stay balanced at every rarity, and a full item is 2 + 2.
      const available = (g: AffixGroup) => AFFIX_STATS.filter(s =>
        AFFIX_GROUP[s] === g && !invalid.has(s) && !used.has(s) && level >= (AFFIX_ROLLS[s].minLevel ?? 1));
      const open = ([1, 2] as const).filter(g => filled[g] < AFFIX_SLOTS_PER_GROUP && available(g).length > 0);
      if (open.length === 0) break;
      const group = pick(open);
      const stat = pickWeighted(available(group), s => AFFIX_ROLLS[s].weight ?? 1);
      used.add(stat);
      filled[group]++;
      affixes.push({ stat, value: rollAffixValue(stat, level) });
    }
  }
  return { affixes, rarity: RarityPerAffixCount[affixes.length] };
}
