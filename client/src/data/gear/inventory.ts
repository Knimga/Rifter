import { ARMOR_SLOTS, JEWELRY_KINDS, gearSlotsFor, type GearSlot, type GearSlots, type Item, type JewelryKind, type Rarity } from './types';
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

/** The slots with the items in `from` and `to` trading places (moving one to an empty slot leaves its own empty). */
export function moveItem(slots: Inventory, from: number, to: number): Inventory {
  return setSlot(setSlot(slots, to, slots[from]), from, slots[to]);
}

/** Rarities, lowest first. */
const RARITY_ORDER: readonly Rarity[] = ['Common', 'Quality', 'Superior', 'Rare', 'Exquisite'];

/**
 * Where an item sorts in the auto-sort (sortInventory): weapons (by type), shields, other offhands (quivers, foci),
 * armor (helm, chest, gloves, boots), then amulets and rings.
 */
function sortGroup(item: Item): [number, number] {
  if (isWeaponItem(item)) return [0, Object.keys(WEAPON_TYPE_DATA).indexOf(item.weaponType)];
  if (isShieldItem(item)) return [1, 0];
  if (isOffhandItem(item)) return [2, item.offhandKind === 'quiver' ? 0 : 1];
  if (isArmorItem(item)) return [3, ARMOR_SLOTS.indexOf(item.slot)];
  return [4, JEWELRY_KINDS.indexOf(item.slot as JewelryKind)];
}

/**
 * The inventory with its items sorted by kind (sortGroup), the best first within a kind (rarity, then item level, then
 * name), packed into the first slots with the empty ones after.
 */
export function sortInventory(slots: Inventory): Inventory {
  const items = slots.filter((it): it is Item => !!it).map(item => ({ item, group: sortGroup(item) }));
  items.sort((a, b) =>
    a.group[0] - b.group[0] || a.group[1] - b.group[1]
    || RARITY_ORDER.indexOf(b.item.rarity) - RARITY_ORDER.indexOf(a.item.rarity)
    || b.item.level - a.item.level
    || a.item.name.localeCompare(b.item.name));
  return slots.map((_, i) => items[i]?.item ?? null);
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
 * The gear slot equipping `item` puts it in: `slot` if given and it fits there (an item dragged onto a gear slot);
 * else its own; a ring, the first empty ring slot, else Ring 1 (the ring there comes off).
 */
export function equipSlotFor(gear: GearSlots, item: Item, slot?: GearSlot): GearSlot {
  const slots = gearSlotsFor(item.slot);
  if (slot && slots.includes(slot)) return slot;
  return slots.find((s) => !gear[s]) ?? slots[0];
}

/**
 * For an item that goes in either of two slots (a ring): the one equipping it doesn't pick (equipSlotFor), to compare
 * against too; else null.
 */
export function otherEquipSlot(gear: GearSlots, item: Item): GearSlot | null {
  const slots = gearSlotsFor(item.slot), picked = equipSlotFor(gear, item);
  return slots.find((s) => s !== picked) ?? null;
}

/** Whether `item` goes in gear slot `slot` at all (a ring in either ring slot). */
export const fitsGearSlot = (item: Item, slot: GearSlot) => gearSlotsFor(item.slot).includes(slot);

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
 * True if the item at `inventoryIdx` can be equipped (in `slot`, if given: it must fit there): the member is
 * proficient with it, and the inventory has room for what it displaces (the item in its slot trades places with it;
 * an item in the other hand it can't be held with comes off too: handsFit).
 */
export function canEquip(classData: ClassData, item: Item | null | undefined, inventory: Inventory, gear: GearSlots, slot?: GearSlot): item is Item {
  if (!item || !isProficient(classData, item) || (slot && !fitsGearSlot(item, slot))) return false;
  const clash = handsClash(gear, item);
  const returned = (gear[equipSlotFor(gear, item, slot)] ? 1 : 0) + (clash && gear[clash] ? 1 : 0);
  // The item's own slot frees up as it is equipped
  return returned <= freeSlots(inventory) + 1;
}

/** An equipped item can be unequipped whenever the inventory has room for it. */
export const canUnequip = (inventory: Inventory, gear: GearSlots, slot: GearSlot) =>
  !!gear[slot] && !isFull(inventory);

/**
 * Equip the inventory item at `inventoryIdx` into its slot (`slot`, if given: equipSlotFor). If the slot was occupied, the
 * previously equipped item takes the new item's place in the inventory (the two trade places). An item in
 * the other hand that can't be held with it (handsFit: a shield with a two-hander) goes to the inventory
 * too. Caller checks canEquip first.
 */
export function equipFromInventory(inventory: Inventory, gear: GearSlots, inventoryIdx: number, slot?: GearSlot): { inventory: Inventory; gear: GearSlots } {
  const item = inventory[inventoryIdx]!;
  const displaced = gear[equipSlotFor(gear, item, slot)];
  const clash = handsClash(gear, item);
  const next = setSlot(inventory, inventoryIdx, displaced);
  const clashed = clash ? gear[clash] : null;
  return { inventory: clashed ? addItem(next, clashed) : next, gear: gearWith(gear, item, slot) };
}

/**
 * The gear with `item` equipped (equipFromInventory's): in its slot (equipSlotFor), the other hand emptied if it
 * can't be held with it (handsClash).
 */
export function gearWith(gear: GearSlots, item: Item, slot?: GearSlot): GearSlots {
  const clash = handsClash(gear, item);
  return { ...gear, [equipSlotFor(gear, item, slot)]: item, ...(clash ? { [clash]: null } : {}) };
}

/**
 * Move the item in `slot` to the inventory: into slot `to` if given (it must be empty: dragged there), else the first
 * empty one. Caller checks canUnequip first.
 */
export function unequipToInventory(inventory: Inventory, gear: GearSlots, slot: GearSlot, to?: number): { inventory: Inventory; gear: GearSlots } {
  return {
    inventory: to === undefined ? addItem(inventory, gear[slot]!) : setSlot(inventory, to, gear[slot]),
    gear: { ...gear, [slot]: null },
  };
}

/**
 * Whether the items in gear slots `from` and `to` can trade places (an equipped item dragged onto another of the
 * member's slots: a ring from one ring slot to the other): each fits the other's slot (an empty one always does).
 */
export function canSwapGear(gear: GearSlots, from: GearSlot, to: GearSlot): boolean {
  const a = gear[from], b = gear[to];
  return from !== to && !!a && fitsGearSlot(a, to) && (!b || fitsGearSlot(b, from));
}

/** The gear with the items in `from` and `to` trading places (canSwapGear first). */
export const swapGear = (gear: GearSlots, from: GearSlot, to: GearSlot): GearSlots => ({ ...gear, [from]: gear[to], [to]: gear[from] });
