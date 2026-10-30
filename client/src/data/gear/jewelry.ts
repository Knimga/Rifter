// Rings and amulets: worn by every class (no proficiency needed), one amulet and two rings a character. Like a
// quiver or a focus, a piece has no armor: its stats are its implicit and its rolled affixes. Each type below is one
// base that drops (as any rarity), with its own name, level, implicit, the affixes it never rolls and its model.
//
// A type whose `model` is still '' (no design yet) never drops: give it its model together with its design (a
// forge draft until approved: forge section "Rings & Amulets") and it starts dropping (and selling at the vendor).
import type { BuffableStat } from '../units/stats';
import type { ModelLink } from '../../forge/core/types';
import type { ImplicitDef, JewelryKind } from './types';
import { magicStats, meleeStats, rangedStats, damageTypeAffixes } from './types';

export interface JewelryTemplate {
  id: string;                 // stable key; the forge design for it names it (jewelry table)
  name: string;
  /** The item level it starts dropping around (like a series: within ±3 levels, else the nearest below). */
  requiredLevel: number;
  implicit: ImplicitDef;
  /** Scales what it sells for (value.ts ITEM_BASE_VALUE ring / amulet). */
  valueMultiplier: number;
  /** Affixes it never rolls. */
  invalidAffixes: BuffableStat[];
  /** Its forge design: how it is drawn (icon and loot); '' while it has none (it doesn't drop until then). */
  model: ModelLink;
}

/** Rings that drop as loot. Either ring slot takes any ring. */
export const RINGS: JewelryTemplate[] = [
  {
    id: 'iron-band', 
    name: 'Iron Band', 
    requiredLevel: 1, 
    valueMultiplier: 1,
    implicit: { stat: 'toughness', baseValue: 1, growthPerLevel: 0.5 },
    invalidAffixes: [
      ...magicStats, ...damageTypeAffixes(['magic']), 'mind', 'spirit',
      'devotion', 'spellcraft', 'mpRegen'
    ],
    model: 'jewelry.iron-band',
  },
  {
    id: 'tungsten-band',
    name: 'Tungsten Band',
    requiredLevel: 1,
    valueMultiplier: 1,
    implicit: { stat: 'speed', baseValue: 1, growthPerLevel: 0.5 },
    invalidAffixes: [
      ...magicStats, ...damageTypeAffixes(['fire','ice','lightning','nature','holy']), 
      'mind', 'spirit', 'devotion', 'spellcraft', 'mpRegen', 'block', 'glancingBlow',
      'healing', 'healingReceived'
    ],
    model: 'jewelry.tungsten-band'
  },
  {
    id: 'bronze-band',
    name: 'Bronze Band',
    requiredLevel: 1,
    valueMultiplier: 1,
    implicit: { stat: 'spirit', baseValue: 1, growthPerLevel: 0.5 },
    invalidAffixes: [
      ...meleeStats, ...rangedStats, ...damageTypeAffixes(['physical','poison']), 
      'strength', 'toughness', 'speed', 'expertise', 'redoubt', 'block', 'parry',
      'glancingBlow', 'dodge'
    ],
    model: 'jewelry.bronze-band'
  },
];

/** Amulets that drop as loot. */
export const AMULETS: JewelryTemplate[] = [
  {
    id: 'carnelian-amulet',
    name: 'Carnelian Amulet',
    requiredLevel: 1,
    valueMultiplier: 1,
    implicit: { stat: 'armor', baseValue: 5, growthPerLevel: 0.2 },
    invalidAffixes: [
      ...magicStats, ...damageTypeAffixes(['fire','ice','lightning']), 
      'mind', 'spirit', 'devotion', 'spellcraft', 'mpRegen'
    ],
    model: 'jewelry.carnelian-amulet'
  },
  {
    id: 'malachite-amulet',
    name: 'Malachite Amulet',
    requiredLevel: 1,
    valueMultiplier: 1,
    implicit: { stat: 'expertise', baseValue: 2, growthPerLevel: 0.5 },
    invalidAffixes: [
      ...magicStats, ...damageTypeAffixes(['fire','ice','lightning','nature','holy']), 
      'mind', 'spirit', 'devotion', 'spellcraft', 'mpRegen', 'block', 'glancingBlow',
    ],
    model: 'jewelry.malachite-amulet'
  },
  {
    id: 'lazurite-amulet',
    name: 'Lazurite Amulet',
    requiredLevel: 1,
    valueMultiplier: 1,
    implicit: { stat: 'magicResistance', baseValue: 4, growthPerLevel: 0.5 },
    invalidAffixes: [
      ...meleeStats, ...rangedStats, ...damageTypeAffixes(['physical','poison']), 
      'strength', 'toughness', 'speed', 'expertise', 'redoubt', 'block', 'parry',
      'glancingBlow', 'dodge'
    ],
    model: 'jewelry.lazurite-amulet'
  },
];

/** Each kind's types. */
export const JEWELRY: Record<JewelryKind, JewelryTemplate[]> = { ring: RINGS, amulet: AMULETS };

/** Each kind's name, as items show it (tooltips). */
export const JEWELRY_KIND_NAME: Record<JewelryKind, string> = { ring: 'Ring', amulet: 'Amulet' };

/** The types of a kind that can drop: those with a model (a design). */
export const droppableJewelry = (kind: JewelryKind): JewelryTemplate[] => JEWELRY[kind].filter((t) => t.model !== '');
