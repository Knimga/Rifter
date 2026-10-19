import { CLASSES, type ClassKey } from './classes';
import { EMPTY_GEAR, generateArmor, generateShield, generateWeapon, type GearSlots } from './gear';

export interface PartyMemberConfig {
  characterName: string;
  selectedClass: ClassKey;
  gear: GearSlots;
}

/** A new party member of `classKey` named `name`, wearing the class's starting gear. */
export function createMember(classKey: ClassKey, name: string): PartyMemberConfig {
  return { characterName: name, selectedClass: classKey, gear: startingGear(classKey) };
}

/** Level-1 class kit (CLASSES[classKey].startingGear): chest armor, boots, weapon, and an optional shield. No affixes. */
export function startingGear(classKey: ClassKey): GearSlots {
  const kit = CLASSES[classKey].startingGear;
  return {
    ...EMPTY_GEAR,
    chest:    generateArmor(1, 'chest', kit.chest, { affixes: false }),
    boots:    generateArmor(1, 'boots', kit.boots, { affixes: false }),
    mainhand: generateWeapon(1, kit.weapon, { element: kit.weaponElement, affixes: false }),
    offhand:  kit.shield ? generateShield(1, kit.shield, { affixes: false }) : null,
  };
}
