import { STARTING_CHEST, STARTING_ELEMENT, STARTING_SHIELD, STARTING_WEAPON, type ClassKey } from './classes';
import { STARTING_ATTR_POINTS, STARTING_SKILL_POINTS, type AttributeKey, type SkillKey } from './stats';
import { EMPTY_GEAR, generateArmor, generateShield, generateWeapon, type GearSlots } from './gear';

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

export const sumValues = (record: Partial<Record<string, number>>) =>
  Object.values(record).reduce((a: number, b) => a + (b ?? 0), 0);

export const displayName = (m: PartyMemberConfig, idx: number) => m.characterName.trim() || `Character ${idx + 1}`;

/** Reasons a member can't start the game yet (empty = ready). */
export function memberIssues(m: PartyMemberConfig): string[] {
  const issues: string[] = [];
  if (!m.characterName.trim()) issues.push('name required');
  if (!m.selectedClass) issues.push('no class');
  const attrLeft = STARTING_ATTR_POINTS - sumValues(m.pointsSpent);
  if (attrLeft > 0) issues.push(`${attrLeft} attr pts unspent`);
  const skillLeft = STARTING_SKILL_POINTS - sumValues(m.skillPointsSpent);
  if (skillLeft > 0) issues.push(`${skillLeft} skill pts unspent`);
  return issues;
}

export const isMemberComplete = (m: PartyMemberConfig) => memberIssues(m).length === 0;

/** Level-1 class kit: chest armor, weapon, and an optional shield. No affixes. */
export function startingGear(classKey: ClassKey): GearSlots {
  const shieldType = STARTING_SHIELD[classKey];
  return {
    ...EMPTY_GEAR,
    chest:    generateArmor(1, 'chest', STARTING_CHEST[classKey], { affixes: false }),
    mainhand: generateWeapon(1, STARTING_WEAPON[classKey], { element: STARTING_ELEMENT[classKey], affixes: false }),
    offhand:  shieldType ? generateShield(1, shieldType, { affixes: false }) : null,
  };
}
