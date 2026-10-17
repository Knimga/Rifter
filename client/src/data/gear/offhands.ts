import type { ArmorProficiency } from '../classes';
import type { ModelLink } from '../../forge/core/types';
import type { ImplicitDef } from './types';

export interface ShieldTemplate {
  id: string;                 // stable key; the forge design for this shield names it (offhands table)
  name: string;
  type: ArmorProficiency;
  requiredLevel: number;
  icon: string;               // image icon, used until the shield has a model
  model?: ModelLink;          // link to its forge design, which is then how it is drawn (icon and loot)
}

export const SHIELD_ARMOR_MULTIPLIER = 0.80;

export const SHIELDS: ShieldTemplate[] = [
  { id: 'buckler',     requiredLevel: 1, type: 'Light',  name: 'Buckler',     icon: '/gearIcons/weapons/plain/shield_round.png',
    model: { design: 'offhand.buckler', version: 1, params: {} } },
  { id: 'roundel',     requiredLevel: 1, type: 'Medium', name: 'Roundel',     icon: '/gearIcons/weapons/plain/shield_round.png',
    model: { design: 'offhand.roundel', version: 1, params: {} } },
  { id: 'kite-shield', requiredLevel: 1, type: 'Heavy',  name: 'Kite Shield', icon: '/gearIcons/weapons/plain/shield.png',
    model: { design: 'offhand.kite-shield', version: 1, params: {} } },
];

export const SHIELD_IMPLICIT: ImplicitDef = {
  statKey: 'block',
  baseValue: 5,
  growthPerLevel: 0.2,
};
