import { CLASSES, type ClassKey } from './classes';
import { EMPTY_GEAR, generateArmor, generateShield, generateWeapon, type GearSlots } from './gear';

export interface PartyMemberConfig {
  characterName: string;
  selectedClass: ClassKey | null;  // null until chosen in the builder; always set in game
  gear: GearSlots;
}

export function createDefaultMember(): PartyMemberConfig {
  return {
    characterName: '',
    selectedClass: null,
    gear: EMPTY_GEAR,
  };
}

export const displayName = (m: PartyMemberConfig, idx: number) => m.characterName.trim() || `Character ${idx + 1}`;

/** Reasons a member can't start the game yet (empty = ready). No point-buy at level 1: just a name and a class. */
export function memberIssues(m: PartyMemberConfig): string[] {
  const issues: string[] = [];
  if (!m.characterName.trim()) issues.push('name required');
  if (!m.selectedClass) issues.push('no class');
  return issues;
}

export const isMemberComplete = (m: PartyMemberConfig) => memberIssues(m).length === 0;

/** Level-1 class kit (CLASSES[classKey].startingGear): chest armor, weapon, and an optional shield. No affixes. */
export function startingGear(classKey: ClassKey): GearSlots {
  const kit = CLASSES[classKey].startingGear;
  return {
    ...EMPTY_GEAR,
    chest:    generateArmor(1, 'chest', kit.chest, { affixes: false }),
    mainhand: generateWeapon(1, kit.weapon, { element: kit.weaponElement, affixes: false }),
    offhand:  kit.shield ? generateShield(1, kit.shield, { affixes: false }) : null,
  };
}
