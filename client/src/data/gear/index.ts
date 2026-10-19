import type { ArmorProficiency } from '../classes';

export * from './types';
export type { DamageElement } from '../stats';
export { DAMAGE_ELEMENTS } from '../stats';
import { BUFFABLE_STATS, DAMAGE_ELEMENTS } from '../stats';
import type { DamageElement, BuffableStat, ActiveBuff } from '../stats';
import type { ArmorSlot, WeaponType, GearSlots, Item, ArmorItem, ShieldItem, WeaponItem, Affix, Rarity, ImplicitDef } from './types';
import { ARMOR_SLOTS, GEAR_SLOTS, PHYSICAL_ELEMENTS, RARITY_TILT_PER_LEVEL, RARITY_WEIGHT, RarityPerAffixCount } from './types';

import { ARMOR_TYPE_BASE_VALUE, ARMOR_SLOT_MULTIPLIER, ARMOR_INVALID_AFFIXES, ARMOR_SERIES, ARMOR_IMPLICITS, armorName } from './armor';
import { SHIELD_ARMOR_MULTIPLIER, SHIELDS, SHIELD_IMPLICIT } from './offhands';
import { WEAPON_SERIES, WEAPON_TYPE_DATA, weaponName } from './weapons';
import { AFFIX_ROLLS, rollAffixValue } from './affixes';
import { chance, pick, pickWeighted } from '../random';

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
// One generator per item kind, used for both starting gear (affixes: false) and loot drops.

interface GenerateOptions {
  affixes?: boolean;  // roll random affixes (default true); starting gear has none
}

/** Pick a series within ±3 levels; fall back to the nearest one below. */
function pickSeriesForLevel<T extends { requiredLevel: number }>(series: T[], level: number): T {
  const inRange = series.filter(s => Math.abs(s.requiredLevel - level) <= 3);
  if (inRange.length > 0) return pick(inRange);
  const below = series.filter(s => s.requiredLevel < level - 3).sort((a, b) => b.requiredLevel - a.requiredLevel);
  return below[0] ?? series[0];
}

function resolveImplicit(def: ImplicitDef, level: number): Affix {
  return { stat: def.statKey, value: Math.round(def.baseValue + def.growthPerLevel * (level - 1)) };
}

/** Each rarity's chance weight for an item of `level` (RARITY_WEIGHT, tilted toward rarer by RARITY_TILT_PER_LEVEL). */
export function rarityWeights(level: number): Record<Rarity, number> {
  const tilt = RARITY_TILT_PER_LEVEL * Math.max(0, level - 1);
  return Object.fromEntries(
    Object.entries(RarityPerAffixCount).map(([count, rarity]) => [rarity, RARITY_WEIGHT[rarity] * (1 + tilt * Number(count))]),
  ) as Record<Rarity, number>;
}

/**
 * An item's rarity and affixes: the rarity is rolled first (rarityWeights), and the item gets that many
 * affixes (RarityPerAffixCount). Disabled (starting gear) = Common, no affixes.
 */
function rollAffixes(invalidAffixes: BuffableStat[], level: number, enabled: boolean): { affixes: Affix[]; rarity: Rarity } {
  const affixes: Affix[] = [];
  if (enabled) {
    const weights = rarityWeights(level);
    const rarity = pickWeighted(Object.keys(weights) as Rarity[], r => weights[r]);
    const count = Number(Object.keys(RarityPerAffixCount).find(c => RarityPerAffixCount[Number(c)] === rarity));
    const invalid = new Set(invalidAffixes);
    const used = new Set<BuffableStat>();
    while (affixes.length < count) {
      const available = BUFFABLE_STATS.filter(s => !invalid.has(s) && !used.has(s));
      if (available.length === 0) break;
      const stat = pickWeighted(available, s => AFFIX_ROLLS[s].weight ?? 1);
      used.add(stat);
      affixes.push({ stat, value: rollAffixValue(stat, level) });
    }
  }
  return { affixes, rarity: RarityPerAffixCount[affixes.length] };
}

let itemCounter = 0;
/** A unique item id. */
const newItemId = () => `item-${Date.now().toString(36)}-${(itemCounter++).toString(36)}`;

export function generateWeapon(
  level: number,
  weaponType: WeaponType,
  { element, affixes = true }: GenerateOptions & { element?: DamageElement } = {},
): WeaponItem {
  const data = WEAPON_TYPE_DATA[weaponType]!;
  const series = pickSeriesForLevel(WEAPON_SERIES, level);
  const m = series.damageMultiplier;
  return {
    name: weaponName(series, weaponType),
    slot: 'mainhand',
    ...rollAffixes(data.invalidAffixes, level, affixes),
    weaponType,
    attackCategory: data.defaultAttackCategory,
    damageElement: element ?? data.defaultDamageElement ?? pick(MAGIC_ELEMENTS),
    level,
    minDamage: Math.max(1, Math.round(data.baseDamage.min * m)),
    maxDamage: Math.max(1, Math.round(data.baseDamage.max * m)),
    range: data.range,
    id: newItemId(),
    model: series.weapons[weaponType]!.model,
    implicit: data.implicits ? resolveImplicit(data.implicits, level) : undefined,
  };
}

export function generateArmor(
  level: number,
  slot: ArmorSlot,
  armorType?: ArmorProficiency,
  { affixes = true }: GenerateOptions = {},
): ArmorItem {
  const series = pickSeriesForLevel(armorType ? ARMOR_SERIES.filter(s => s.armorType === armorType) : ARMOR_SERIES, level);
  const type = series.armorType;
  const implicitDef = ARMOR_IMPLICITS[type];
  return {
    id: newItemId(),
    name: armorName(series, slot),
    slot,
    ...rollAffixes(ARMOR_INVALID_AFFIXES[type], level, affixes),
    armorType: type,
    armorValue: Math.round(ARMOR_TYPE_BASE_VALUE[type] * level * ARMOR_SLOT_MULTIPLIER[slot]),
    model: series.models[slot],
    implicit: resolveImplicit({ statKey: implicitDef.statKey, ...implicitDef.slots[slot] }, level),
  };
}

export function generateShield(
  level: number,
  armorType?: ArmorProficiency,
  { affixes = true }: GenerateOptions = {},
): ShieldItem {
  const template = pickSeriesForLevel(armorType ? SHIELDS.filter(s => s.type === armorType) : SHIELDS, level);
  return {
    id: newItemId(),
    name: template.name,
    slot: 'offhand',
    ...rollAffixes(ARMOR_INVALID_AFFIXES[template.type], level, affixes),
    armorType: template.type,
    armorValue: Math.round(ARMOR_TYPE_BASE_VALUE[template.type] * level * SHIELD_ARMOR_MULTIPLIER),
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

export function generateLootDrop(dungeonLevel: number, dropChance = LOOT_DROP_CHANCE): Item | null {
  if (!chance(dropChance)) return null;
  const entry = pick(LOOT_POOL);
  switch (entry.kind) {
    case 'weapon': return generateWeapon(dungeonLevel, entry.weaponType);
    case 'armor':  return generateArmor(dungeonLevel, entry.slot);
    case 'shield': return generateShield(dungeonLevel);
  }
}
