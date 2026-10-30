// Shared by loot designs (LOOT in data/gear/loot.ts; forge section "Loot"): things on the floor the party picks up
// that aren't items, like gold. Files starting with "_" are NOT registered as designs.
import type { DataRef } from '../core/types';
import { slug } from '../core/slug';
import { LOOT } from '../../data/gear/loot';

/**
 * Identity of a loot design, from its exact data entry (LOOT[id]): label = the loot's name ('Gold Coins'),
 * id = 'loot.' + slug(name), source = the entry.
 */
export function lootEntry(lootId: string): { id: string; label: string; source: DataRef } {
  const l = LOOT.find((x) => x.id === lootId);
  if (!l) throw new Error(`no loot '${lootId}' (data/gear/loot.ts)`);
  return { id: `loot.${slug(l.name)}`, label: l.name, source: { table: 'loot', key: lootId } };
}
