import type { ArmorProficiency, WeaponProficiency } from '../classes';
import type { BuffableStat, DamageElement } from '../stats';
import type { ModelLink } from '../../forge/core/types';

// ─── Slots ────────────────────────────────────────────────────────────────────

export type ArmorSlot = 'helm' | 'chest' | 'gloves' | 'boots';
export type WeaponSlot = 'mainhand' | 'offhand';
export type GearSlot = ArmorSlot | WeaponSlot;

export const ARMOR_SLOTS: ArmorSlot[] = ['helm', 'chest', 'gloves', 'boots'];
export const GEAR_SLOTS: GearSlot[] = ['helm', 'chest', 'gloves', 'boots', 'mainhand', 'offhand'];

// ─── Item Interfaces ──────────────────────────────────────────────────────────

/** Implicit template: value = baseValue + growthPerLevel × (item level − 1), rounded. */
export interface ImplicitDef {
  statKey: BuffableStat;
  baseValue: number;
  growthPerLevel: number;
}

export interface Item {
  /** Unique per item. */
  id: string;
  name: string;
  slot: GearSlot;
  rarity: Rarity;
  affixes: Affix[];
  implicit?: Affix;       // fixed bonus from the base type; counts toward stats like an affix
  /** The forge design it is drawn with (inventory icon, loot on the map), from its data entry. */
  model: ModelLink;
}

export interface ArmorItem extends Item {
  slot: ArmorSlot;
  armorType: ArmorProficiency;
  armorValue: number;
}

export interface ShieldItem extends Item {
  slot: 'offhand';
  armorType: ArmorProficiency;
  armorValue: number;
}

export type WeaponType = Exclude<WeaponProficiency, 'Shields'> | 'Unarmed';
export type AttackCategory = 'melee' | 'ranged' | 'magic';

export const PHYSICAL_ELEMENTS: ReadonlySet<DamageElement> = new Set([
  'slashing', 'piercing', 'bludgeoning',
]);

export const nonWeaponAffixes: BuffableStat[] = ['armor', 'block', 'hpRegen', 'mpRegen'];
export const rangedStats: BuffableStat[] = ['rangedCrit', 'rangedDamage', 'rangedHit', 'rangedPenetration'];
export const magicStats: BuffableStat[] = ['magicCrit', 'magicDamage', 'magicHit', 'magicPenetration'];
export const meleeStats: BuffableStat[] = ['meleeCrit', 'meleeDamage', 'meleeHit', 'meleePenetration'];

export interface WeaponItem extends Item {
  slot: 'mainhand';
  weaponType: WeaponType;
  attackCategory: AttackCategory;
  damageElement: DamageElement;
  level: number;
  minDamage: number;
  maxDamage: number;
  range: number;
}

export type GearSlots = Record<GearSlot, Item | null>;

// ─── Affixes & Rarity ──────────────────────────────────────────────────────────

export interface Affix {
  stat: BuffableStat;
  value: number;
}

export type Rarity = 'Common' | 'Quality' | 'Superior' | 'Rare' | 'Exquisite';

/** A rarity is its number of affixes: Common has none, Exquisite 4. */
export const RarityPerAffixCount: Record<number, Rarity> = {
  0: 'Common',
  1: 'Quality',
  2: 'Superior',
  3: 'Rare',
  4: 'Exquisite'
}

/**
 * How likely each rarity is for a rolled item (relative weights) at item level 1. Higher levels tilt
 * toward the rarer end: see RARITY_TILT_PER_LEVEL and rarityWeights (data/gear/index.ts).
 */
export const RARITY_WEIGHT: Record<Rarity, number> = {
  Common: 45,
  Quality: 30,
  Superior: 15,
  Rare: 5,
  Exquisite: 5,
};

/**
 * Per item level above 1, each rarity's weight grows by this × its affix count (Common 0 ... Exquisite 4),
 * so the odds slowly shift from Common toward the rarer end. 0.04 → Common ~34% at level 10, ~26% at 20.
 */
export const RARITY_TILT_PER_LEVEL = 0.04;

export const RarityTextColors: Record<Rarity, string> = { //hex codes
  Common: 'white',
  Quality: 'lightblue',
  Superior: 'royalblue',
  Rare: 'slateblue',
  Exquisite: 'mediumturquoise'
}
