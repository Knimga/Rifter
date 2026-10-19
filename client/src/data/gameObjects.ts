// Interactable things on the map that aren't units or loot: doors, portals, and later treasure chests,
// craftbenches and the like. Each is drawn by its forge design (`model`, forge category "Game Objects").
import type { ModelLink } from '../forge/core/types';

export interface GameObjectData {
  id: string;
  name: string;
  model: ModelLink;
}

/** The model of a game object, by id (maps name the objects they place by id: see DungeonConfig, SANCTUM). */
export function gameObjectModel(id: string): ModelLink {
  const o = GAME_OBJECTS.find((x) => x.id === id);
  if (!o) throw new Error(`no game object '${id}' (data/gameObjects.ts)`);
  return o.model;
}

export const GAME_OBJECTS: GameObjectData[] = [
  // Connects two dungeon zones; sits in a wall tile, facing the floor tile it opens onto
  { id: 'heavy-door', name: 'Heavy Door', model: 'object.heavy-door' },
  // Travels between the Sanctum and the dungeon (the Sanctum's way in, a dungeon's way out). Portals of
  // other colors are their own entries (same shape: designs/_portal.ts); where one leads is set by the
  // map that places it, not here.
  { id: 'necrotic-portal', name: 'Necrotic Portal', model: 'object.necrotic-portal' },
];
