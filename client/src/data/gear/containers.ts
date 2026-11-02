// What containers on the map (treasure chests, a dead adventurer) hold: how many items, how likely each rarity is,
// gold and affix shards. Where each stands: its zone's config (ZoneConfig.containers, data/world/dungeonGen.ts). Keyed
// by the container's interactive object (INTERACTIVE_OBJECTS id, data/world/interactiveObjects.ts). Tune values here.
import type { Item, Rarity } from './types';
import { generateLootItem } from '.';
import { randInt } from '../random';
import { rollGold } from './loot';
import { rollShardDrop, totalShards, type ShardCounts } from './shards';

/** Slots in a container's window (CONTAINER_COLS wide): the most items a container can hold. */
export const CONTAINER_COLS = 4;
export const CONTAINER_ROWS = 3;
export const CONTAINER_SIZE = CONTAINER_COLS * CONTAINER_ROWS;

export interface ContainerLoot {
  /** How many items it holds: an even pick from min to max (at most CONTAINER_SIZE). */
  items: [min: number, max: number];
  /** Relative chance of each rarity per item (0 = never). */
  rarityWeights: Record<Rarity, number>;
  /**
   * Gold in it, read like an enemy's: rolls of 5-10 x its level (data/gear/loot.ts rollGold), the whole part
   * guaranteed, the fraction the chance of one more, summed. None if absent. Gold takes a slot of its own.
   */
  dropsGold?: number;
  /** Percent more gold in it (50: half as much again). */
  goldBonus?: number;
  /**
   * The chance (0..1) that it holds affix shards: a group of them, like an enemy's drop (shards.ts rollShardDrop).
   * None if absent. Shards take a slot of their own.
   */
  shardChance?: number;
}

export const CONTAINER_LOOT: Record<string, ContainerLoot> = {
  'worn-treasure-chest': {
    items: [3, 5],
    // Every rarity, most of it Quality and Superior: 1 in 10 items Common, 1 in 10 Exquisite
    rarityWeights: { Common: 10, Quality: 30, Superior: 30, Rare: 20, Exquisite: 10 },
    dropsGold: 2
  },
  'solid-treasure-chest': {
    items: [4, 6],
    // Skewed well toward the rare end: never Common, about 1 in 7 items Quality, 1 in 7 Exquisite
    rarityWeights: { Common: 0, Quality: 15, Superior: 35, Rare: 35, Exquisite: 15 },
    dropsGold: 2,
    goldBonus: 50
  },
  'dead-adventurer': {
    items: [2, 4],
    rarityWeights: { Common: 20, Quality: 30, Superior: 30, Rare: 15, Exquisite: 5 },
    dropsGold: 1
  }
};

/**
 * What a container holds: its items, its gold (0: none) and its affix shards (empty: none). Gold shows in its first
 * slot, then the shards, then the items.
 */
export interface ContainerContents {
  items: Item[];
  gold: number;
  shards: ShardCounts;
}

/** Whether a container has been emptied: no items, no gold and no shards. */
export const isEmptied = (c: ContainerContents) => c.items.length === 0 && c.gold === 0 && totalShards(c.shards) === 0;

/**
 * Fill a container by its CONTAINER_LOOT entry: its items, of item `level` (items the party can use, `usable`, are
 * favoured, as with drops: generateLootItem), its gold, rolled at that level, and maybe shards. Gold and shards each
 * take a slot, leaving fewer for items.
 */
export function rollContainerLoot(objectId: string, level: number, partyLevel: number, usable?: (item: Item) => boolean): ContainerContents {
  const loot = CONTAINER_LOOT[objectId];
  if (!loot) throw new Error(`no loot for container '${objectId}' (data/gear/containers.ts)`);
  const gold = rollGold(level, loot.dropsGold ?? 0, loot.goldBonus);
  const shards = rollShardDrop(loot.shardChance ?? 0) ?? {};
  const taken = (gold ? 1 : 0) + (totalShards(shards) ? 1 : 0);
  const count = Math.min(CONTAINER_SIZE - taken, randInt(loot.items[0], loot.items[1]));
  return { items: Array.from({ length: count }, () => generateLootItem(level, { usable, rarityWeights: loot.rarityWeights, partyLevel })), gold, shards };
}
