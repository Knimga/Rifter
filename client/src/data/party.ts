import type { ClassKey } from './classes';
import type { AttributeKey, SkillKey } from './stats';
import { EMPTY_GEAR, type GearSlots } from './gear';

export interface PartyMemberConfig {
  characterName: string;
  selectedClass: ClassKey | null;
  pointsSpent: Record<AttributeKey, number>;
  skillPointsSpent: Partial<Record<SkillKey, number>>;
  gear: GearSlots;
}

export function createDefaultMember(): PartyMemberConfig {
  return {
    characterName: '',
    selectedClass: null,
    pointsSpent: { strength: 0, toughness: 0, finesse: 0, mind: 0, spirit: 0, speed: 0 },
    skillPointsSpent: {},
    gear: EMPTY_GEAR,
  };
}
