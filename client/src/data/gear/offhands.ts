// Offhand data: shields (one per armor type, from that type's armor data: ARMOR_TYPE_DATA), quivers (archers)
// and foci (casters).
import type { ArmorProficiency, WeaponProficiency } from '../units/classes';
import type { BuffableStat } from '../units/stats';
import type { ModelLink } from '../../forge/core/types';
import { damageTypeAffixes, meleeStats, rangedStats, type ImplicitDef, type OffhandKind } from './types';

export interface ShieldTemplate {
  id: string;                 // stable key; the forge design for this shield names it (offhands table)
  name: string;
  armorType: ArmorProficiency;
  requiredLevel: number;
  /** Scales its armor (the type's baseArmor x SHIELD_ARMOR_MULTIPLIER); starting gear is 1.0. */
  armorMultiplier: number;
  model: ModelLink;           // its forge design: how it is drawn (icon and loot)
}

/** A shield's share of its armor type's baseArmor (ARMOR_TYPE_DATA). */
export const SHIELD_ARMOR_MULTIPLIER = 0.80;

/** Shields that drop as loot. */
export const SHIELDS: ShieldTemplate[] = [
  { id: 'buckler',     requiredLevel: 1, armorType: 'Light',  armorMultiplier: 1.2, name: 'Buckler',     model: 'offhand.buckler' },
  { id: 'roundel',     requiredLevel: 1, armorType: 'Medium', armorMultiplier: 1.2, name: 'Roundel',     model: 'offhand.roundel' },
  { id: 'kite-shield', requiredLevel: 1, armorType: 'Heavy',  armorMultiplier: 1.2, name: 'Kite Shield', model: 'offhand.kite-shield' },
];

/**
 * Starting gear only: never drops, so even a common first drop is an upgrade. A Worn version of each
 * shield, weaker, drawn with its model (they have no designs of their own).
 */
export const STARTER_SHIELDS: ShieldTemplate[] = SHIELDS.map((s) => ({ ...s, id: `worn-${s.id}`, name: `Worn ${s.name}`, armorMultiplier: 1.0 }));

export const SHIELD_IMPLICIT: ImplicitDef = {
  stat: 'block',
  baseValue: 5,
  growthPerLevel: 0.2,
};

// ─── Quivers and foci ─────────────────────────────────────────────────────────
// Offhands that aren't shields (OffhandKind): no armor type and no armor, an implicit of their own. Each kind
// needs its own proficiency (OFFHAND_PROFICIENCY) and has its drops and its starting version (OFFHANDS).

/** One quiver, focus or other non-shield offhand. */
export interface OffhandTemplate {
  id: string;                 // stable key; the forge design for it names it (offhands table)
  name: string;
  requiredLevel: number;
  implicit: ImplicitDef;
  /** Affixes it never rolls. */
  invalidAffixes: BuffableStat[];
  model: ModelLink;           // its forge design: how it is drawn (icon and loot); '' while it has none
}

/** The proficiency each kind of offhand needs. */
export const OFFHAND_PROFICIENCY: Record<OffhandKind, WeaponProficiency> = { quiver: 'Quivers', focus: 'Foci' };
/** Each kind's name, as items show it (tooltips). */
export const OFFHAND_KIND_NAME: Record<OffhandKind, string> = { quiver: 'Quiver', focus: 'Focus' };
/** Proficiencies for offhands rather than weapons: shields, and every kind above. */
export const OFFHAND_PROFICIENCIES: readonly WeaponProficiency[] = ['Shields', ...Object.values(OFFHAND_PROFICIENCY)];

const QUIVER_INVALID_AFFIXES: BuffableStat[] = [
  ...meleeStats,
  'magicHit', 'magicCrit',  ...damageTypeAffixes(['magic'], { only: ['Hit', 'Crit'] }),
  'parry', 'healing', 'block', 'spellcraft', 'strength'
];

const FOCUS_INVALID_AFFIXES: BuffableStat[] = [
  ...meleeStats, ...rangedStats, 'strength', 'finesse', 'toughness',
  'redoubt', 'expertise', 'parry', 'block', ...damageTypeAffixes(['physical','poison']),
];

/** Quivers that drop as loot. */
export const QUIVERS: OffhandTemplate[] = [
  {
    id: 'leather-quiver', name: 'Leather Quiver', requiredLevel: 1,
    implicit: { stat: 'rangedDamage', baseValue: 2, growthPerLevel: 0 },
    invalidAffixes: QUIVER_INVALID_AFFIXES,
    model: 'offhand.leather-quiver',
  },
];

/** Starting gear only: never drops, so even a common first drop is an upgrade (+1 ranged damage, not +2). */
export const STARTER_QUIVERS: OffhandTemplate[] = [
  {
    id: 'worn-quiver', name: 'Worn Quiver', requiredLevel: 1,
    implicit: { stat: 'rangedDamage', baseValue: 1, growthPerLevel: 0 },
    invalidAffixes: QUIVER_INVALID_AFFIXES,
    model: 'offhand.leather-quiver', // the Leather Quiver's (starting gear borrows the model of what it is a worn version of)
  },
];

/** Foci that drop as loot. */
export const FOCI: OffhandTemplate[] = [
  {
    id: 'keen-amethyst', name: 'Keen Amethyst', requiredLevel: 1,
    implicit: { stat: 'spellcraft', baseValue: 2, growthPerLevel: 0 },
    invalidAffixes: FOCUS_INVALID_AFFIXES,
    model: 'offhand.keen-amethyst',
  },
];

/** Starting gear only: never drops, so even a common first drop is an upgrade (+1 spellcraft, not +2). */
export const STARTER_FOCI: OffhandTemplate[] = [
  {
    id: 'cracked-amethyst', name: 'Cracked Amethyst', requiredLevel: 1,
    implicit: { stat: 'spellcraft', baseValue: 1, growthPerLevel: 0 },
    invalidAffixes: [],
    model: 'offhand.keen-amethyst', // the Keen Amethyst's (starting gear borrows the model of what it is a worn version of)
  },
];

/** Each kind of non-shield offhand: the ones that drop, and the starting gear version (its starting offhand). */
export const OFFHANDS: Record<OffhandKind, { drops: OffhandTemplate[]; starter: OffhandTemplate[] }> = {
  quiver: { drops: QUIVERS, starter: STARTER_QUIVERS },
  focus: { drops: FOCI, starter: STARTER_FOCI },
};
