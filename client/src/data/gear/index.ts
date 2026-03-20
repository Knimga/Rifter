import { GiEdgedShield } from 'react-icons/gi';
import type { IconType } from 'react-icons';
import type { ArmorProficiency } from '../classes';

export * from './types';
import type {
  ArmorSlot, WeaponType, DamageElement, GearSlots,
  Item, ArmorItem, ShieldItem, WeaponItem,
} from './types';
import { ARMOR_SLOTS } from './types';

import { ARMOR_TYPE_BASE_VALUE, ARMOR_SLOT_MULTIPLIER } from './armor';
import { SHIELD_ARMOR_MULTIPLIER, SHIELDS, SHIELD_IMPLICIT } from './offhands';

const MAGIC_ELEMENTS: DamageElement[] = [
  'fire', 'ice', 'lightning', 'shadow', 'poison', 'holy', 'nature',
];

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

export function getGearArmorBonus(gear: GearSlots): number {
  const fromArmor = ARMOR_SLOTS.reduce((total, slot) => {
    const item = gear[slot];
    return total + (item && isArmorItem(item) ? item.armorValue : 0);
  }, 0);
  const offhand = gear.offhand;
  const fromShield = offhand && isShieldItem(offhand) ? offhand.armorValue : 0;
  return fromArmor + fromShield;
}





export function generateArmorItem(
  slot: ArmorSlot,
  level: number,
  armorType: ArmorProficiency
): ArmorItem {
  const series = ARMOR_SERIES.filter(s => s.armorType === armorType)
    .sort((a, b) => a.requiredLevel - b.requiredLevel)[0] ?? ARMOR_SERIES[0];
  return {
    name: series.names[slot],
    slot,
    armorType,
    armorValue: ARMOR_TYPE_BASE_VALUE[armorType] * level * ARMOR_SLOT_MULTIPLIER[slot],
    icon: series.icons[slot],
  };
}

export function generateShieldItem(
  level: number,
  armorType: ArmorProficiency
): ShieldItem {
  const template = SHIELDS.find(s => s.type === armorType) ?? SHIELDS[0];
  return {
    name: template.name,
    slot: 'offhand',
    armorType,
    armorValue: ARMOR_TYPE_BASE_VALUE[armorType] * level * SHIELD_ARMOR_MULTIPLIER,
    iconPath: template.icon,
  };
}

// ─── Weapon Generation ────────────────────────────────────────────────────────

export const SHIELD_ICON: IconType = GiEdgedShield;

import { WEAPON_SERIES, WEAPON_TYPE_DATA } from './weapons';
import { ARMOR_SERIES, ARMOR_IMPLICITS } from './armor';

export function generateWeaponItem(
  level: number,
  weaponType: WeaponType,
  element?: DamageElement
): WeaponItem {
  const series = WEAPON_SERIES.find(s => s.id === 'plain') ?? WEAPON_SERIES[0];
  const data = WEAPON_TYPE_DATA[weaponType]!;
  const m = series.damageMultiplier;
  const damageElement = element
    ?? data.defaultDamageElement
    ?? MAGIC_ELEMENTS[Math.floor(Math.random() * MAGIC_ELEMENTS.length)];

  return {
    name: series.weapons[weaponType]?.name ?? weaponType,
    slot: 'mainhand',
    weaponType,
    attackCategory: data.defaultAttackCategory,
    damageElement,
    level,
    minDamage: Math.max(1, Math.round(data.baseDamage.min * m)),
    maxDamage: Math.max(1, Math.round(data.baseDamage.max * m)),
    range: data.range,
    iconPath: series.weapons[weaponType]?.icon,
  };
}

// ─── Loot Drop Generation ─────────────────────────────────────────────────────

export const LOOT_DROP_CHANCE = 0.10;
const WEAPON_LOOT_WEIGHT = 0.30; // 30% weapon, 10% shield, 60% armor
const SHIELD_LOOT_WEIGHT = 0.10;

/** Pick a series within ±3 dungeon levels; fall back to the nearest one below. */
function pickSeriesForLevel<T extends { requiredLevel: number }>(series: T[], dungeonLevel: number): T {
  const inRange = series.filter(s => Math.abs(s.requiredLevel - dungeonLevel) <= 3);
  if (inRange.length > 0) return inRange[Math.floor(Math.random() * inRange.length)];
  const below = series.filter(s => s.requiredLevel < dungeonLevel - 3).sort((a, b) => b.requiredLevel - a.requiredLevel);
  return below[0] ?? series[0];
}

/** Compute an implicit's resolved value at a given dungeon level. */
function resolveImplicit(def: { statKey: string; baseValue: number; growthPerLevel: number }, dungeonLevel: number) {
  const value = Math.round(def.baseValue + def.growthPerLevel * (dungeonLevel - 1));
  return { statKey: def.statKey, value, displayValue: `${value}` };
}

export function generateWeaponDrop(dungeonLevel: number): WeaponItem {
  const droppableTypes = Object.keys(WEAPON_TYPE_DATA) as WeaponType[];
  const weaponType = droppableTypes[Math.floor(Math.random() * droppableTypes.length)];
  const data = WEAPON_TYPE_DATA[weaponType]!;
  const series = pickSeriesForLevel(WEAPON_SERIES, dungeonLevel);
  const m = series.damageMultiplier;
  const damageElement = data.defaultDamageElement
    ?? MAGIC_ELEMENTS[Math.floor(Math.random() * MAGIC_ELEMENTS.length)];

  return {
    name: series.weapons[weaponType]?.name ?? weaponType,
    slot: 'mainhand',
    weaponType,
    attackCategory: data.defaultAttackCategory,
    damageElement,
    level: dungeonLevel,
    minDamage: Math.max(1, Math.round(data.baseDamage.min * m)),
    maxDamage: Math.max(1, Math.round(data.baseDamage.max * m)),
    range: data.range,
    iconPath: series.weapons[weaponType]?.icon,
    implicit: data.implicits ? resolveImplicit(data.implicits, dungeonLevel) : undefined,
  };
}

export function generateArmorDrop(dungeonLevel: number): ArmorItem {
  const series = pickSeriesForLevel(ARMOR_SERIES, dungeonLevel);
  const slot = ARMOR_SLOTS[Math.floor(Math.random() * ARMOR_SLOTS.length)];
  const { armorType } = series;
  const implicitDef = ARMOR_IMPLICITS[armorType];
  const slotScaling = implicitDef.slots[slot];

  return {
    name: series.names[slot],
    slot,
    armorType,
    armorValue: ARMOR_TYPE_BASE_VALUE[armorType] * dungeonLevel * ARMOR_SLOT_MULTIPLIER[slot],
    icon: series.icons[slot],
    implicit: resolveImplicit({ ...implicitDef, ...slotScaling }, dungeonLevel),
  };
}

export function generateShieldDrop(dungeonLevel: number): ShieldItem {
  const eligible = SHIELDS.filter(s => s.type !== 'Cloth');
  const template = pickSeriesForLevel(eligible.map(s => ({ ...s, requiredLevel: s.level })), dungeonLevel);
  return {
    name: template.name,
    slot: 'offhand',
    armorType: template.type,
    armorValue: ARMOR_TYPE_BASE_VALUE[template.type] * dungeonLevel * SHIELD_ARMOR_MULTIPLIER,
    iconPath: template.icon,
    implicit: resolveImplicit(SHIELD_IMPLICIT, dungeonLevel),
  };
}

export function generateLootDrop(dungeonLevel: number, dropChance = LOOT_DROP_CHANCE): Item | null {
  if (Math.random() >= dropChance) return null;
  const roll = Math.random();
  if (roll < WEAPON_LOOT_WEIGHT) return generateWeaponDrop(dungeonLevel);
  if (roll < WEAPON_LOOT_WEIGHT + SHIELD_LOOT_WEIGHT) return generateShieldDrop(dungeonLevel);
  return generateArmorDrop(dungeonLevel);
}
