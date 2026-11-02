// The enchanter's services (an NPC with the 'enchanting' service, data/world/npcs.ts), on one item from the party's
// inventory placed on her bench, paid in gold and affix shards (shards.ts):
// - Enchant: upgrade an affix a tier (one shard of its stat) or add a new one at tier 1 (one shard of the new stat).
//   The item keeps its affix groups (AFFIX_SLOTS_PER_GROUP of each: the bench's four rows) and the sum of its tiers
//   stays within the party level's cap (tierSumCap). A new affix is never one the item's type can't roll, or a stat
//   it already has.
// - Disenchant: extract the chosen affixes as shards (one each); the item is destroyed. The price climbs steeply with
//   each extra affix.
// - Shatter: a random number of its affixes (at least one) come back as shards; the item is destroyed. Cheap.
// - Sell shards: each sells for SHARD_PRICE, and can be bought back for the same.
// Adding or removing affixes changes an item's rarity (its affix count: RarityPerAffixCount), and its value with it.
// Tune the prices here.
import type { Affix, Item } from './types';
import { itemAffixRules } from '.';
import { AFFIX_GROUP, AFFIX_ROLLS, AFFIX_SLOTS_PER_GROUP, MAX_TIER, RarityPerAffixCount, itemTierSum, rollAffixValue, tierRange, tierSumCap, type AffixGroup, type AffixStat } from './affixes';
import { RARITY_VALUE } from './value';
import { SHARDS, addShards, shardCount, shardName, type ShardCounts } from './shards';
import { formatSigned } from '../detailStrings';
import { statSuffix } from '../units/stats';
import { randInt, shuffle } from '../random';

// ─── Prices ───────────────────────────────────────────────────────────────────

/** Shattering an item, whatever it holds. */
export const SHATTER_COST = 25;
/** Disenchanting: by how many affixes are extracted (index = count − 1). */
export const DISENCHANT_COST: readonly number[] = [100, 300, 900, 2700];
/** Adding an affix to an item that has `count` already: 50 for its first, 100 for a second, and so on. */
export const addAffixCost = (count: number) => 50 * (count + 1);
/** Upgrading an affix to `tier`: 30 × tier² (120 for tier 2 ... 750 for tier 5). */
export const upgradeCost = (tier: number) => 30 * tier ** 2;
/** What a shard sells for, and costs to buy back. */
export const SHARD_PRICE = 20;

// ─── The bench ────────────────────────────────────────────────────────────────

/** The bench's affix rows, top to bottom: each row's group (AFFIX_SLOTS_PER_GROUP of each). */
export const BENCH_ROWS: readonly AffixGroup[] = [1, 1, 2, 2];

/** An affix's group (the stat of an affix is always an affix stat). */
export const affixGroup = (affix: Affix): AffixGroup => AFFIX_GROUP[affix.stat as AffixStat];

/** The item's affixes by bench row (BENCH_ROWS): each row's index in item.affixes, or null for an empty slot. */
export function benchRows(item: Item): (number | null)[] {
  const byGroup = (g: AffixGroup) => item.affixes.map((a, i) => (affixGroup(a) === g ? i : -1)).filter((i) => i >= 0).slice(0, AFFIX_SLOTS_PER_GROUP);
  const rows = { 1: byGroup(1), 2: byGroup(2) };
  const next = { 1: 0, 2: 0 };
  return BENCH_ROWS.map((g) => rows[g][next[g]++] ?? null);
}

/** A stat's value as the bench shows it: '+3', '+2%'. */
export const affixValueText = (stat: string, value: number) => `${formatSigned(value)}${statSuffix(stat)}`;

/** What a tier of a stat rolls on this item, as the bench shows it: '+4–6', '+3%' (one value). */
export function tierValueText(item: Item, stat: AffixStat, tier: number): string {
  const [lo, hi] = tierRange(AFFIX_ROLLS[stat], tier, itemAffixRules(item).kind);
  return lo === hi ? affixValueText(stat, lo) : `${formatSigned(lo)}–${hi}${statSuffix(stat)}`;
}

/** What the party brings to the bench: its level (the tier cap), shards and gold. */
export interface BenchParty {
  partyLevel: number;
  shards: ShardCounts;
  gold: number;
}

/** Why an action can't be done: a short label for its button, and the full reason for the status line. */
export interface Blocked {
  short: 'Max tier' | 'Tier cap' | 'No shard' | 'Need gold';
  long: string;
}

const tierCapReason = (party: BenchParty): Blocked =>
  ({ short: 'Tier cap', long: `Tier total is at its limit (${tierSumCap(party.partyLevel)}) for party level ${party.partyLevel}.` });

/** Whether the item's tiers can go up by one more within the party's cap. */
const underTierCap = (item: Item, party: BenchParty) => itemTierSum(item.affixes) + 1 <= tierSumCap(party.partyLevel);

/** Why the affix at `idx` can't be upgraded a tier, if it can't (checked in this order); null if it can. */
export function upgradeBlocked(item: Item, idx: number, party: BenchParty): Blocked | null {
  const affix = item.affixes[idx];
  const tier = affix.tier ?? 1, name = shardName(affix.stat as AffixStat);
  if (tier >= MAX_TIER) return { short: 'Max tier', long: `${name} is already at tier ${MAX_TIER}.` };
  if (!underTierCap(item, party)) return tierCapReason(party);
  if (shardCount(party.shards, affix.stat as AffixStat) <= 0) return { short: 'No shard', long: `You need a ${name} shard to upgrade this.` };
  if (party.gold < upgradeCost(tier + 1)) return { short: 'Need gold', long: `Not enough gold to upgrade ${name}.` };
  return null;
}

/**
 * The shards that can be added to the item in a slot of `group`, in shard list order: carried, of that group, not
 * already on the item, one its type can roll, and not above its level (an affix's minLevel).
 */
export function addableShards(item: Item, group: AffixGroup, shards: ShardCounts): AffixStat[] {
  const { invalid } = itemAffixRules(item);
  const has = new Set(item.affixes.map((a) => a.stat));
  return SHARDS.map((s) => s.stat).filter((s) => shardCount(shards, s) > 0 && AFFIX_GROUP[s] === group && !has.has(s)
    && !invalid.has(s) && item.level >= (AFFIX_ROLLS[s].minLevel ?? 1));
}

/** Why an affix can't be added in a slot of `group`, if it can't (checked in this order); null if it can. */
export function addBlocked(item: Item, group: AffixGroup, party: BenchParty): Blocked | null {
  if (!underTierCap(item, party)) return tierCapReason(party);
  if (addableShards(item, group, party.shards).length === 0) return { short: 'No shard', long: 'You carry no shard that fits this slot.' };
  if (party.gold < addAffixCost(item.affixes.length)) return { short: 'Need gold', long: 'Not enough gold to add an affix.' };
  return null;
}

// ─── Changing an item ─────────────────────────────────────────────────────────

/** The item with new affixes: its rarity follows their count, and its value its rarity. */
function withAffixes(item: Item, affixes: Affix[]): Item {
  const rarity = RarityPerAffixCount[affixes.length];
  return { ...item, affixes, rarity, value: Math.round(item.value * RARITY_VALUE[rarity] / RARITY_VALUE[item.rarity]) };
}

/** The item with the affix at `idx` a tier higher, its value rolled anew in that tier's range. */
export function upgradeAffix(item: Item, idx: number): Item {
  const { kind } = itemAffixRules(item);
  return withAffixes(item, item.affixes.map((a, i) => {
    if (i !== idx) return a;
    const tier = (a.tier ?? 1) + 1;
    return { ...a, tier, value: rollAffixValue(a.stat as AffixStat, tier, kind) };
  }));
}

/** The item with a new affix of `stat` at tier 1. */
export function addAffix(item: Item, stat: AffixStat): Item {
  return withAffixes(item, [...item.affixes, { stat, tier: 1, value: rollAffixValue(stat, 1, itemAffixRules(item).kind) }]);
}

/** One shard for each of the affixes (item.affixes indexes). */
export const shardsOf = (item: Item, idxs: readonly number[]): ShardCounts =>
  idxs.reduce<ShardCounts>((out, i) => addShards(out, item.affixes[i].stat as AffixStat), {});

/** The affixes a shattering returns (item.affixes indexes): a random number of them, at least one. */
export const shatterPick = (item: Item): number[] =>
  shuffle(item.affixes.map((_, i) => i)).slice(0, randInt(1, item.affixes.length));
