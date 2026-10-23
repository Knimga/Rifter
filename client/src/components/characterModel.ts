// A party member's character model: their class's body holding their gear, seeded as on the map
// (classInstanceId), so portraits, character select and the party window show the same character.
import { CLASSES, type ClassKey } from '../data/units/classes';
import { isShieldItem, isWeaponItem, type GearSlots } from '../data/gear';
import type { Model, ModelLink } from '../forge/core/types';
import { instanceSeed, linkedDesign } from '../forge/core/link';
import { buildCharacter, classInstanceId, type HeldWeapon } from '../forge/equip';
import { designs } from '../forge/registry.vite';

/** The weapon and shield a member's model holds, from their gear (none = nothing in that hand). */
export function heldGear(gear: GearSlots): { weapon?: HeldWeapon; shield?: ModelLink } {
  const main = gear.mainhand && isWeaponItem(gear.mainhand) ? gear.mainhand : null;
  const off = gear.offhand && isShieldItem(gear.offhand) ? gear.offhand : null;
  return { weapon: main ? { link: main.model, weaponType: main.weaponType } : undefined, shield: off?.model };
}

/** A key naming the look characterModel draws (class + held gear), for caching. */
export const characterLookKey = (classKey: ClassKey, weapon?: HeldWeapon, shield?: ModelLink) =>
  `${classKey}:${weapon?.link ?? '-'}:${shield ?? '-'}`;

/** The class's character holding `weapon` and `shield`; null while the class has no approved design. */
export function characterModel(classKey: ClassKey, weapon?: HeldWeapon, shield?: ModelLink): Model | null {
  const body = linkedDesign(designs, CLASSES[classKey].model);
  if (!body) return null;
  return buildCharacter(designs, body, instanceSeed(body, classInstanceId(classKey)), weapon, shield);
}
