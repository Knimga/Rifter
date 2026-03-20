import { ArmorProficiency } from "../classes";
import { BuffableStat } from "../stats";

export interface ShieldItem {
    name: string;
    type: ArmorProficiency;
    level: number;
    icon: string;
}

export interface ShieldSeries {
  id: string;
  name: string;
  requiredLevel: number;
  armorMultiplier: number; // scales base shield armor
}

export const SHIELD_ARMOR_MULTIPLIER = 0.80;

export const SHIELDS: ShieldItem[] = [
    { 
        level: 1, type: 'Light', name: 'Buckler',
        icon: '/gearIcons/weapons/plain/shield_round.png'
    },
    { 
        level: 1, type: 'Medium', name: 'Roundel',
        icon: '/gearIcons/weapons/plain/shield_round.png'
    },
    { 
        level: 1, type: 'Heavy', name: 'Kite Shield',
        icon: '/gearIcons/weapons/plain/shield.png'
    },
]

export const SHIELD_IMPLICIT: {
    statKey: BuffableStat, baseValue: number; growthPerLevel: number;
} = {
    statKey: 'block',
    baseValue: 5,
    growthPerLevel: 0.2
}