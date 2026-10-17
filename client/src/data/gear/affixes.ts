import { ATTRIBUTE_KEYS, BuffableStat, SKILL_KEYS, ELEMENT_STAT_KEYS } from "../stats"
import { AffixPotency } from "./types"

export const AffixPotencies: Record<AffixPotency, BuffableStat[]> = {
  low: [
    ...ATTRIBUTE_KEYS, ...SKILL_KEYS,
    'armor', 'dodge', 'parry', 'block', 'glancingBlow', 'meleeDamage',
    'magicDamage', 'rangedDamage', 'threatMultiplier', 'magicResistance',
    'initiative'
  ],
  medium: [
    'healing', 'meleeHit', 'meleeCrit', 'meleePenetration', 'magicHit', 
    'magicCrit', 'magicPenetration', 'rangedHit', 'rangedCrit', 'rangedPenetration',
    ...ELEMENT_STAT_KEYS as BuffableStat[]
  ],
  high: ['hpRegen', 'mpRegen', 'movement']
}

export const PotencyBonusDivisor: Record<AffixPotency, number> = {low: 1, medium: 2, high: 3}

// Reverse lookup: stat → potency. Stats not listed in medium/high default to 'low'.
export const STAT_POTENCY = new Map<BuffableStat, AffixPotency>([
  ...AffixPotencies.high.map(s   => [s, 'high'   as AffixPotency] as const),
  ...AffixPotencies.medium.map(s => [s, 'medium' as AffixPotency] as const),
  ...AffixPotencies.low.map(s    => [s, 'low'    as AffixPotency] as const),
]);


