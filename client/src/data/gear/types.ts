import type { ArmorProficiency, WeaponProficiency } from '../units/classes';
import type { BuffableStat, DamageElement } from '../units/stats';
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
  stat: BuffableStat;
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

export type WeaponType = Exclude<WeaponProficiency, 'Shields'>;
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

/** An item's rarity: how many affixes it has (affixes.ts RarityPerAffixCount, where its odds are tuned too). */
export type Rarity = 'Common' | 'Quality' | 'Superior' | 'Rare' | 'Exquisite';
