// NPCs: the people the party meets (in the Sanctum for now). Each stands on its tile, facing its own way, and never
// moves. The leader beside one can always speak to it: it turns to face the leader for as long as they talk, then
// back to its own way. Some give a service (a vendor's trade); later ones may only talk, or give quests.
// Each is drawn by its forge design (`model`, forge category "NPCs"); a map places it by id (SANCTUM.npcs).
import type { ModelLink } from '../../forge/core/types';

/** What an NPC does for the party when spoken to, beyond talking. */
export type NpcService = 'vendor';

export interface NpcData {
  id: string;
  /** Their name, as shown over them and on their window. */
  name: string;
  /** What they are, under their name ('Vendor'). */
  title: string;
  service?: NpcService;
  model: ModelLink;
}

export const NPCS: NpcData[] = [
  // The Sanctum's vendor: buys and sells gear (the trade window is still to come)
  { id: 'denisel', name: 'Denisel', title: 'Vendor', service: 'vendor', model: 'npc.denisel' },
];

/** An NPC by id. */
export function npc(id: string): NpcData {
  const n = NPCS.find((x) => x.id === id);
  if (!n) throw new Error(`no NPC '${id}' (data/world/npcs.ts)`);
  return n;
}
