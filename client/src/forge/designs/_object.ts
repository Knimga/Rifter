// Shared by game object designs (GAME_OBJECTS in data/gameObjects.ts; forge section "Game Objects").
// Files starting with "_" are NOT registered as designs.
import type { DataRef } from '../core/types';
import { slug } from '../core/slug';
import { GAME_OBJECTS } from '../../data/gameObjects';

/**
 * Identity of a game object design, from its exact data entry (GAME_OBJECTS[id]): label = the object's
 * name ('Door'), id = 'object.' + slug(name), source = the entry.
 */
export function objectEntry(objectId: string): { id: string; label: string; source: DataRef } {
  const o = GAME_OBJECTS.find((x) => x.id === objectId);
  if (!o) throw new Error(`no game object '${objectId}' (data/gameObjects.ts)`);
  return { id: `object.${slug(o.name)}`, label: o.name, source: { table: 'gameObjects', key: objectId } };
}
