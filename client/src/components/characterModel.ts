// A party member's character model: their class's body holding their gear, seeded as on the map
// (classInstanceId), so portraits, character select and the party window show the same character. And an NPC's,
// as the map draws it (its dialogue portrait).
import { CLASSES, type ClassKey } from '../data/units/classes';
import { heldWeapon, type GearSlots } from '../data/gear';
import type { Model, ModelLink } from '../forge/core/types';
import { buildInstance, instanceSeed, linkedDesign } from '../forge/core/link';
import { npc } from '../data/world/npcs';
import { buildCharacter, classInstanceId, type HeldWeapon } from '../forge/equip';
import { designs } from '../forge/registry.vite';

/** The weapon and offhand (a shield, a quiver on the back) a member's model shows, from their gear (none = nothing). */
export function heldGear(gear: GearSlots): { weapon?: HeldWeapon; offhand?: ModelLink } {
  const main = heldWeapon(gear);
  return { weapon: main ? { link: main.model, weaponType: main.weaponType } : undefined, offhand: gear.offhand?.model || undefined };
}

/** A key naming the look characterModel draws (class + held gear), for caching. */
export const characterLookKey = (classKey: ClassKey, weapon?: HeldWeapon, offhand?: ModelLink) =>
  `${classKey}:${weapon?.link ?? '-'}:${offhand ?? '-'}`;

/**
 * An NPC's model (NPCS id) as the map draws it: its design seeded from its id, holding its weapon if it has one
 * (NpcData.holds); null while its design isn't approved.
 */
export function npcModel(id: string): Model | null {
  const n = npc(id), body = linkedDesign(designs, n.model);
  if (!body) return null;
  return n.holds ? buildCharacter(designs, body, instanceSeed(body, id), n.holds) : buildInstance(body, id);
}

/** The class's character holding `weapon` and `offhand`; null while the class has no approved design. */
export function characterModel(classKey: ClassKey, weapon?: HeldWeapon, offhand?: ModelLink): Model | null {
  const body = linkedDesign(designs, CLASSES[classKey].model);
  if (!body) return null;
  return buildCharacter(designs, body, instanceSeed(body, classInstanceId(classKey)), weapon, offhand);
}
