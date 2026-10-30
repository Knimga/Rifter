// What items sell for (gold): a base by kind, scaled by the item's series (valueMultiplier: later tiers cost more),
// its weapon type or armor slot (WeaponTypeData.value, ARMOR_SLOT_VALUE) and its rarity. Worked out once, when the
// item is made (Item.value). Starting gear is worth next to nothing, whatever it is.
import type { Rarity } from './types';

/** What a Common first-tier item of each kind sells for before its type or slot (armor: a chest piece). */
export const ITEM_BASE_VALUE = { weapon: 30, armor: 20, shield: 30, quiver: 30, focus: 30, ring: 40, amulet: 40 } as const;

export type ValueKind = keyof typeof ITEM_BASE_VALUE;

/** How much more each rarity sells for. */
export const RARITY_VALUE: Record<Rarity, number> = {
  Common: 1,
  Quality: 1.25,
  Superior: 1.5,
  Rare: 2,
  Exquisite: 3,
};

/** What any piece of starting gear (the Worn series) sells for. */
export const STARTER_VALUE = 5;

/**
 * An item's sell value: its kind's base x `multiplier` (its series' valueMultiplier, times its weapon type's or armor
 * slot's value) x its rarity's, rounded; STARTER_VALUE for starting gear.
 */
export const itemValue = (kind: ValueKind, multiplier: number, rarity: Rarity, starter: boolean): number =>
  starter ? STARTER_VALUE : Math.round(ITEM_BASE_VALUE[kind] * multiplier * RARITY_VALUE[rarity]);
