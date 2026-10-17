// Static armor data for the armor drop generator.
import {
  GiHood, GiNinjaArmor, GiGloves, GiSonicShoes,
  GiLightHelm, GiLeatherArmor, GiLeatherBoot,
  GiBarbute, GiShoulderArmor, GiGauntlet, GiBoots,
  GiBlackKnightHelm, GiBreastplate, GiGreaves,
} from 'react-icons/gi';
import type { IconType } from 'react-icons';
import type { BuffableStat } from '../stats';
import { rangedStats, type ArmorSlot } from './types';
import type { ArmorProficiency } from '../classes';
import type { ModelLink } from '../../forge/core/types';

// ─── Armor Generation ─────────────────────────────────────────────────────────

export const ARMOR_TYPE_BASE_VALUE: Record<ArmorProficiency, number> = {
  Cloth: 2,
  Light: 4,
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
  icons: Record<ArmorSlot, IconType>; // icon component per slot (used until the slot has a model)
  // Each slot's link to its forge design, which is then how the item is drawn (icon and loot).
  models?: Partial<Record<ArmorSlot, ModelLink>>;
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
    icons: { helm: GiHood,     chest: GiNinjaArmor, gloves: GiGloves,    boots: GiSonicShoes },
    models: {
      helm:   { design: 'armor.apprentice-hood', version: 1, params: { peak: 'rounded' } },
      chest:  { design: 'armor.apprentice-robes', version: 1, params: {} },
      gloves: { design: 'armor.apprentice-handwraps', version: 1, params: {} },
      boots:  { design: 'armor.apprentice-shoes', version: 1, params: {} },
    },
  },

  // ── Light ─────────────────────────────────────────────────────────────────
  {
    id: 'leather', name: 'Leather', armorType: 'Light', requiredLevel: 1,
    names: { helm: 'Cap',         chest: 'Jerkin',        gloves: 'Gloves',  boots: 'Boots'       },
    icons: { helm: GiLightHelm,   chest: GiLeatherArmor,  gloves: GiGloves,  boots: GiLeatherBoot },
    models: {
      helm:   { design: 'armor.leather-cap', version: 1, params: {} },
      chest:  { design: 'armor.leather-jerkin', version: 1, params: {} },
      gloves: { design: 'armor.leather-gloves', version: 1, params: {} },
      boots:  { design: 'armor.leather-boots', version: 1, params: {} },
    },
  },

  // ── Medium ────────────────────────────────────────────────────────────────
  {
    id: 'hide', name: 'Hide', armorType: 'Medium', requiredLevel: 1,
    names: { helm: 'Skullcap',  chest: 'Hauberk',        gloves: 'Gauntlets', boots: 'Boots' },
    icons: { helm: GiBarbute,   chest: GiShoulderArmor,  gloves: GiGauntlet,  boots: GiBoots   },
    models: {
      helm:   { design: 'armor.hide-skullcap', version: 1, params: {} },
      chest:  { design: 'armor.hide-hauberk', version: 1, params: {} },
      gloves: { design: 'armor.hide-gauntlets', version: 1, params: {} },
      boots:  { design: 'armor.hide-boots', version: 1, params: {} },
    },
  },

  // ── Heavy ─────────────────────────────────────────────────────────────────
  {
    id: 'iron', name: 'Iron', armorType: 'Heavy', requiredLevel: 1,
    names: { helm: 'Helm',            chest: 'Breastplate',  gloves: 'Gauntlets', boots: 'Sabatons' },
    icons: { helm: GiBlackKnightHelm, chest: GiBreastplate,  gloves: GiGauntlet,  boots: GiGreaves  },
    models: {
      helm:   { design: 'armor.iron-helm', version: 1, params: {} },
      chest:  { design: 'armor.iron-breastplate', version: 1, params: {} },
      gloves: { design: 'armor.iron-gauntlets', version: 1, params: {} },
      boots:  { design: 'armor.iron-sabatons', version: 1, params: {} },
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
