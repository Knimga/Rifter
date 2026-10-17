import type { IconType } from 'react-icons';
import type { ArmorProficiency, WeaponProficiency } from '../classes';
import type { BuffableStat, DamageElement } from '../stats';

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
  name: string;
  slot: GearSlot;
  rarity: Rarity;
  affixes: Affix[];
  implicit?: Affix;       // fixed bonus from the base type; counts toward stats like an affix
}

export interface ArmorItem extends Item {
  slot: ArmorSlot;
  armorType: ArmorProficiency;
  armorValue: number;
  icon?: IconType;
}

export interface ShieldItem extends Item {
  slot: 'offhand';
  armorType: ArmorProficiency;
  armorValue: number;
  iconPath?: string;
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
  iconPath?: string;
}

export type GearSlots = Record<GearSlot, Item | null>;

// ─── Affixes & Rarity ──────────────────────────────────────────────────────────

export interface Affix {
  stat: BuffableStat;
  value: number;
}

export type Rarity = 'Common' | 'Quality' | 'Superior' | 'Rare' | 'Exquisite';

export const RarityPerAffixCount: Record<number, Rarity> = {
  0: 'Common',
  1: 'Quality',
  2: 'Superior',
  3: 'Rare',
  4: 'Exquisite'
}

export const RarityTextColors: Record<Rarity, string> = { //hex codes
  Common: 'white',
  Quality: 'lightblue',
  Superior: 'royalblue',
  Rare: 'slateblue',
  Exquisite: 'mediumturquoise'
}

export type AffixPotency = 'low' | 'medium' | 'high';
