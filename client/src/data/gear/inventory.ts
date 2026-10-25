import type { GearSlot, GearSlots, Item } from './types';
import { isWeaponItem, isShieldItem, isOffhandItem, isArmorItem } from '.';
import { OFFHAND_PROFICIENCY } from './offhands';
import { WEAPON_TYPE_DATA } from './weapons';
import { CLASSES, type ClassData, type ClassKey } from '../units/classes';

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

/**
 * Put `items` into the inventory, in order, as many as it has room for (picking up a loot pile, taking
 * from a chest): the new inventory, how many were taken, and the ones left over.
 */
export function takeIntoInventory(inventory: Inventory, items: Item[]): { inventory: Inventory; taken: number; left: Item[] } {
  const taken = Math.max(0, Math.min(items.length, INVENTORY_SIZE - inventory.length));
  return { inventory: [...inventory, ...items.slice(0, taken)], taken, left: items.slice(taken) };
}

export function isProficient(classData: ClassData, item: Item): boolean {
  if (isWeaponItem(item)) return (classData.weaponProficiencies as string[]).includes(item.weaponType);
  // A shield also needs its armor type: a Heavy shield takes Heavy armor proficiency
  if (isShieldItem(item)) return classData.weaponProficiencies.includes('Shields') && classData.armorProficiencies.includes(item.armorType);
  if (isOffhandItem(item)) return classData.weaponProficiencies.includes(OFFHAND_PROFICIENCY[item.offhandKind]);
  if (isArmorItem(item)) return classData.armorProficiencies.includes(item.armorType);
  return false;
}

/** Whether someone in the party (their classes) can use the item: loot favours such items, and windows tint the rest red. */
export const partyCanUseItem = (party: { selectedClass: ClassKey }[], item: Item): boolean =>
  party.some((m) => isProficient(CLASSES[m.selectedClass], item));

// ─── Equip / unequip ──────────────────────────────────────────────────────────

/**
 * Whether a mainhand and an offhand can be held together: any offhand with a one-handed weapon (or none),
 * none with a two-handed one (WEAPON_TYPE_DATA twoHanded).
 */
export function handsFit(mainhand: Item | null, offhand: Item | null): boolean {
  return !mainhand || !offhand || !isWeaponItem(mainhand) || !WEAPON_TYPE_DATA[mainhand.weaponType].twoHanded;
}

/**
 * The other hand's item that equipping `item` would push off (a shield when equipping a two-hander, a
 * two-hander when equipping a shield), or null. It goes to the inventory (equipFromInventory).
 */
function handsClash(gear: GearSlots, item: Item): GearSlot | null {
  if (item.slot === 'mainhand') return handsFit(item, gear.offhand) ? null : 'offhand';
  if (item.slot === 'offhand') return handsFit(gear.mainhand, item) ? null : 'mainhand';
  return null;
}

/**
 * True if the item at `inventoryIdx` can be equipped: the member is proficient with it, and the inventory has
 * room for what it displaces (the item in its slot trades places with it; an item in the other hand it can't
 * be held with comes off too: handsFit).
 */
export function canEquip(classData: ClassData, item: Item | undefined, inventory: Inventory, gear: GearSlots): item is Item {
  if (!item || !isProficient(classData, item)) return false;
  const clash = handsClash(gear, item);
  const returned = (gear[item.slot] ? 1 : 0) + (clash && gear[clash] ? 1 : 0);
  return inventory.length - 1 + returned <= INVENTORY_SIZE;
}

/** An equipped item can be unequipped whenever the inventory has room for it. */
export const canUnequip = (inventory: Inventory, gear: GearSlots, slot: GearSlot) =>
  !!gear[slot] && !isFull(inventory);

/**
 * Equip the inventory item at `inventoryIdx` into its slot. If the slot was occupied, the
 * previously equipped item takes the new item's place in the inventory (the two trade places). An item in
 * the other hand that can't be held with it (handsFit: a shield with a two-hander) goes to the inventory
 * too. Caller checks canEquip first.
 */
export function equipFromInventory(inventory: Inventory, gear: GearSlots, inventoryIdx: number): { inventory: Inventory; gear: GearSlots } {
  const item = inventory[inventoryIdx];
  const displaced = gear[item.slot];
  const clash = handsClash(gear, item);
  const next = displaced ? inventory.map((it, i) => i === inventoryIdx ? displaced : it) : removeItem(inventory, inventoryIdx);
  const clashed = clash ? gear[clash] : null;
  return {
    inventory: clashed ? addItem(next, clashed) : next,
    gear: { ...gear, [item.slot]: item, ...(clash ? { [clash]: null } : {}) },
  };
}

/** Move the item in `slot` to the end of the inventory. Caller checks canUnequip first. */
export function unequipToInventory(inventory: Inventory, gear: GearSlots, slot: GearSlot): { inventory: Inventory; gear: GearSlots } {
  return {
    inventory: addItem(inventory, gear[slot]!),
    gear: { ...gear, [slot]: null },
  };
}
