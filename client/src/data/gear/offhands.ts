import type { ArmorProficiency } from '../classes';
import type { ImplicitDef } from './types';

export interface ShieldTemplate {
  name: string;
  type: ArmorProficiency;
  requiredLevel: number;
  icon: string;
}

export const SHIELD_ARMOR_MULTIPLIER = 0.80;

export const SHIELDS: ShieldTemplate[] = [
  { requiredLevel: 1, type: 'Light',  name: 'Buckler',     icon: '/gearIcons/weapons/plain/shield_round.png' },
  { requiredLevel: 1, type: 'Medium', name: 'Roundel',     icon: '/gearIcons/weapons/plain/shield_round.png' },
  { requiredLevel: 1, type: 'Heavy',  name: 'Kite Shield', icon: '/gearIcons/weapons/plain/shield.png' },
];

export const SHIELD_IMPLICIT: ImplicitDef = {
  statKey: 'block',
  baseValue: 5,
  growthPerLevel: 0.2,
};
