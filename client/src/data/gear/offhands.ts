// Offhand data: shields (one per armor type, from that type's armor data: ARMOR_TYPE_DATA). Later: foci for
// casters, quivers for archers.
import type { ArmorProficiency } from '../units/classes';
import type { ModelLink } from '../../forge/core/types';
import type { ImplicitDef } from './types';

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
