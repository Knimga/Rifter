import type { ArmorProficiency, WeaponProficiency } from '../units/classes';
import { DAMAGE_ELEMENTS, type BuffableStat, type DamageElement, type ElementStatSuffix } from '../units/stats';
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

/** The kinds of offhand that aren't shields (offhands.ts OFFHANDS): an archer's quiver, a caster's focus. */
export type OffhandKind = 'quiver' | 'focus';

/** An offhand that isn't a shield (a quiver, a focus): no armor type and no armor; its stats are its implicit and affixes. */
export interface OffhandItem extends Item {
  slot: 'offhand';
  offhandKind: OffhandKind;
}

/** Weapon proficiencies that are weapons (mainhand), not offhands. */
export type WeaponType = Exclude<WeaponProficiency, 'Shields' | 'Quivers' | 'Foci'>;
export type AttackCategory = 'melee' | 'ranged' | 'magic';

/** The physical damage elements (armor defends against them, not magic resistance): just 'physical'. */
export const PHYSICAL_ELEMENTS: ReadonlySet<DamageElement> = new Set(['physical']);
/** Every damage element that isn't physical: fire, ice, lightning, shadow, poison, holy, nature. */
export const MAGIC_ELEMENTS: readonly DamageElement[] = DAMAGE_ELEMENTS.filter((el) => !PHYSICAL_ELEMENTS.has(el));

export const nonWeaponAffixes: BuffableStat[] = ['armor', 'block', 'hpRegen', 'mpRegen'];
export const rangedStats: BuffableStat[] = ['rangedCrit', 'rangedDamage', 'rangedHit', 'rangedPenetration'];
export const magicStats: BuffableStat[] = ['magicCrit', 'magicDamage', 'magicHit', 'magicPenetration'];
export const meleeStats: BuffableStat[] = ['meleeCrit', 'meleeDamage', 'meleeHit', 'meleePenetration'];
/** Which damage elements an affix list covers: one, several, or a whole group. */
/** A damage type to select: one element ('fire', 'physical'), or a group: 'magic' (every non-physical one) or 'all'. */
export type DamageTypeSelector = DamageElement | 'magic' | 'all';

/** An element's offense stats: what damageTypeAffixes covers unless told otherwise (resistance is defense). */
const OFFENSE_SUFFIXES: readonly ElementStatSuffix[] = ['Damage', 'Hit', 'Crit', 'Penetration'];

/**
 * Element affixes, for the chosen damage types and stats (for invalidAffixes lists and the like):
 * - `types`: the damage types, each an element or a group ('magic', 'all'), e.g. ['physical', 'holy']
 * - `only` / `except`: which of the element stats (Damage, Hit, Crit, Penetration, Resistance). By default
 *   the offense ones (all but Resistance).
 * e.g. damageTypeAffixes(['physical']); damageTypeAffixes(['magic'], { only: ['Crit', 'Hit'] });
 * damageTypeAffixes(['fire', 'ice'], { except: ['Damage'] }); damageTypeAffixes(['all'], { only: ['Resistance'] })
 */
export function damageTypeAffixes(
  types: readonly DamageTypeSelector[],
  { only, except = [] }: { only?: readonly ElementStatSuffix[]; except?: readonly ElementStatSuffix[] } = {},
): BuffableStat[] {
  const elements = new Set(types.flatMap((t): readonly DamageElement[] =>
    t === 'all' ? DAMAGE_ELEMENTS : t === 'magic' ? MAGIC_ELEMENTS : [t]));
  const suffixes = (only ?? OFFENSE_SUFFIXES).filter((s) => !except.includes(s));
  return [...elements].flatMap((el) => suffixes.map((s) => `${el}${s}` as const));
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
}

export type GearSlots = Record<GearSlot, Item | null>;

// ─── Affixes & Rarity ──────────────────────────────────────────────────────────

export interface Affix {
  stat: BuffableStat;
  value: number;
  /**
   * The affix's tier (1..MAX_TIER), rolled from the party level when the item was made; its value lies in that
   * tier's range (affixes.ts). Kept for crafting (upgrading a tier, within tierSumCap). None on implicits.
   */
  tier?: number;
}

/** An item's rarity: how many affixes it has (affixes.ts RarityPerAffixCount, where its odds are tuned too). */
export type Rarity = 'Common' | 'Quality' | 'Superior' | 'Rare' | 'Exquisite';
