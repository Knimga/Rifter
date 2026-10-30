// Shared by interactive object designs (INTERACTIVE_OBJECTS in data/world/interactiveObjects.ts; forge section "Interactive Objects").
// Files starting with "_" are NOT registered as designs.
import type { DataRef } from '../core/types';
import { slug } from '../core/slug';
import { INTERACTIVE_OBJECTS } from '../../data/world/interactiveObjects';

/**
 * Identity of an interactive object design, from its exact data entry (INTERACTIVE_OBJECTS[id]): label = the object's
 * name ('Door'), id = 'interactive.' + slug(name), source = the entry.
 */
export function interactiveEntry(objectId: string): { id: string; label: string; source: DataRef } {
  const o = INTERACTIVE_OBJECTS.find((x) => x.id === objectId);
  if (!o) throw new Error(`no interactive object '${objectId}' (data/world/interactiveObjects.ts)`);
  return { id: `interactive.${slug(o.name)}`, label: o.name, source: { table: 'interactiveObjects', key: objectId } };
}
