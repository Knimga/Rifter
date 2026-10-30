// Armor data: what each armor type gives (ARMOR_TYPE_DATA), how much armor each slot gets (BASE_ARMOR_MULTIPLIER),
// and the armor series: the named sets of four pieces, one series per type and tier (ARMOR_SERIES).
// Like weapons, a piece is a type x tier: its type sets its stats, its series its name and model.
import type { BuffableStat } from '../units/stats';
import { damageTypeAffixes, meleeStats, rangedStats, type ArmorSlot } from './types';
import type { ArmorProficiency } from '../units/classes';
import type { ModelLink } from '../../forge/core/types';

// ─── Armor Types ──────────────────────────────────────────────────────────────

/** An implicit's value in one slot: baseValue at item level 1, + growthPerLevel per level above 1. */
export interface ArmorSlotScaling {
  baseValue: number;
  growthPerLevel: number;
}

/** Everything an armor type gives, whatever its series. */
export interface ArmorTypeData {
  /** Armor at item level 1 in the chest; other slots scale it by BASE_ARMOR_MULTIPLIER (shields by SHIELD_ARMOR_MULTIPLIER). Grows with item level. */
  baseArmor: number;
  /** The type's implicit: one stat, its value per slot (chest > helm/boots > gloves). */
  implicit: { stat: BuffableStat; slots: Record<ArmorSlot, ArmorSlotScaling> };
  /** Affixes armor (and shields) of this type never roll. */
  invalidAffixes: BuffableStat[];
}

export const ARMOR_TYPE_DATA: Record<ArmorProficiency, ArmorTypeData> = {
  Cloth: {
    baseArmor: 4,
    implicit: {
      stat: 'magicResistance',
      slots: {
        chest:  { baseValue: 5, growthPerLevel: 0.40 },
        helm:   { baseValue: 4, growthPerLevel: 0.30 },
        boots:  { baseValue: 3, growthPerLevel: 0.30 },
        gloves: { baseValue: 2, growthPerLevel: 0.20 },
      },
    },
    invalidAffixes: [
      'strength', 'finesse', 'block', 'parry', 'glancingBlow', 
      ...rangedStats, ...meleeStats, ...damageTypeAffixes(['physical','poison','nature']),
      'redoubt', 'expertise',
    ],
  },
  Light: {
    baseArmor: 7,
    implicit: {
      stat: 'dodge',
      slots: {
        chest:  { baseValue: 3, growthPerLevel: 0.40 },
        boots:  { baseValue: 2, growthPerLevel: 0.30 },
        helm:   { baseValue: 2, growthPerLevel: 0.20 },
        gloves: { baseValue: 1, growthPerLevel: 0.10 },
      },
    },
    invalidAffixes: [
      'magicHit', 'magicCrit', 'block', ...damageTypeAffixes(['holy'])
    ],
  },
  Medium: {
    baseArmor: 8,
    implicit: {
      stat: 'initiative',
      slots: {
        chest:  { baseValue: 3, growthPerLevel: 0.30 },
        helm:   { baseValue: 2, growthPerLevel: 0.20 },
        boots:  { baseValue: 2, growthPerLevel: 0.20 },
        gloves: { baseValue: 1, growthPerLevel: 0.10 },
      },
    },
    invalidAffixes: [...damageTypeAffixes(['holy'])],
  },
  Heavy: {
    baseArmor: 12,
    implicit: {
      stat: 'glancingBlow',
      slots: {
        chest:  { baseValue: 5, growthPerLevel: 0.40 },
        helm:   { baseValue: 3, growthPerLevel: 0.30 },
        boots:  { baseValue: 3, growthPerLevel: 0.30 },
        gloves: { baseValue: 2, growthPerLevel: 0.20 },
      },
    },
    invalidAffixes: [
      'finesse', 'evasion', 'subtlety', 'initiative', 'dodge', 
      ...rangedStats, ...damageTypeAffixes(['poison','shadow','ice'])
    ],
  },
};

/** Each slot's share of its type's baseArmor. */
export const BASE_ARMOR_MULTIPLIER: Record<ArmorSlot, number> = {
  chest:  1.00,
  helm:   0.65,
  boots:  0.45,
  gloves: 0.35,
};

/** Each slot's share of what a piece sells for (value.ts: a chest piece is the base). */
export const ARMOR_SLOT_VALUE: Record<ArmorSlot, number> = {
  chest:  1.0,
  helm:   0.7,
  boots:  0.6,
  gloves: 0.5,
};

// ─── Armor Series ─────────────────────────────────────────────────────────────

export interface ArmorSeries {
  id: string;
  name: string;               // e.g. 'Leather', 'Chainmail'
  armorType: ArmorProficiency;
  requiredLevel: number;
  /** Scales the armor its pieces give (the type's baseArmor x slot share); starting gear is 1.0. */
  armorMultiplier: number;
  /** Scales what its pieces sell for (value.ts): later tiers are worth more. Unused on starting gear (STARTER_VALUE). */
  valueMultiplier: number;
  names: Record<ArmorSlot, string>;   // item name per slot, after the series name: 'Apprentice Hood' (see armorName)
  // Each slot's forge design: how the item is drawn (icon and loot).
  models: Record<ArmorSlot, ModelLink>;
}

/** Display name of an armor piece: series name + the series' name for the slot, e.g. Apprentice + helm -> 'Apprentice Hood'. */
export function armorName(series: ArmorSeries, slot: ArmorSlot): string {
  return `${series.name} ${series.names[slot]}`;
}

/** Armor that drops as loot, by type and tier. */
export const ARMOR_SERIES: ArmorSeries[] = [
  // ── Cloth ─────────────────────────────────────────────────────────────────
  {
    id: 'apprentice', name: 'Apprentice', armorType: 'Cloth', requiredLevel: 1, armorMultiplier: 1.2, valueMultiplier: 1,
    names: { helm: 'Hood',     chest: 'Robes',      gloves: 'Handwraps', boots: 'Shoes'   },
    models: {
      helm:   'armor.apprentice-hood',
      chest:  'armor.apprentice-robes',
      gloves: 'armor.apprentice-handwraps',
      boots:  'armor.apprentice-shoes',
    },
  },

  // ── Light ─────────────────────────────────────────────────────────────────
  {
    id: 'leather', name: 'Leather', armorType: 'Light', requiredLevel: 1, armorMultiplier: 1.2, valueMultiplier: 1,
    names: { helm: 'Cap',         chest: 'Jerkin',        gloves: 'Gloves',  boots: 'Boots'       },
    models: {
      helm:   'armor.leather-cap',
      chest:  'armor.leather-jerkin',
      gloves: 'armor.leather-gloves',
      boots:  'armor.leather-boots',
    },
  },

  // ── Medium ────────────────────────────────────────────────────────────────
  {
    id: 'hide', name: 'Hide', armorType: 'Medium', requiredLevel: 1, armorMultiplier: 1.2, valueMultiplier: 1,
    names: { helm: 'Skullcap',  chest: 'Hauberk',        gloves: 'Gauntlets', boots: 'Boots' },
    models: {
      helm:   'armor.hide-skullcap',
      chest:  'armor.hide-hauberk',
      gloves: 'armor.hide-gauntlets',
      boots:  'armor.hide-boots',
    },
  },

  // ── Heavy ─────────────────────────────────────────────────────────────────
  {
    id: 'iron', name: 'Iron', armorType: 'Heavy', requiredLevel: 1, armorMultiplier: 1.2, valueMultiplier: 1.5,
    names: { helm: 'Helm',            chest: 'Breastplate',  gloves: 'Gauntlets', boots: 'Sabatons' },
    models: {
      helm:   'armor.iron-helm',
      chest:  'armor.iron-breastplate',
      gloves: 'armor.iron-gauntlets',
      boots:  'armor.iron-sabatons',
    },
  },
];

/** A starter version of a series: "Worn", weaker (armorMultiplier 1.0), drawn with the series' own models. */
const worn = (s: ArmorSeries): ArmorSeries => ({ ...s, id: `worn-${s.id}`, name: `Worn ${s.name}`, armorMultiplier: 1.0 });

/**
 * Starting gear only: never drops, so even a common first drop is an upgrade. A Worn version of each
 * armor type's first series (they have no designs of their own).
 */
export const STARTER_ARMOR_SERIES: ArmorSeries[] = ['apprentice', 'leather', 'hide', 'iron'].map((id) => worn(ARMOR_SERIES.find((s) => s.id === id)!));
