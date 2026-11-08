// NPCs: the people the party meets (in the Sanctum for now). Each stands on its tile, facing its own way, and never
// moves. The leader beside one can always speak to it: it turns to face the leader for as long as they talk, then
// back to its own way. Some give a service (a vendor's trade, enchanting); later ones may only talk, or give quests.
// Each is drawn by its forge design (`model`, forge category "NPCs"), holding its weapon if it has one (as a class
// holds its member's: buildCharacter); a map places it by id (SANCTUM.npcs).
import type { ModelLink } from '../../forge/core/types';
import type { WeaponType } from '../gear/types';
import { speaks } from './dialogue';

/** What an NPC does for the party when spoken to, beyond talking. */
export type NpcService = 'vendor' | 'enchanting';

export interface NpcData {
  id: string;
  /** Their name, as shown over them and on their window. */
  name: string;
  /** What they are, under their name ('Vendor'). */
  title: string;
  service?: NpcService;
  model: ModelLink;
  /**
   * The weapon it holds, if any: its item's model and weapon type. Its body is posed for that type's hold (HOLD_FOR),
   * as a class is for its member's weapon, and holds the weapon's own model.
   */
  holds?: { link: ModelLink; weaponType: WeaponType };
}

export const NPCS: NpcData[] = [
  // The Sanctum's vendor: buys and sells gear (VendorWindow, gear/vendor.ts)
  { id: 'denisel', name: 'Denisel', title: 'Vendor', service: 'vendor', model: 'npc.denisel' },
  // The Sanctum's enchanter: enchants, disenchants and shatters gear, and trades shards (EnchanterWindow, gear/enchanting.ts)
  { id: 'lynn', name: 'Lynn', title: 'Enchanter', service: 'enchanting', model: 'npc.lynn' },
  // An old sage: no service; he speaks (data/world/dialogue.ts), and completes Rix's quest
  { id: 'ardas', name: 'Ardas', title: 'Sage', model: 'npc.ardas' },
  // An earth elemental, a golem of plain brown rock: no service or dialogue yet
  { id: 'gorn', name: 'Gorn', title: 'Earth Elemental', model: 'npc.gorn' },
  // An arcanist in an open black robe trimmed in purple, the Rifter's maker: no service; she speaks, showing the party how
  // to use it (a quest step)
  { id: 'ileena', name: 'Ileena', title: 'Arcanist', model: 'npc.ileena' },
  // Short and stout, in leather over dark green, holding a plain mace: no service; he speaks, sending the party to Ardas (a quest)
  { id: 'rix', name: 'Rix', title: 'Mercenary', model: 'npc.rix', holds: { link: 'weapon.plain-mace', weaponType: '1h Maces' } },
];

/**
 * Whether the party can speak to an NPC: it offers a service, or has something to say (its conversations: DIALOGUES).
 * One with neither ignores the party: it doesn't glow when the leader is beside it, and nothing happens when it is
 * clicked.
 */
export const canTalkTo = (id: string): boolean => !!npc(id).service || speaks(id);

/** An NPC by id. */
export function npc(id: string): NpcData {
  const n = NPCS.find((x) => x.id === id);
  if (!n) throw new Error(`no NPC '${id}' (data/world/npcs.ts)`);
  return n;
}
