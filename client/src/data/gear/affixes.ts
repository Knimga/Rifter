// Everything about the extras an item rolls: its rarity (= how many affixes), which stats (AFFIX_ROLLS:
// weight, value range; affix groups) and rollAffixes, which puts it together. Tune values here.
import { ATTRIBUTE_KEYS, BUFFABLE_STATS, SKILL_KEYS, DAMAGE_ELEMENTS, type BuffableStat, type ElementStatKey } from '../units/stats';
import { pick, pickWeighted, randInt } from '../random';
import type { Affix, Rarity } from './types';

// ─── Tiers ────────────────────────────────────────────────────────────────────
// Every affix has a tier (1..MAX_TIER), rolled first from the party level (rollTier), and its value is
// rolled within that tier's range. The tier is saved on the affix, for crafting: upgrading a tier, with the
// sum of an item's tiers held to tierSumCap (only checked when crafting; a drop may be over it).

/** The highest tier. More can be added if tier 5 falls short at the top levels: the ranges extend by themselves. */
export const MAX_TIER = 5;

/**
 * How an affix's value is rolled. Tier t spans `tierSize` values from `min` up, tier after tier:
 *   tier t = min + (t − 1) × tierSize  ..  min + t × tierSize − 1     (e.g. min 1, tierSize 3: 1-3, 4-6, 7-9...)
 * (on armor; a weapon or offhand scales the range: ITEM_KIND_VALUE_SCALE).
 * `weight`: how likely the stat is chosen among an item's possible affixes (1 = normal, 0.5 = half as often).
 * `minLevel`: the lowest item level it can roll on (default 1: any).
 */
export interface AffixRoll {
  min: number;
  tierSize: number;
  weight?: number;
  minLevel?: number;
}

/**
 * What kind of item an affix is on, which scales its values (ITEM_KIND_VALUE_SCALE): armor, a one-handed
 * weapon or an offhand (shield, quiver), or a two-handed weapon.
 */
export type AffixItemKind = 'armor' | 'oneHand' | 'twoHand';

/**
 * How each kind of item scales its affixes' tier ranges: armor as the tables say, a one-handed weapon or an
 * offhand a little less (the two together fill both hands), a two-handed weapon a little more (it is both).
 */
export const ITEM_KIND_VALUE_SCALE: Record<AffixItemKind, number> = { oneHand: 0.8, armor: 1, twoHand: 1.25 };

/**
 * Tier `tier`'s value range for an affix on a `kind` of item: [lowest, highest]. Scaled, a tier starts at its
 * scaled (rounded) start and ends just below where the next tier's scaled start is, so the tiers stay
 * back to back with no overlap or gap (never below 1; a tier is at least one value).
 */
export function tierRange(roll: AffixRoll, tier: number, kind: AffixItemKind = 'armor'): [number, number] {
  const scale = ITEM_KIND_VALUE_SCALE[kind];
  const start = (t: number) => Math.max(1, Math.round((roll.min + (t - 1) * roll.tierSize) * scale));
  const lo = start(tier);
  return [lo, Math.max(lo, start(tier + 1) - 1)];
}

/**
 * The tier the party's level centers on: 1 at level 1, one tier higher every TIER_LEVELS levels, up to
 * MAX_TIER (level 21 and up). Tier odds cluster around it (tierWeights), and the tier sum cap follows it.
 */
const TIER_LEVELS = 5;
export const expectedTier = (partyLevel: number) => Math.min(MAX_TIER, 1 + Math.max(0, partyLevel - 1) / TIER_LEVELS);

/** The party level each tier can first roll at (index = tier − 1): tier 1 from the start, then every 5 levels. */
export const TIER_UNLOCK_LEVELS: readonly number[] = [1, 5, 10, 15, 20];
/** How widely tier odds spread around the expected tier (a bell curve's width, in tiers). */
const TIER_SPREAD = 0.8;

/**
 * Each tier's chance weight (index = tier − 1) at `partyLevel`: a bell curve around the expected tier, over
 * the tiers unlocked so far. So a level-1 party rolls only tier 1; later, mostly the tier around its level,
 * sometimes one either side.
 */
export function tierWeights(partyLevel: number): number[] {
  const center = expectedTier(partyLevel);
  return Array.from({ length: MAX_TIER }, (_, i) =>
    partyLevel >= (TIER_UNLOCK_LEVELS[i] ?? Infinity) ? Math.exp(-((i + 1 - center) ** 2) / (2 * TIER_SPREAD ** 2)) : 0);
}

/** Roll an affix tier for a party of `partyLevel` (tierWeights). */
export function rollTier(partyLevel: number): number {
  const weights = tierWeights(partyLevel);
  return pickWeighted(weights.map((_, i) => i + 1), (t) => weights[t - 1]);
}

/** The most affixes an item can have (Exquisite): a slot per group (AFFIX_SLOTS_PER_GROUP × 2 groups). */
const MAX_AFFIXES = 4;
const TIER_SUM_HEADROOM = 2;
/**
 * The most an item's affix tiers may add up to for a party of `partyLevel`, when crafting (upgrading a tier):
 * a full item's worth (MAX_AFFIXES affixes) at the expected tier, plus TIER_SUM_HEADROOM. Not checked on
 * drops: a drop can be over it, it just can't be upgraded until the party's level catches up.
 */
export const tierSumCap = (partyLevel: number) =>
  Math.min(MAX_AFFIXES * MAX_TIER, Math.floor(MAX_AFFIXES * expectedTier(partyLevel)) + TIER_SUM_HEADROOM);

/** The sum of an item's affix tiers (what tierSumCap limits). */
export const itemTierSum = (affixes: readonly Affix[]) => affixes.reduce((sum, a) => sum + (a.tier ?? 0), 0);

// ─── Affix value tables ───────────────────────────────────────────────────────
// Groups of affixes that roll alike (ranges below as on armor). Tier 1 is what a level-1 party sees.

const ATTRIBUTE: AffixRoll = { min: 1, tierSize: 3, weight: 2 };   // 1-3, 4-6 ... 13-15; twice as common
const SKILL: AffixRoll = { min: 1, tierSize: 3 };                  // 1-3 ... 13-15
const ARMOR: AffixRoll = { min: 2, tierSize: 4 };                  // 2-5, 6-9 ... 18-21
const MAGIC_RESISTANCE: AffixRoll = { min: 1, tierSize: 3 };       // 1-3 ... 13-15
const AVOIDANCE: AffixRoll = { min: 1, tierSize: 2 };              // %: 1-2 ... 9-10 (dodge, parry, block, glancing)
const INITIATIVE: AffixRoll = { min: 1, tierSize: 2, weight: 0.75 };             // 1-2 ... 9-10
const CATEGORY_DAMAGE: AffixRoll = { min: 1, tierSize: 2 };        // 1-2 ... 9-10 (melee / ranged / magic damage)
const CATEGORY_OFFENSE: AffixRoll = { min: 1, tierSize: 2 };       // %: 1-2 ... 9-10 (their hit, crit, penetration)
const HEALING: AffixRoll = { min: 1, tierSize: 2 };                // 1-2 ... 9-10
const HEALING_RECEIVED: AffixRoll = { min: 1, tierSize: 1, weight: 0.75 }; // 1 ... 5: on every heal and HoT tick the wearer gets
const HP_REGEN: AffixRoll = { min: 1, tierSize: 1, minLevel: 5, weight: 0.75 };  // 1 ... 5; too strong this early
const MP_REGEN: AffixRoll = { min: 1, tierSize: 1, weight: 0.75 };               // 1 ... 5

/** Elemental affixes, the same for every element (e.g. fireResistance, shadowDamage). */
// Weights: damage and resistance are the common elemental affixes; hit, crit and penetration are rarer
// (with 8 elements, elemental stats would otherwise make up over half of all rolls).
const ELEMENT_ROLLS: Record<'Hit' | 'Crit' | 'Damage' | 'Resistance' | 'Penetration', AffixRoll> = {
  Hit:         { min: 1, tierSize: 2, weight: 0.3 },   // %: 1-2 ... 9-10
  Crit:        { min: 1, tierSize: 2, weight: 0.3 },   // %
  Damage:      { min: 1, tierSize: 3, weight: 0.75 },  // flat: 1-3 ... 13-15
  // %: 9-12 ... 25-28 (no resistance affix below 9%). Half as likely as other affixes. Total resistance is
  // capped (ELEMENT_RESISTANCE_CAP, stats.ts).
  Resistance:  { min: 9, tierSize: 4, weight: 0.5 },
  Penetration: { min: 1, tierSize: 2, weight: 0.15 },  // %
};

/**
 * Buffable stats that never roll on gear (only buffs, debuffs and class passives change them): +1 AP on an
 * item would be far too strong, threat is a class's identity (a tank's draw, a rogue's subtlety), not loot's,
 * and a whole extra tile per move is the same.
 */
export const NON_AFFIX_STATS = ['apMax', 'threatMultiplier', 'movement'] as const satisfies readonly BuffableStat[];
/** A stat that can roll as an affix. */
export type AffixStat = Exclude<BuffableStat, typeof NON_AFFIX_STATS[number]>;
export const AFFIX_STATS = BUFFABLE_STATS.filter((s): s is AffixStat => !(NON_AFFIX_STATS as readonly BuffableStat[]).includes(s));

export const AFFIX_ROLLS: Record<AffixStat, AffixRoll> = {
  ...Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, ATTRIBUTE])),
  ...Object.fromEntries(SKILL_KEYS.map((k) => [k, SKILL])),
  armor: ARMOR,
  magicResistance: MAGIC_RESISTANCE,
  dodge: AVOIDANCE,
  parry: AVOIDANCE,
  block: AVOIDANCE,
  glancingBlow: AVOIDANCE,
  initiative: INITIATIVE,
  meleeDamage: CATEGORY_DAMAGE,
  rangedDamage: CATEGORY_DAMAGE,
  magicDamage: CATEGORY_DAMAGE,
  meleeHit: CATEGORY_OFFENSE,
  meleeCrit: CATEGORY_OFFENSE,
  meleePenetration: CATEGORY_OFFENSE,
  rangedHit: CATEGORY_OFFENSE,
  rangedCrit: CATEGORY_OFFENSE,
  rangedPenetration: CATEGORY_OFFENSE,
  magicHit: CATEGORY_OFFENSE,
  magicCrit: CATEGORY_OFFENSE,
  magicPenetration: CATEGORY_OFFENSE,
  healing: HEALING,
  healingReceived: HEALING_RECEIVED,
  hpRegen: HP_REGEN,
  mpRegen: MP_REGEN,
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
    'hpRegen', 'mpRegen', 'magicResistance', 'healing', 'healingReceived', 'initiative',
    'redoubt', 'devotion', 'evasion', 'perception', 'subtlety',
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

/** Roll an affix's value within tier `tier`'s range on a `kind` of item (tierRange), every value in it equally likely. */
export function rollAffixValue(stat: AffixStat, tier: number, kind: AffixItemKind = 'armor'): number {
  const [low, high] = tierRange(AFFIX_ROLLS[stat], tier, kind);
  return randInt(low, high);
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
 * An item's rarity and affixes: the rarity is rolled first (rarityWeights, by item `level`), and the item gets
 * that many affixes (RarityPerAffixCount), never one of `invalidAffixes` (its type's). Each affix's tier is
 * rolled from the party's level (rollTier), then its value within the tier, scaled for the `kind` of item
 * (ITEM_KIND_VALUE_SCALE).
 * - `enabled` false (starting gear): Common, no affixes
 * - `rarityWeights`: the rarity odds to use instead of the item level's (e.g. a chest's)
 * - `partyLevel`: the party's level, for the tiers (default: the item's level)
 */
export function rollAffixes(
  invalidAffixes: BuffableStat[], level: number,
  { enabled = true, rarityWeights: weights = rarityWeights(level), partyLevel = level, kind }: {
    enabled?: boolean; rarityWeights?: Record<Rarity, number>; partyLevel?: number; kind: AffixItemKind;
  },
): { affixes: Affix[]; rarity: Rarity } {
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
      const tier = rollTier(partyLevel);
      affixes.push({ stat, value: rollAffixValue(stat, tier, kind), tier });
    }
  }
  return { affixes, rarity: RarityPerAffixCount[affixes.length] };
}
