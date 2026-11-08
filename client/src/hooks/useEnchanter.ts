// The Sanctum enchanter's services (data/gear/enchanting.ts) on the party's items, gold and shards: enchanting an item
// (carried or worn: the one her bench points at, a BenchRef), disenchanting and shattering a carried one, and selling
// shards and buying them back. Every action says what happened (or why it couldn't), for the window's status line. The
// shards sold this session, most recent first, stay for buying back as long as the game runs.
import { useState, type Dispatch, type SetStateAction } from 'react';
import type { Item } from '../data/gear';
import type { AffixStat } from '../data/gear/affixes';
import { setSlot, type Inventory } from '../data/gear/inventory';
import type { PartyMemberConfig } from '../data/units/party';
import { shardCount, shardName, type ShardCounts } from '../data/gear/shards';
import {
  DISENCHANT_COST, SHARD_PRICE, SHATTER_COST, addAffix, addAffixCost, addBlocked, addableShards, affixGroup, benchItem, shardsOf,
  shatterPick, tierValueText, upgradeAffix, upgradeBlocked, upgradeCost, type BenchParty, type BenchRef,
} from '../data/gear/enchanting';
import { formatGold } from '../data/detailStrings';

/** What an action did: whether it went through, and what to say. A destroyed item's returned shards, in order. */
export interface EnchantResult {
  ok: boolean;
  message: string;
  returned?: { item: Item; stats: AffixStat[] };
}

/** A shard type sold this session, and how many of it are left to buy back. */
export interface SoldShard {
  stat: AffixStat;
  n: number;
}

const shardsWord = (n: number) => (n === 1 ? 'shard' : 'shards');

export function useEnchanter({ partyLevel, party: members, setParty, inventory, setInventory, gold, addGold, shards, addShard, gainShards, spendShard }: {
  partyLevel: number;
  /** The party members, whose worn gear can be enchanted too. */
  party: PartyMemberConfig[];
  setParty: (party: PartyMemberConfig[]) => void;
  inventory: Inventory;
  setInventory: Dispatch<SetStateAction<Inventory>>;
  gold: number;
  /** Add gold, or (negative) spend it. */
  addGold: (amount: number) => void;
  shards: ShardCounts;
  addShard: (stat: AffixStat, n?: number) => void;
  gainShards: (found: ShardCounts) => void;
  spendShard: (stat: AffixStat, n?: number) => void;
}) {
  const [sold, setSold] = useState<SoldShard[]>([]);
  const party: BenchParty = { partyLevel, shards, gold };
  const fail = (message: string): EnchantResult => ({ ok: false, message });
  const itemAt = (at: BenchRef) => benchItem(at, inventory, members);
  /** The item `at` the bench's pointer, changed in place (or, null, destroyed: a carried one only). */
  const put = (at: BenchRef, item: Item | null) => {
    if (at.kind === 'inventory') setInventory((inv) => setSlot(inv, at.idx, item));
    else setParty(members.map((m, i) => (i === at.member ? { ...m, gear: { ...m.gear, [at.slot]: item } } : m)));
  };

  /** Upgrade the affix at `idx` of the item `at` the bench a tier: a shard of its stat and the gold. */
  const upgrade = (at: BenchRef, idx: number): EnchantResult => {
    const item = itemAt(at);
    if (!item) return fail('Put an item on the bench first.');
    const why = upgradeBlocked(item, idx, party);
    if (why) return fail(why.long);
    const affix = item.affixes[idx], stat = affix.stat as AffixStat, tier = (affix.tier ?? 1) + 1, cost = upgradeCost(tier);
    put(at, upgradeAffix(item, idx));
    spendShard(stat);
    addGold(-cost);
    return { ok: true, message: `${shardName(stat)} raised to tier ${tier} (${tierValueText(item, stat, tier)}) for ${formatGold(cost)}.` };
  };

  /** Add an affix of `stat` to the item `at` the bench, at tier 1, in a slot of its group: a shard of it and the gold. */
  const add = (at: BenchRef, stat: AffixStat): EnchantResult => {
    const item = itemAt(at);
    if (!item) return fail('Put an item on the bench first.');
    const group = affixGroup({ stat, value: 0 });
    const why = addBlocked(item, group, party);
    if (why) return fail(why.long);
    if (!addableShards(item, group, shards).includes(stat)) return fail(`${shardName(stat)} can't be added to this item.`);
    const cost = addAffixCost(item.affixes.length);
    put(at, addAffix(item, stat));
    spendShard(stat);
    addGold(-cost);
    return { ok: true, message: `Added ${shardName(stat)} (${tierValueText(item, stat, 1)}) for ${formatGold(cost)}.` };
  };

  /** Destroy the item `at` the bench for the shards of the affixes at `idxs`, for `cost` (not a worn one). */
  const destroy = (at: BenchRef, idxs: number[], cost: number, verb: string): EnchantResult => {
    const item = itemAt(at);
    if (!item) return fail('Put an item on the bench first.');
    if (at.kind === 'gear') return fail(`Unequip ${item.name} in the party screen first.`);
    if (item.affixes.length === 0) return fail('This item has no affixes.');
    if (idxs.length === 0) return fail('Select at least one affix to extract.');
    if (gold < cost) return fail('Not enough gold.');
    put(at, null);
    gainShards(shardsOf(item, idxs));
    addGold(-cost);
    const stats = idxs.map((i) => item.affixes[i].stat as AffixStat);
    return { ok: true, message: `${verb} ${item.name} for ${formatGold(cost)}. Got ${stats.length} ${shardsWord(stats.length)}.`, returned: { item, stats } };
  };

  /** Disenchant: extract the affixes at `idxs` of the item `at` the bench as shards, destroying it. */
  const extract = (at: BenchRef, idxs: number[]) => destroy(at, idxs, DISENCHANT_COST[idxs.length - 1] ?? 0, 'Extracted');

  /** Shatter the item `at` the bench: a random number of its affixes as shards, destroying it. */
  const shatter = (at: BenchRef) => {
    const item = itemAt(at);
    return destroy(at, item?.affixes.length ? shatterPick(item) : [], SHATTER_COST, 'Shattered');
  };

  /** Sell one shard of `stat`, or (`all`) every one carried. */
  const sell = (stat: AffixStat, all = false): EnchantResult => {
    const n = all ? shardCount(shards, stat) : Math.min(1, shardCount(shards, stat));
    if (n === 0) return fail(`You carry no ${shardName(stat)} shard.`);
    spendShard(stat, n);
    addGold(n * SHARD_PRICE);
    setSold((list) => [{ stat, n: n + (list.find((s) => s.stat === stat)?.n ?? 0) }, ...list.filter((s) => s.stat !== stat)]);
    return { ok: true, message: `Sold ${n} ${shardName(stat)} ${shardsWord(n)} for ${formatGold(n * SHARD_PRICE)}.` };
  };

  /** Buy back one shard of `stat` sold this session. */
  const buyBack = (stat: AffixStat): EnchantResult => {
    if (!sold.some((s) => s.stat === stat)) return fail(`No ${shardName(stat)} shard to buy back.`);
    if (gold < SHARD_PRICE) return fail(`Not enough gold to buy back a ${shardName(stat)} shard.`);
    addShard(stat);
    addGold(-SHARD_PRICE);
    setSold((list) => list.map((s) => (s.stat === stat ? { ...s, n: s.n - 1 } : s)).filter((s) => s.n > 0));
    return { ok: true, message: `Bought back 1 ${shardName(stat)} shard for ${formatGold(SHARD_PRICE)}.` };
  };

  return { party, sold, upgrade, add, extract, shatter, sell, buyBack };
}
