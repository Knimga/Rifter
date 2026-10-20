// Static armor data for the armor drop generator.
import type { BuffableStat } from '../stats';
import { rangedStats, type ArmorSlot } from './types';
import type { ArmorProficiency } from '../classes';
import type { ModelLink } from '../../forge/core/types';

// ─── Armor Generation ─────────────────────────────────────────────────────────

export const ARMOR_TYPE_BASE_VALUE: Record<ArmorProficiency, number> = {
  Cloth: 4,
  Light: 7,
  Medium: 8,
  Heavy: 12,
};

export const ARMOR_SLOT_MULTIPLIER: Record<ArmorSlot, number> = {
  chest:  1.00,
  //shield: 0.80
  helm:   0.65,
  boots:  0.45,
  gloves: 0.35,
};

// ─── Armor Series ─────────────────────────────────────────────────────────────

export interface ArmorSeries {
  id: string;
  name: string;               // e.g. 'Leather', 'Chainmail'
  armorType: ArmorProficiency;
  requiredLevel: number;
  names: Record<ArmorSlot, string>;   // item name per slot, after the series name: 'Apprentice Hood' (see armorName)
  // Each slot's forge design: how the item is drawn (icon and loot).
  models: Record<ArmorSlot, ModelLink>;
}

/** Display name of an armor piece: series name + the series' name for the slot, e.g. Apprentice + helm -> 'Apprentice Hood'. */
export function armorName(series: ArmorSeries, slot: ArmorSlot): string {
  return `${series.name} ${series.names[slot]}`;
}

export const ARMOR_SERIES: ArmorSeries[] = [
  // ── Cloth ─────────────────────────────────────────────────────────────────
  {
    id: 'apprentice', name: 'Apprentice', armorType: 'Cloth', requiredLevel: 1,
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
    id: 'leather', name: 'Leather', armorType: 'Light', requiredLevel: 1,
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
    id: 'hide', name: 'Hide', armorType: 'Medium', requiredLevel: 1,
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
    id: 'iron', name: 'Iron', armorType: 'Heavy', requiredLevel: 1,
    names: { helm: 'Helm',            chest: 'Breastplate',  gloves: 'Gauntlets', boots: 'Sabatons' },
    models: {
      helm:   'armor.iron-helm',
      chest:  'armor.iron-breastplate',
      gloves: 'armor.iron-gauntlets',
      boots:  'armor.iron-sabatons',
    },
  },
];

// ─── Armor Type Implicits ─────────────────────────────────────────────────────────

// Scaling values for one slot within an implicit definition.
export interface ArmorSlotScaling {
  baseValue: number;       // value at item level 1
  growthPerLevel: number;  // added per item level above 1
}

// One implicit per armor type; values differ per slot (chest > helm/boots > gloves).
export interface ArmorImplicitDef {
  statKey: BuffableStat;
  slots: Record<ArmorSlot, ArmorSlotScaling>;
}

export const ARMOR_IMPLICITS: Record<ArmorProficiency, ArmorImplicitDef> = {
  Cloth: {
    statKey: 'magicResistance',
    slots: {
      chest:  { baseValue: 5, growthPerLevel: 0.40 },
      helm:   { baseValue: 4, growthPerLevel: 0.30 },
      boots:  { baseValue: 3, growthPerLevel: 0.30 },
      gloves: { baseValue: 2, growthPerLevel: 0.20 },
    },
  },
  Light: {
    statKey: 'dodge',
    slots: {
      chest:  { baseValue: 3, growthPerLevel: 0.40 },
      boots:  { baseValue: 2, growthPerLevel: 0.30 },
      helm:   { baseValue: 2, growthPerLevel: 0.20 },
      gloves: { baseValue: 1, growthPerLevel: 0.10 },
    },
  },
  Medium: {
    statKey: 'initiative',
    slots: {
      chest:  { baseValue: 3, growthPerLevel: 0.30 },
      helm:   { baseValue: 2, growthPerLevel: 0.20 },
      boots:  { baseValue: 2, growthPerLevel: 0.20 },
      gloves: { baseValue: 1, growthPerLevel: 0.10 },
    },
  },
  Heavy: {
    statKey: 'glancingBlow',
    slots: {
      chest:  { baseValue: 5, growthPerLevel: 0.40 },
      helm:   { baseValue: 3, growthPerLevel: 0.30 },
      boots:  { baseValue: 3, growthPerLevel: 0.30 },
      gloves: { baseValue: 2, growthPerLevel: 0.20 },
    },
  },
};

export const ARMOR_INVALID_AFFIXES: Record<ArmorProficiency, BuffableStat[]> = {
  Cloth: ['strength', 'finesse', 'block', 'parry', 'glancingBlow', ...rangedStats],
  Light: ['magicHit', 'magicCrit', 'block', 'threatMultiplier'],
  Medium: ['block', 'threatMultiplier'],
  Heavy: ['block', 'initiative', 'dodge', ...rangedStats]
}
