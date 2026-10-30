// Treasure chests: what each holds (filled the first time it is opened: items and gold), the one whose window is
// open, and taking from it. Its window closes when the leader walks away or a fight starts; an emptied chest's lid
// stands open.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isEmptied, rollContainerLoot, type ContainerContents } from '../data/gear/containers';
import { isAdjacent, type Pos } from '../data/world/grid';
import type { DungeonData } from '../data/world/dungeonGen';
import type { Item } from '../data/gear';
import { removeItem } from '../data/gear/inventory';

const EMPTY: ContainerContents = { items: [], gold: 0 };

export function useChests({ location, dungeon, currentZone, combatActive, playerPos, partyLevel, partyCanUse, takeLoot, takeGold }: {
  location: 'sanctum' | 'dungeon';
  dungeon: DungeonData | null;
  currentZone: number;
  combatActive: boolean;
  /** The leader's tile: a chest's window stays open only while it is next to the chest. */
  playerPos: Pos;
  /** The party's level: a chest's affix tiers are rolled from it. */
  partyLevel: number;
  /** Whether someone in the party can use an item (a chest's loot favours those). */
  partyCanUse: (item: Item) => boolean;
  /** Take items into the inventory (useInventory): the ones left over, or null if none was taken. */
  takeLoot: (items: Item[], at: Pos) => Item[] | null;
  /** Take gold into the party's gold (it never needs inventory room). */
  takeGold: (amount: number, at: Pos) => void;
}) {
  // Chests' contents by chest id, filled the first time each is opened (an emptied chest keeps EMPTY)
  const [containers, setContainers] = useState<Record<string, ContainerContents>>({});
  const [openChestId, setOpenChestId] = useState<string | null>(null);

  // Chests whose contents have all been taken: their lids stand open
  const emptiedChests = useMemo(() => new Set(Object.entries(containers).filter(([, c]) => isEmptied(c)).map(([id]) => id)), [containers]);
  // The current zone's chests (one in the boss room), and the one whose window is open
  const zoneChests = useMemo(() => (location === 'dungeon' && dungeon ? dungeon.chests.filter(c => c.zoneId === currentZone) : []), [location, dungeon, currentZone]);
  const openChest = openChestId ? zoneChests.find(c => c.id === openChestId) ?? null : null;
  const openChestContents = openChest ? containers[openChest.id] ?? EMPTY : EMPTY;

  /**
   * Open a chest's window: next to it, never in combat (the map only offers it then; checked here too, so no
   * other way in can open one mid-fight). Filled the first time, at the dungeon's loot level.
   */
  const openChestWindow = useCallback((chestId: string) => {
    const chest = zoneChests.find(c => c.id === chestId);
    if (!chest || !dungeon || combatActive) return;
    setContainers(prev => (prev[chestId] ? prev : { ...prev, [chestId]: rollContainerLoot(chest.object, dungeon.level, partyLevel, partyCanUse) }));
    setOpenChestId(chestId);
  }, [zoneChests, dungeon, partyLevel, partyCanUse, combatActive]);

  /** The open chest's contents become `next`; emptied, its window closes. */
  const leave = useCallback((id: string, next: ContainerContents) => {
    setContainers(prev => ({ ...prev, [id]: next }));
    if (isEmptied(next)) setOpenChestId(null);
  }, []);

  /** Take one item from the open chest into the party inventory (not when it is full). */
  const lootChest = useCallback((idx: number) => {
    if (!openChest) return;
    const c = containers[openChest.id] ?? EMPTY;
    const item = c.items[idx];
    if (!item || !takeLoot([item], openChest.pos)) return;
    leave(openChest.id, { ...c, items: removeItem(c.items, idx) });
  }, [openChest, containers, takeLoot, leave]);

  /** Take the open chest's gold. */
  const lootChestGold = useCallback(() => {
    if (!openChest) return;
    const c = containers[openChest.id] ?? EMPTY;
    if (!c.gold) return;
    takeGold(c.gold, openChest.pos);
    leave(openChest.id, { ...c, gold: 0 });
  }, [openChest, containers, takeGold, leave]);

  const closeChest = useCallback(() => setOpenChestId(null), []);

  /** A new dungeon: its chests start full (chest ids repeat between dungeons), and no window is open. */
  const resetChests = useCallback(() => { setContainers({}); setOpenChestId(null); }, []);

  // Walking away from a chest (the leader no longer next to it), or a fight starting, closes its window
  useEffect(() => {
    if (openChestId && (!openChest || combatActive || !isAdjacent(playerPos, openChest.pos))) setOpenChestId(null);
  }, [openChestId, openChest, playerPos, combatActive]);

  return { zoneChests, emptiedChests, openChest, openChestContents, openChestWindow, lootChest, lootChestGold, closeChest, resetChests };
}
