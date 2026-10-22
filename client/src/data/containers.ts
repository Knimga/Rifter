// What containers on the map (treasure chests) hold: how many items, and how likely each rarity is. Keyed
// by the container's game object (GAME_OBJECTS id, data/gameObjects.ts). Tune values here.
import type { Item, Rarity } from './gear';
import { generateLootItem } from './gear';
import { randInt } from './random';

/** Slots in a container's window (CONTAINER_COLS wide): the most items a container can hold. */
export const CONTAINER_COLS = 4;
export const CONTAINER_ROWS = 3;
export const CONTAINER_SIZE = CONTAINER_COLS * CONTAINER_ROWS;

export interface ContainerLoot {
  /** How many items it holds: an even pick from min to max (at most CONTAINER_SIZE). */
  items: [min: number, max: number];
  /** Relative chance of each rarity per item (0 = never). Common is never found in chests. */
  rarityWeights: Record<Rarity, number>;
}

export const CONTAINER_LOOT: Record<string, ContainerLoot> = {
  'basic-treasure-chest': {
    items: [4, 6],
    // Skewed well toward the rare end: about 1 in 6 items is Quality, 1 in 6 Exquisite
    rarityWeights: { Common: 0, Quality: 15, Superior: 35, Rare: 35, Exquisite: 15 },
  },
};

/**
 * Fill a container: its items, of item `level`, by its CONTAINER_LOOT entry. Items the party can use
 * (`usable`) are favoured, as with drops (generateLootItem).
 */
export function rollContainerLoot(objectId: string, level: number, usable?: (item: Item) => boolean): Item[] {
  const loot = CONTAINER_LOOT[objectId];
  if (!loot) throw new Error(`no loot for container '${objectId}' (data/containers.ts)`);
  const count = Math.min(CONTAINER_SIZE, randInt(loot.items[0], loot.items[1]));
  return Array.from({ length: count }, () => generateLootItem(level, { usable, rarityWeights: loot.rarityWeights }));
}
