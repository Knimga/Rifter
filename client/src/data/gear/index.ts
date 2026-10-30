import type { ArmorProficiency } from '../units/classes';

export * from './types';
export type { DamageElement } from '../units/stats';
export { DAMAGE_ELEMENTS } from '../units/stats';
import type { DamageElement, ActiveBuff } from '../units/stats';
import type { ArmorSlot, WeaponType, GearSlots, Item, ArmorItem, ShieldItem, OffhandItem, OffhandKind, WeaponItem, JewelryItem, JewelryKind, Affix, ImplicitDef, Rarity } from './types';
import { ARMOR_SLOTS, GEAR_SLOTS, JEWELRY_KINDS, MAGIC_ELEMENTS } from './types';

import { ARMOR_TYPE_DATA, ARMOR_SLOT_VALUE, BASE_ARMOR_MULTIPLIER, ARMOR_SERIES, STARTER_ARMOR_SERIES, armorName } from './armor';
import { itemValue } from './value';
import { SHIELD_ARMOR_MULTIPLIER, SHIELDS, STARTER_SHIELDS, SHIELD_IMPLICIT, OFFHANDS } from './offhands';
import { JEWELRY, droppableJewelry } from './jewelry';
import { STARTER_WEAPON_SERIES, WEAPON_SERIES, WEAPON_TYPE_DATA, weaponInvalidAffixes, weaponName } from './weapons';
import { AFFIX_SLOTS_PER_GROUP, rollAffixes, starvedAffixGroups } from './affixes';
import { chance, pick, rollCount } from '../random';

export const EMPTY_GEAR: GearSlots = {
  helm: null,
  chest: null,
  gloves: null,
  boots: null,
  mainhand: null,
  offhand: null,
  amulet: null,
  ring1: null,
  ring2: null,
};

// ─── Type Guards ──────────────────────────────────────────────────────────────

export function isArmorItem(item: Item): item is ArmorItem {
  return (ARMOR_SLOTS as readonly string[]).includes(item.slot);
}

export function isShieldItem(item: Item): item is ShieldItem {
  return item.slot === 'offhand' && 'armorValue' in item;
}

/** An offhand that isn't a shield: a quiver, a focus (its offhandKind). */
export function isOffhandItem(item: Item): item is OffhandItem {
  return item.slot === 'offhand' && 'offhandKind' in item;
}

/** A ring or an amulet. */
export function isJewelryItem(item: Item): item is JewelryItem {
  return (JEWELRY_KINDS as readonly string[]).includes(item.slot);
}

export function isWeaponItem(item: Item): item is WeaponItem {
  return item.slot === 'mainhand';
}

/** The weapon in a set of gear's main hand, if any. */
export const heldWeapon = (gear: GearSlots): WeaponItem | null => (gear.mainhand && isWeaponItem(gear.mainhand) ? gear.mainhand : null);

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
  partyLevel?: number; // the party's level, which its affixes' tiers are rolled from (default: the item's level)
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
  ...(Object.entries(OFFHANDS) as [OffhandKind, (typeof OFFHANDS)[OffhandKind]][]).flatMap(([kind, o]) => o.drops.map(t => [`${kind} '${t.id}'`, t.invalidAffixes] as const)),
  ...JEWELRY_KINDS.flatMap(kind => JEWELRY[kind].map(t => [`${kind} '${t.id}'`, t.invalidAffixes] as const)),
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
  { element, affixes = true, starter = false, rarityWeights, partyLevel }: GenerateOptions & { element?: DamageElement } = {},
): WeaponItem {
  const data = WEAPON_TYPE_DATA[weaponType];
  const series = pickSeriesForLevel(starter ? STARTER_WEAPON_SERIES : WEAPON_SERIES, level);
  const m = series.damageMultiplier;
  const rolled = rollAffixes(weaponInvalidAffixes(weaponType), level, { enabled: affixes, rarityWeights, partyLevel, kind: data.twoHanded ? 'twoHand' : 'oneHand' });
  return {
    name: weaponName(series, weaponType),
    slot: 'mainhand',
    ...rolled,
    value: itemValue('weapon', series.valueMultiplier * data.value, rolled.rarity, starter),
    weaponType,
    attackCategory: data.defaultAttackCategory,
    // Its type's element, else one of the type's drop elements (any magic one, should a type list none)
    damageElement: element ?? data.defaultDamageElement ?? pick(data.dropElements ?? MAGIC_ELEMENTS),
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
  { affixes = true, starter = false, rarityWeights, partyLevel }: GenerateOptions = {},
): ArmorItem {
  const pool = starter ? STARTER_ARMOR_SERIES : ARMOR_SERIES;
  const series = pickSeriesForLevel(armorType ? pool.filter(s => s.armorType === armorType) : pool, level);
  const type = series.armorType;
  const typeData = ARMOR_TYPE_DATA[type];
  const rolled = rollAffixes(typeData.invalidAffixes, level, { enabled: affixes, rarityWeights, partyLevel, kind: 'armor' });
  return {
    id: newItemId(),
    name: armorName(series, slot),
    slot,
    ...rolled,
    value: itemValue('armor', series.valueMultiplier * ARMOR_SLOT_VALUE[slot], rolled.rarity, starter),
    armorType: type,
    level,
    armorValue: Math.round(typeData.baseArmor * level * BASE_ARMOR_MULTIPLIER[slot] * series.armorMultiplier),
    model: series.models[slot],
    implicit: resolveImplicit({ stat: typeData.implicit.stat, ...typeData.implicit.slots[slot] }, level),
  };
}

export function generateShield(
  level: number,
  armorType?: ArmorProficiency,
  { affixes = true, starter = false, rarityWeights, partyLevel }: GenerateOptions = {},
): ShieldItem {
  const pool = starter ? STARTER_SHIELDS : SHIELDS;
  const template = pickSeriesForLevel(armorType ? pool.filter(s => s.armorType === armorType) : pool, level);
  const typeData = ARMOR_TYPE_DATA[template.armorType];
  const rolled = rollAffixes(typeData.invalidAffixes, level, { enabled: affixes, rarityWeights, partyLevel, kind: 'oneHand' }); // an offhand
  return {
    id: newItemId(),
    name: template.name,
    slot: 'offhand',
    ...rolled,
    value: itemValue('shield', template.valueMultiplier, rolled.rarity, starter),
    armorType: template.armorType,
    level,
    armorValue: Math.round(typeData.baseArmor * level * SHIELD_ARMOR_MULTIPLIER * template.armorMultiplier),
    model: template.model,
    implicit: resolveImplicit(SHIELD_IMPLICIT, level),
  };
}

/** A quiver, a focus or another non-shield offhand of `offhandKind` (OFFHANDS: its drops, or its starting version). */
export function generateOffhand(
  offhandKind: OffhandKind,
  level: number,
  { affixes = true, starter = false, rarityWeights, partyLevel }: GenerateOptions = {},
): OffhandItem {
  const template = pickSeriesForLevel(starter ? OFFHANDS[offhandKind].starter : OFFHANDS[offhandKind].drops, level);
  const rolled = rollAffixes(template.invalidAffixes, level, { enabled: affixes, rarityWeights, partyLevel, kind: 'oneHand' }); // an offhand
  return {
    id: newItemId(),
    name: template.name,
    slot: 'offhand',
    offhandKind,
    ...rolled,
    value: itemValue(offhandKind, template.valueMultiplier, rolled.rarity, starter),
    level,
    model: template.model,
    implicit: resolveImplicit(template.implicit, level),
  };
}

/** A ring or an amulet of `kind`, of a type that can drop (jewelry.ts: one with a model). */
export function generateJewelry(
  kind: JewelryKind,
  level: number,
  { affixes = true, rarityWeights, partyLevel }: GenerateOptions = {},
): JewelryItem {
  const template = pickSeriesForLevel(droppableJewelry(kind), level);
  const rolled = rollAffixes(template.invalidAffixes, level, { enabled: affixes, rarityWeights, partyLevel, kind: 'armor' });
  return {
    id: newItemId(),
    name: template.name,
    slot: kind,
    ...rolled,
    value: itemValue(kind, template.valueMultiplier, rolled.rarity, false),
    level,
    model: template.model,
    implicit: resolveImplicit(template.implicit, level),
  };
}

// ─── Loot Drops ───────────────────────────────────────────────────────────────

type LootEntry =
  | { kind: 'weapon'; weaponType: WeaponType }
  | { kind: 'armor';  slot: ArmorSlot }
  | { kind: 'shield' }
  | { kind: 'offhand'; offhandKind: OffhandKind }
  | { kind: 'jewelry'; jewelryKind: JewelryKind };

const LOOT_POOL: LootEntry[] = [
  ...(Object.keys(WEAPON_TYPE_DATA) as WeaponType[]).map(weaponType => ({ kind: 'weapon' as const, weaponType })),
  ...ARMOR_SLOTS.map(slot => ({ kind: 'armor' as const, slot })),
  { kind: 'shield' },
  ...(Object.keys(OFFHANDS) as OffhandKind[]).map(offhandKind => ({ kind: 'offhand' as const, offhandKind })),
  // Rings and amulets, once a type of the kind has a model (jewelry.ts)
  ...JEWELRY_KINDS.filter(k => droppableJewelry(k).length > 0).map(jewelryKind => ({ kind: 'jewelry' as const, jewelryKind })),
];

/**
 * How much likelier a drop someone in the party can use (`usable`) is than one no one can: an unusable roll
 * is kept only 1 time in this many, else rolled again.
 */
export const USABLE_LOOT_WEIGHT = 4;

/**
 * A creature's loot drops, by `dropChance`: its whole part is that many guaranteed drops, its fraction the chance
 * of one more (0.3: a 30% chance of one; 1.2: one, and a 20% chance of a second; 2.1: two, and a 10% chance of a
 * third). Each is any weapon, armor piece, offhand (shield, quiver, focus) or piece of jewelry (ring, amulet). Items the party can use (`usable`,
 * e.g. someone is proficient) come up USABLE_LOOT_WEIGHT times as often as ones it can't.
 */
export function generateLootDrops(dungeonLevel: number, partyLevel: number, dropChance: number, usable?: (item: Item) => boolean): Item[] {
  return Array.from({ length: rollCount(dropChance) }, () => generateLootItem(dungeonLevel, { usable, partyLevel }));
}

/**
 * One piece of loot of item `level`: any weapon, armor piece, offhand (shield, quiver, focus) or jewelry. Items the party can use (`usable`)
 * come up USABLE_LOOT_WEIGHT times as often; `rarityWeights` replaces the level's rarity odds (a chest's).
 */
export function generateLootItem(level: number, { usable, rarityWeights, partyLevel }: { usable?: (item: Item) => boolean; rarityWeights?: Record<Rarity, number>; partyLevel?: number } = {}): Item {
  const roll = (): Item => {
    const entry = pick(LOOT_POOL);
    switch (entry.kind) {
      case 'weapon': return generateWeapon(level, entry.weaponType, { rarityWeights, partyLevel });
      case 'armor':  return generateArmor(level, entry.slot, undefined, { rarityWeights, partyLevel });
      case 'shield': return generateShield(level, undefined, { rarityWeights, partyLevel });
      case 'offhand': return generateOffhand(entry.offhandKind, level, { rarityWeights, partyLevel });
      case 'jewelry': return generateJewelry(entry.jewelryKind, level, { rarityWeights, partyLevel });
    }
  };
  for (;;) {
    const item = roll();
    if (!usable || usable(item) || chance(1 / USABLE_LOOT_WEIGHT)) return item;
  }
}
