import type { IconType } from 'react-icons';
import type { ArmorProficiency, WeaponProficiency } from '../classes';
import { BuffableStat } from '../stats';

// ─── Slots ────────────────────────────────────────────────────────────────────

export type ArmorSlot = 'helm' | 'chest' | 'gloves' | 'boots';
export type WeaponSlot = 'mainhand' | 'offhand';
export type GearSlot = ArmorSlot | WeaponSlot;

export const ARMOR_SLOTS: ArmorSlot[] = ['helm', 'chest', 'gloves', 'boots'];
export const GEAR_SLOTS: GearSlot[] = ['helm', 'chest', 'gloves', 'boots', 'mainhand', 'offhand'];

// ─── Item Interfaces ──────────────────────────────────────────────────────────

export interface Item {
  name: string;
  slot: GearSlot;
}

export interface ArmorItem extends Item {
  slot: ArmorSlot;
  armorType: ArmorProficiency;
  armorValue: number;
  magicResistance?: number;
  icon?: IconType;
  implicit?: WeaponImplicit;
}

export interface ShieldItem extends Item {
  slot: 'offhand';
  armorType: ArmorProficiency;
  armorValue: number;
  iconPath?: string;
  implicit?: WeaponImplicit;
}

export type WeaponType = Exclude<WeaponProficiency, 'Shields'> | 'Unarmed';
export type AttackCategory = 'melee' | 'ranged' | 'magic';
export type DamageElement =
  | 'slashing' | 'piercing' | 'bludgeoning'
  | 'fire' | 'ice' | 'lightning' | 'shadow' | 'poison' | 'holy' | 'nature';

export const DAMAGE_ELEMENTS: DamageElement[] = [
  'slashing', 'piercing', 'bludgeoning',
  'fire', 'ice', 'lightning', 'shadow', 'poison', 'holy', 'nature',
];

export const PHYSICAL_ELEMENTS: ReadonlySet<DamageElement> = new Set([
  'slashing', 'piercing', 'bludgeoning',
]);


/* 
const PHYSICAL_ELEMENT_ARRAY: DamageElement[] = ['slashing', 'piercing', 'bludgeoning'];
const MAGIC_ELEMENT_ARRAY: DamageElement[] = ['fire', 'ice', 'lightning', 'shadow', 'poison', 'holy', 'nature'];

const toAffixes = (els: DamageElement[]): string[] => els.flatMap(el => [
  `${el}Hit`, `${el}Crit`, `${el}Damage`, `${el}Resistance`, `${el}Penetration`,
]);

// All per-element BuffableStat keys — useful for permittedAffixes arrays on gear.
export const ALL_ELEMENT_AFFIXES: string[]      = toAffixes(DAMAGE_ELEMENTS);
export const PHYSICAL_ELEMENT_AFFIXES: string[] = toAffixes(PHYSICAL_ELEMENT_ARRAY);
export const MAGIC_ELEMENT_AFFIXES: string[]    = toAffixes(MAGIC_ELEMENT_ARRAY); 
*/


export const nonWeaponAffixes: BuffableStat[] = ['armor', 'block', 'hpRegen', 'mpRegen'];
export const rangedStats: BuffableStat[] = ['rangedCrit', 'rangedDamage', 'rangedHit', 'rangedPenetration'];
export const magicStats: BuffableStat[] = ['magicCrit', 'magicDamage', 'magicHit', 'magicPenetration'];
export const meleeStats: BuffableStat[] = ['meleeCrit', 'meleeDamage', 'meleeHit', 'meleePenetration'];


// Resolved implicit on a generated weapon item.
// statKey is always a BuffableStat at runtime; typed as string here to avoid
// a circular dependency (stats.ts imports from gear/).
export interface WeaponImplicit {
  statKey: string;
  value: number;
  displayValue: string;  // pre-formatted for tooltip, e.g. '+12% Critical Strike Chance'
}

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
  implicit?: WeaponImplicit;
}

export type GearSlots = Record<GearSlot, Item | null>;
