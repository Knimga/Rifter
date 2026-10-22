// Treasure chests: what each holds (filled the first time it is opened), the one whose window is open, and
// taking items from it. Its window closes when the leader walks away or a fight starts; an emptied chest's
// lid stands open.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { rollContainerLoot } from '../data/containers';
import { isAdjacent, type Pos } from '../data/dungeonHelpers';
import type { DungeonData } from '../data/dungeonGen';
import type { Item } from '../data/gear';
import { removeItem } from '../data/inventory';

export function useChests({ location, dungeon, currentZone, combatActive, playerPos, partyCanUse, takeLoot }: {
  location: 'sanctum' | 'dungeon';
  dungeon: DungeonData | null;
  currentZone: number;
  combatActive: boolean;
  /** The leader's tile: a chest's window stays open only while it is next to the chest. */
  playerPos: Pos;
  /** Whether someone in the party can use an item (a chest's loot favours those). */
  partyCanUse: (item: Item) => boolean;
  /** Take items into the inventory (useInventory): the ones left over, or null if none was taken. */
  takeLoot: (items: Item[], at: Pos) => Item[] | null;
}) {
  // Chests' contents by chest id, filled the first time each is opened (an emptied chest keeps [])
  const [containers, setContainers] = useState<Record<string, Item[]>>({});
  const [openChestId, setOpenChestId] = useState<string | null>(null);

  // Chests whose contents have all been taken: their lids stand open
  const emptiedChests = useMemo(() => new Set(Object.entries(containers).filter(([, items]) => items.length === 0).map(([id]) => id)), [containers]);
  // The current zone's chests (one in the boss room), and the one whose window is open
  const zoneChests = useMemo(() => (location === 'dungeon' && dungeon ? dungeon.chests.filter(c => c.zoneId === currentZone) : []), [location, dungeon, currentZone]);
  const openChest = openChestId ? zoneChests.find(c => c.id === openChestId) ?? null : null;
  const openChestItems = openChest ? containers[openChest.id] ?? [] : [];

  /** Open a chest's window (the map only offers this next to it, out of combat). Filled the first time, at the dungeon's loot level. */
  const openChestWindow = useCallback((chestId: string) => {
    const chest = zoneChests.find(c => c.id === chestId);
    if (!chest || !dungeon) return;
    setContainers(prev => (prev[chestId] ? prev : { ...prev, [chestId]: rollContainerLoot(chest.object, dungeon.baseEnemyLevel, partyCanUse) }));
    setOpenChestId(chestId);
  }, [zoneChests, dungeon, partyCanUse]);

  /** Take one item from the open chest into the party inventory (not when it is full). Emptied, it closes. */
  const lootChest = useCallback((idx: number) => {
    if (!openChest) return;
    const items = containers[openChest.id] ?? [];
    const item = items[idx];
    if (!item || !takeLoot([item], openChest.pos)) return;
    const left = removeItem(items, idx);
    setContainers(prev => ({ ...prev, [openChest.id]: left }));
    if (left.length === 0) setOpenChestId(null);
  }, [openChest, containers, takeLoot]);

  const closeChest = useCallback(() => setOpenChestId(null), []);

  /** A new dungeon: its chests start full (chest ids repeat between dungeons), and no window is open. */
  const resetChests = useCallback(() => { setContainers({}); setOpenChestId(null); }, []);

  // Walking away from a chest (the leader no longer next to it), or a fight starting, closes its window
  useEffect(() => {
    if (openChestId && (!openChest || combatActive || !isAdjacent(playerPos, openChest.pos))) setOpenChestId(null);
  }, [openChestId, openChest, playerPos, combatActive]);

  return { zoneChests, emptiedChests, openChest, openChestItems, openChestWindow, lootChest, closeChest, resetChests };
}
