// The party's shared inventory: taking loot into it (piles, chests) and equipping from it / unequipping to it.
import { useCallback, useState } from 'react';
import { CLASSES } from '../data/classes';
import { COMBAT_TEXT_COLOR } from '../data/constants';
import type { Pos } from '../data/dungeonHelpers';
import type { GearSlot, GearSlots, Item } from '../data/gear';
import { canEquip, canUnequip, equipFromInventory, takeIntoInventory, unequipToInventory, type Inventory } from '../data/inventory';
import type { PartyMemberConfig } from '../data/party';
import type { SpawnFloat } from './useFloatingText';

export function useInventory({ party, setParty, spawnFloat }: {
  party: PartyMemberConfig[];
  setParty: (party: PartyMemberConfig[]) => void;
  spawnFloat: SpawnFloat;
}) {
  const [inventory, setInventory] = useState<Inventory>([]);

  /**
   * Take loot (a pile's items, a chest's item) into the inventory, as many as fit, with a float over `at`:
   * '+', or 'Inventory Full' when nothing fit. The items left over, or null if none was taken.
   */
  const takeLoot = useCallback((items: Item[], at: Pos): Item[] | null => {
    const { inventory: next, taken, left } = takeIntoInventory(inventory, items);
    if (taken === 0) {
      spawnFloat(at.x, at.y, 'Inventory Full', COMBAT_TEXT_COLOR.warn);
      return null;
    }
    setInventory(next);
    spawnFloat(at.x, at.y, '+', COMBAT_TEXT_COLOR.loot);
    return left;
  }, [inventory, spawnFloat]);

  /** Apply an inventory/gear change for one party member (equip or unequip). */
  const applyGearChange = useCallback((charIdx: number, change: { inventory: Inventory; gear: GearSlots }) => {
    setInventory(change.inventory);
    setParty(party.map((m, i) => i === charIdx ? { ...m, gear: change.gear } : m));
  }, [party, setParty]);

  const equipItem = useCallback((inventoryIdx: number, charIdx: number) => {
    const member = party[charIdx];
    if (!member || !canEquip(CLASSES[member.selectedClass], inventory[inventoryIdx])) return;
    applyGearChange(charIdx, equipFromInventory(inventory, member.gear, inventoryIdx));
  }, [inventory, party, applyGearChange]);

  const unequipItem = useCallback((slot: GearSlot, charIdx: number) => {
    const member = party[charIdx];
    if (!member || !canUnequip(inventory, member.gear, slot)) return;
    applyGearChange(charIdx, unequipToInventory(inventory, member.gear, slot));
  }, [inventory, party, applyGearChange]);

  return { inventory, takeLoot, equipItem, unequipItem };
}
