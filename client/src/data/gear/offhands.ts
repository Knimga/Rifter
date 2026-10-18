import type { ArmorProficiency } from '../classes';
import type { ModelLink } from '../../forge/core/types';
import type { ImplicitDef } from './types';

export interface ShieldTemplate {
  id: string;                 // stable key; the forge design for this shield names it (offhands table)
  name: string;
  type: ArmorProficiency;
  requiredLevel: number;
  model: ModelLink;           // its forge design: how it is drawn (icon and loot)
}

export const SHIELD_ARMOR_MULTIPLIER = 0.80;

export const SHIELDS: ShieldTemplate[] = [
  { id: 'buckler',     requiredLevel: 1, type: 'Light',  name: 'Buckler',     model: 'offhand.buckler' },
  { id: 'roundel',     requiredLevel: 1, type: 'Medium', name: 'Roundel',     model: 'offhand.roundel' },
  { id: 'kite-shield', requiredLevel: 1, type: 'Heavy',  name: 'Kite Shield', model: 'offhand.kite-shield' },
];

export const SHIELD_IMPLICIT: ImplicitDef = {
  statKey: 'block',
  baseValue: 5,
  growthPerLevel: 0.2,
};

//eventually add offhand foci for casters, quivers for archers