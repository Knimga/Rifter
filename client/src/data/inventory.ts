import type { Item } from './gear';
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
