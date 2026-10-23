import type { ArmorProficiency } from '../units/classes';

export * from './types';
export type { DamageElement } from '../units/stats';
export { DAMAGE_ELEMENTS } from '../units/stats';
import { DAMAGE_ELEMENTS } from '../units/stats';
import type { DamageElement, ActiveBuff } from '../units/stats';
import type { ArmorSlot, WeaponType, GearSlots, Item, ArmorItem, ShieldItem, WeaponItem, Affix, ImplicitDef, Rarity } from './types';
import { ARMOR_SLOTS, GEAR_SLOTS, PHYSICAL_ELEMENTS } from './types';

import { ARMOR_TYPE_DATA, BASE_ARMOR_MULTIPLIER, ARMOR_SERIES, STARTER_ARMOR_SERIES, armorName } from './armor';
import { SHIELD_ARMOR_MULTIPLIER, SHIELDS, STARTER_SHIELDS, SHIELD_IMPLICIT } from './offhands';
import { STARTER_WEAPON_SERIES, WEAPON_SERIES, WEAPON_TYPE_DATA, weaponInvalidAffixes, weaponName } from './weapons';
import { AFFIX_SLOTS_PER_GROUP, rollAffixes, starvedAffixGroups } from './affixes';
import { chance, pick } from '../random';

const MAGIC_ELEMENTS = DAMAGE_ELEMENTS.filter(el => !PHYSICAL_ELEMENTS.has(el));

export const EMPTY_GEAR: GearSlots = {
  helm: null,
  chest: null,
  gloves: null,
  boots: null,
  mainhand: null,
  offhand: null,
};

// ─── Type Guards ──────────────────────────────────────────────────────────────

export function isArmorItem(item: Item): item is ArmorItem {
  return (ARMOR_SLOTS as readonly string[]).includes(item.slot);
}

export function isShieldItem(item: Item): item is ShieldItem {
  return item.slot === 'offhand' && 'armorValue' in item;
}

export function isWeaponItem(item: Item): item is WeaponItem {
  return item.slot === 'mainhand';
}

// ─── Equipped gear → stats ────────────────────────────────────────────────────

/** Every implicit and affix on equipped gear, as permanent buffs. */
export function getGearBuffs(gear: GearSlots): ActiveBuff[] {
  return GEAR_SLOTS.flatMap((slot, slotIdx) => {
    const item = gear[slot];
    if (!item) return [];
    const mods = item.implicit ? [item.implicit, ...item.affixes] : item.affixes;
    return mods.map((mod, i) => ({
      id: `gear_${slotIdx}_${i}`,
      stat: mod.stat,
      amount: mod.value,
      roundsRemaining: Infinity,
    }));
  });
}

export function getGearArmorBonus(gear: GearSlots): number {
  return Object.values(gear).reduce((total, item) =>
    total + (item && (isArmorItem(item) || isShieldItem(item)) ? item.armorValue : 0), 0);
}

// ─── Item Generation ──────────────────────────────────────────────────────────
//
// One generator per item kind, used for both starting gear (starter: true, affixes: false: the Worn
// series, which never drop) and loot drops.

interface GenerateOptions {
  affixes?: boolean;  // roll random affixes (default true); starting gear has none
  starter?: boolean;  // from the starting gear series (STARTER_*), which never drop
  rarityWeights?: Record<Rarity, number>; // rarity odds instead of the item level's (rarityWeights), e.g. a chest's
}

/** Pick a series within ±3 levels; fall back to the nearest one below. */
function pickSeriesForLevel<T extends { requiredLevel: number }>(series: T[], level: number): T {
  const inRange = series.filter(s => Math.abs(s.requiredLevel - level) <= 3);
  if (inRange.length > 0) return pick(inRange);
  const below = series.filter(s => s.requiredLevel < level - 3).sort((a, b) => b.requiredLevel - a.requiredLevel);
  return below[0] ?? series[0];
}

function resolveImplicit(def: ImplicitDef, level: number): Affix {
  return { stat: def.stat, value: Math.round(def.baseValue + def.growthPerLevel * (level - 1)) };
}

// Every item type must be able to fill both affix groups: warn (once, at load) about any whose excluded
// affixes leave a group too few stats
for (const [kind, invalid] of [
  ...(Object.keys(WEAPON_TYPE_DATA) as WeaponType[]).map(t => [`weapon type '${t}'`, weaponInvalidAffixes(t)] as const),
  ...Object.entries(ARMOR_TYPE_DATA).map(([t, d]) => [`armor/shield type '${t}'`, d.invalidAffixes] as const),
]) {
  const starved = starvedAffixGroups(invalid);
  if (starved.length) console.warn(`${kind} excludes too many affixes: group ${starved.join(' and ')} has fewer than ${AFFIX_SLOTS_PER_GROUP} left`);
}

let itemCounter = 0;
/** A unique item id. */
const newItemId = () => `item-${Date.now().toString(36)}-${(itemCounter++).toString(36)}`;

export function generateWeapon(
  level: number,
  weaponType: WeaponType,
  { element, affixes = true, starter = false, rarityWeights }: GenerateOptions & { element?: DamageElement } = {},
): WeaponItem {
  const data = WEAPON_TYPE_DATA[weaponType];
  const series = pickSeriesForLevel(starter ? STARTER_WEAPON_SERIES : WEAPON_SERIES, level);
  const m = series.damageMultiplier;
  return {
    name: weaponName(series, weaponType),
    slot: 'mainhand',
    ...rollAffixes(weaponInvalidAffixes(weaponType), level, affixes, rarityWeights),
    weaponType,
    attackCategory: data.defaultAttackCategory,
    damageElement: element ?? data.defaultDamageElement ?? pick(MAGIC_ELEMENTS),
    level,
    minDamage: Math.max(1, Math.round(data.baseDamage.min * m)),
    maxDamage: Math.max(1, Math.round(data.baseDamage.max * m)),
    range: data.range,
    id: newItemId(),
    model: series.weapons[weaponType]!.model,
    implicit: data.implicit ? resolveImplicit(data.implicit, level) : undefined,
  };
}

export function generateArmor(
  level: number,
  slot: ArmorSlot,
  armorType?: ArmorProficiency,
  { affixes = true, starter = false, rarityWeights }: GenerateOptions = {},
): ArmorItem {
  const pool = starter ? STARTER_ARMOR_SERIES : ARMOR_SERIES;
  const series = pickSeriesForLevel(armorType ? pool.filter(s => s.armorType === armorType) : pool, level);
  const type = series.armorType;
  const typeData = ARMOR_TYPE_DATA[type];
  return {
    id: newItemId(),
    name: armorName(series, slot),
    slot,
    ...rollAffixes(typeData.invalidAffixes, level, affixes, rarityWeights),
    armorType: type,
    armorValue: Math.round(typeData.baseArmor * level * BASE_ARMOR_MULTIPLIER[slot] * series.armorMultiplier),
    model: series.models[slot],
    implicit: resolveImplicit({ stat: typeData.implicit.stat, ...typeData.implicit.slots[slot] }, level),
  };
}

export function generateShield(
  level: number,
  armorType?: ArmorProficiency,
  { affixes = true, starter = false, rarityWeights }: GenerateOptions = {},
): ShieldItem {
  const pool = starter ? STARTER_SHIELDS : SHIELDS;
  const template = pickSeriesForLevel(armorType ? pool.filter(s => s.armorType === armorType) : pool, level);
  const typeData = ARMOR_TYPE_DATA[template.armorType];
  return {
    id: newItemId(),
    name: template.name,
    slot: 'offhand',
    ...rollAffixes(typeData.invalidAffixes, level, affixes, rarityWeights),
    armorType: template.armorType,
    armorValue: Math.round(typeData.baseArmor * level * SHIELD_ARMOR_MULTIPLIER * template.armorMultiplier),
    model: template.model,
    implicit: resolveImplicit(SHIELD_IMPLICIT, level),
  };
}

// ─── Loot Drops ───────────────────────────────────────────────────────────────

export const LOOT_DROP_CHANCE = 0.10;

type LootEntry =
  | { kind: 'weapon'; weaponType: WeaponType }
  | { kind: 'armor';  slot: ArmorSlot }
  | { kind: 'shield' };

const LOOT_POOL: LootEntry[] = [
  ...(Object.keys(WEAPON_TYPE_DATA) as WeaponType[]).map(weaponType => ({ kind: 'weapon' as const, weaponType })),
  ...ARMOR_SLOTS.map(slot => ({ kind: 'armor' as const, slot })),
  { kind: 'shield' },
];

/**
 * How much likelier a drop someone in the party can use (`usable`) is than one no one can: an unusable roll
 * is kept only 1 time in this many, else rolled again.
 */
export const USABLE_LOOT_WEIGHT = 4;

/**
 * A loot drop (or none, by `dropChance`): any weapon, armor piece or shield. Items the party can use
 * (`usable`, e.g. someone is proficient) come up USABLE_LOOT_WEIGHT times as often as ones it can't.
 */
export function generateLootDrop(dungeonLevel: number, dropChance = LOOT_DROP_CHANCE, usable?: (item: Item) => boolean): Item | null {
  return chance(dropChance) ? generateLootItem(dungeonLevel, { usable }) : null;
}

/**
 * One piece of loot of item `level`: any weapon, armor piece or shield. Items the party can use (`usable`)
 * come up USABLE_LOOT_WEIGHT times as often; `rarityWeights` replaces the level's rarity odds (a chest's).
 */
export function generateLootItem(level: number, { usable, rarityWeights }: { usable?: (item: Item) => boolean; rarityWeights?: Record<Rarity, number> } = {}): Item {
  const roll = (): Item => {
    const entry = pick(LOOT_POOL);
    switch (entry.kind) {
      case 'weapon': return generateWeapon(level, entry.weaponType, { rarityWeights });
      case 'armor':  return generateArmor(level, entry.slot, undefined, { rarityWeights });
      case 'shield': return generateShield(level, undefined, { rarityWeights });
    }
  };
  for (;;) {
    const item = roll();
    if (!usable || usable(item) || chance(1 / USABLE_LOOT_WEIGHT)) return item;
  }
}
