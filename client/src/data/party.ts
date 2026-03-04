import type { ClassKey } from './classes';
import type { AttributeKey } from './stats';
import { EMPTY_GEAR, type GearSlots } from './gear';

export interface PartyMemberConfig {
  characterName: string;
  selectedClass: ClassKey | null;
  pointsSpent: Record<AttributeKey, number>;
  gear: GearSlots;
}

export function createDefaultMember(): PartyMemberConfig {
  return {
    characterName: '',
    selectedClass: null,
    pointsSpent: { strength: 0, toughness: 0, finesse: 0, mind: 0, spirit: 0 },
    gear: EMPTY_GEAR,
  };
}
