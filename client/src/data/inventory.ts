import type { GearSlot, GearSlots, Item } from './gear';
import { isWeaponItem, isShieldItem, isArmorItem } from './gear';
import type { ClassData } from './classes';

export const INVENTORY_COLS = 12;
export const INVENTORY_ROWS = 5;
export const INVENTORY_SIZE = INVENTORY_COLS * INVENTORY_ROWS;

export type Inventory = Item[];

export function isFull(inventory: Inventory): boolean {
  return inventory.length >= INVENTORY_SIZE;
}

export function addItem(inventory: Inventory, item: Item): Inventory {
  return [...inventory, item];
}

export function removeItem(inventory: Inventory, idx: number): Inventory {
  return inventory.filter((_, i) => i !== idx);
}

export function isProficient(classData: ClassData, item: Item): boolean {
  if (isWeaponItem(item)) return (classData.weaponProficiencies as string[]).includes(item.weaponType);
  if (isShieldItem(item)) return classData.weaponProficiencies.includes('Shields');
  if (isArmorItem(item)) return classData.armorProficiencies.includes(item.armorType);
  return false;
}

// ─── Equip / unequip ──────────────────────────────────────────────────────────

/** True if the item at `inventoryIdx` can be equipped (a swap with an occupied slot is fine). */
export const canEquip = (classData: ClassData, item: Item | undefined): item is Item =>
  !!item && isProficient(classData, item);

/** An equipped item can be unequipped whenever the inventory has room for it. */
export const canUnequip = (inventory: Inventory, gear: GearSlots, slot: GearSlot) =>
  !!gear[slot] && !isFull(inventory);

/**
 * Equip the inventory item at `inventoryIdx` into its slot. If the slot was occupied, the
 * previously equipped item takes the new item's place in the inventory (the two trade places).
 */
export function equipFromInventory(inventory: Inventory, gear: GearSlots, inventoryIdx: number): { inventory: Inventory; gear: GearSlots } {
  const item = inventory[inventoryIdx];
  const displaced = gear[item.slot];
  return {
    inventory: displaced ? inventory.map((it, i) => i === inventoryIdx ? displaced : it) : removeItem(inventory, inventoryIdx),
    gear: { ...gear, [item.slot]: item },
  };
}

/** Move the item in `slot` to the end of the inventory. Caller checks canUnequip first. */
export function unequipToInventory(inventory: Inventory, gear: GearSlots, slot: GearSlot): { inventory: Inventory; gear: GearSlots } {
  return {
    inventory: addItem(inventory, gear[slot]!),
    gear: { ...gear, [slot]: null },
  };
}
