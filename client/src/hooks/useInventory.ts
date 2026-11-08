// The party's shared inventory: taking loot into it (piles, chests) and equipping from it / unequipping to it (never
// in combat: gearLocked). And the party's gold, shared the same way.
import { useCallback, useState } from 'react';
import { CLASSES } from '../data/units/classes';
import { COMBAT_TEXT_COLOR } from '../data/constants';
import type { Pos } from '../data/world/grid';
import type { GearSlot, GearSlots, Item } from '../data/gear';
import { canEquip, canSwapGear, canUnequip, emptyInventory, equipFromInventory, moveItem, sortInventory, swapGear, takeIntoInventory, unequipToInventory, type Inventory } from '../data/gear/inventory';
import type { PartyMemberConfig } from '../data/units/party';
import type { SpawnFloat } from './useFloatingText';

/** The gold the party starts the game with. */
const STARTING_GOLD = 0;

export function useInventory({ party, setParty, spawnFloat, gearLocked }: {
  party: PartyMemberConfig[];
  setParty: (party: PartyMemberConfig[]) => void;
  spawnFloat: SpawnFloat;
  /** Gear can't be changed now (in combat): equipping, unequipping and swapping gear slots do nothing. */
  gearLocked: boolean;
}) {
  const [inventory, setInventory] = useState<Inventory>(emptyInventory);
  // The party's gold, shared like the inventory (none at the start of the game)
  const [gold, setGold] = useState(STARTING_GOLD);
  /** Add gold (or, negative, spend it: never below 0). */
  const addGold = useCallback((amount: number) => setGold(g => Math.max(0, g + amount)), []);

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

  /** Equip the inventory item at `inventoryIdx` on a member: in its own slot, or `slot` (dropped on it) if it fits there. */
  const equipItem = useCallback((inventoryIdx: number, charIdx: number, slot?: GearSlot) => {
    const member = party[charIdx];
    if (gearLocked || !member || !canEquip(CLASSES[member.selectedClass], inventory[inventoryIdx], inventory, member.gear, slot)) return;
    applyGearChange(charIdx, equipFromInventory(inventory, member.gear, inventoryIdx, slot));
  }, [inventory, party, applyGearChange, gearLocked]);

  /** Move an inventory item to another slot (dragged there): with the item there, if any, trading places. */
  const moveInventoryItem = useCallback((from: number, to: number) => {
    if (from !== to) setInventory(inv => moveItem(inv, from, to));
  }, []);

  /** Auto-sort the inventory by item kind (sortInventory). */
  const sortItems = useCallback(() => setInventory(sortInventory), []);

  /** Unequip a member's item in `slot`: into inventory slot `to` if given (an empty one: dragged there), else the first empty one. */
  const unequipItem = useCallback((slot: GearSlot, charIdx: number, to?: number) => {
    const member = party[charIdx];
    if (gearLocked || !member || !canUnequip(inventory, member.gear, slot) || (to !== undefined && inventory[to])) return;
    applyGearChange(charIdx, unequipToInventory(inventory, member.gear, slot, to));
  }, [inventory, party, applyGearChange, gearLocked]);

  /** Swap a member's items in two gear slots (one dragged onto the other: a ring to the other ring slot). */
  const swapGearSlots = useCallback((from: GearSlot, to: GearSlot, charIdx: number) => {
    const member = party[charIdx];
    if (gearLocked || !member || !canSwapGear(member.gear, from, to)) return;
    setParty(party.map((m, i) => i === charIdx ? { ...m, gear: swapGear(m.gear, from, to) } : m));
  }, [party, setParty, gearLocked]);

  return { inventory, setInventory, takeLoot, equipItem, unequipItem, swapGearSlots, moveInventoryItem, sortItems, gold, setGold, addGold };
}
