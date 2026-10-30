import { gearSlotsFor, type GearSlot, type GearSlots, type Item } from './types';
import { isWeaponItem, isShieldItem, isOffhandItem, isArmorItem, isJewelryItem } from '.';
import { OFFHAND_PROFICIENCY } from './offhands';
import { WEAPON_TYPE_DATA } from './weapons';
import { CLASSES, type ClassData, type ClassKey } from '../units/classes';

export const INVENTORY_COLS = 12;
export const INVENTORY_ROWS = 5;
export const INVENTORY_SIZE = INVENTORY_COLS * INVENTORY_ROWS;

/**
 * The party inventory: INVENTORY_SIZE fixed slots, each an item or empty (null). Items stay in their slot: taking one
 * out leaves a hole, and nothing shifts (so a trade can be undone back into its slot). New items take the first
 * empty slot.
 */
export type Inventory = (Item | null)[];

/** An inventory with every slot empty. */
export const emptyInventory = (): Inventory => Array.from({ length: INVENTORY_SIZE }, () => null);

/** How many empty slots a set of slots has. */
export const freeSlots = (slots: readonly (Item | null)[]): number => slots.filter((it) => !it).length;

export const isFull = (slots: readonly (Item | null)[]): boolean => freeSlots(slots) === 0;

/** The first empty slot, or -1 if there is none. */
export const firstEmptySlot = (slots: readonly (Item | null)[]): number => slots.findIndex((it) => !it);

/** The slots with `item` in slot `idx` (null empties it). */
export const setSlot = (slots: readonly (Item | null)[], idx: number, item: Item | null): (Item | null)[] =>
  slots.map((it, i) => (i === idx ? item : it));

/** Put `item` in the first empty slot (unchanged if there is none: check isFull first). */
export function addItem(slots: Inventory, item: Item): Inventory {
  const at = firstEmptySlot(slots);
  return at < 0 ? slots : setSlot(slots, at, item);
}

/** A list of items (a chest's) without the one at `idx`: the rest close up. */
export function removeItem(items: Item[], idx: number): Item[] {
  return items.filter((_, i) => i !== idx);
}

/**
 * Put `items` into the inventory, in order, into its empty slots, as many as it has room for (picking up a loot
 * pile, taking from a chest): the new inventory, how many were taken, and the ones left over.
 */
export function takeIntoInventory(inventory: Inventory, items: Item[]): { inventory: Inventory; taken: number; left: Item[] } {
  const taken = Math.max(0, Math.min(items.length, freeSlots(inventory)));
  return { inventory: items.slice(0, taken).reduce(addItem, inventory), taken, left: items.slice(taken) };
}

export function isProficient(classData: ClassData, item: Item): boolean {
  if (isWeaponItem(item)) return (classData.weaponProficiencies as string[]).includes(item.weaponType);
  // A shield also needs its armor type: a Heavy shield takes Heavy armor proficiency
  if (isShieldItem(item)) return classData.weaponProficiencies.includes('Shields') && classData.armorProficiencies.includes(item.armorType);
  if (isOffhandItem(item)) return classData.weaponProficiencies.includes(OFFHAND_PROFICIENCY[item.offhandKind]);
  if (isArmorItem(item)) return classData.armorProficiencies.includes(item.armorType);
  // Rings and amulets: every class wears them
  if (isJewelryItem(item)) return true;
  return false;
}

/** Whether someone in the party (their classes) can use the item: loot favours such items, and windows tint the rest red. */
export const partyCanUseItem = (party: { selectedClass: ClassKey }[], item: Item): boolean =>
  party.some((m) => isProficient(CLASSES[m.selectedClass], item));

// ─── Equip / unequip ──────────────────────────────────────────────────────────

/**
 * The gear slot equipping `item` puts it in: its own; a ring, the first empty ring slot, else Ring 1 (the ring
 * there comes off).
 */
export function equipSlotFor(gear: GearSlots, item: Item): GearSlot {
  const slots = gearSlotsFor(item.slot);
  return slots.find((s) => !gear[s]) ?? slots[0];
}

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
export function canEquip(classData: ClassData, item: Item | null | undefined, inventory: Inventory, gear: GearSlots): item is Item {
  if (!item || !isProficient(classData, item)) return false;
  const clash = handsClash(gear, item);
  const returned = (gear[equipSlotFor(gear, item)] ? 1 : 0) + (clash && gear[clash] ? 1 : 0);
  // The item's own slot frees up as it is equipped
  return returned <= freeSlots(inventory) + 1;
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
  const item = inventory[inventoryIdx]!;
  const displaced = gear[equipSlotFor(gear, item)];
  const clash = handsClash(gear, item);
  const next = setSlot(inventory, inventoryIdx, displaced);
  const clashed = clash ? gear[clash] : null;
  return { inventory: clashed ? addItem(next, clashed) : next, gear: gearWith(gear, item) };
}

/**
 * The gear with `item` equipped (equipFromInventory's): in its slot (equipSlotFor), the other hand emptied if it
 * can't be held with it (handsClash).
 */
export function gearWith(gear: GearSlots, item: Item): GearSlots {
  const clash = handsClash(gear, item);
  return { ...gear, [equipSlotFor(gear, item)]: item, ...(clash ? { [clash]: null } : {}) };
}

/** Move the item in `slot` to the inventory's first empty slot. Caller checks canUnequip first. */
export function unequipToInventory(inventory: Inventory, gear: GearSlots, slot: GearSlot): { inventory: Inventory; gear: GearSlots } {
  return {
    inventory: addItem(inventory, gear[slot]!),
    gear: { ...gear, [slot]: null },
  };
}
