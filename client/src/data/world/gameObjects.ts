// Interactable things on the map that aren't units or loot: doors, portals, and later treasure chests,
// craftbenches and the like. Each is drawn by its forge design (`model`, forge category "Game Objects").
import type { ModelLink } from '../../forge/core/types';

export interface GameObjectData {
  id: string;
  name: string;
  model: ModelLink;
  /** The glow on its tile while the party can use it (a palette color, index.css); none = the UI accent. */
  glow?: string;
}

function gameObject(id: string): GameObjectData {
  const o = GAME_OBJECTS.find((x) => x.id === id);
  if (!o) throw new Error(`no game object '${id}' (data/world/gameObjects.ts)`);
  return o;
}

/** The model of a game object, by id (maps name the objects they place by id: see DungeonConfig, SANCTUM). */
export const gameObjectModel = (id: string): ModelLink => gameObject(id).model;

/** A game object's display name, by id (e.g. a chest window's heading). */
export const gameObjectName = (id: string): string => gameObject(id).name;

/** The glow on a game object's tile while it can be used (see GameObjectData.glow). */
export const gameObjectGlow = (id: string): string => gameObject(id).glow ?? 'var(--glow)';

export const GAME_OBJECTS: GameObjectData[] = [
  // Connects two dungeon zones; sits in a wall tile, facing the floor tile it opens onto
  { id: 'heavy-door', name: 'Heavy Door', model: 'object.heavy-door' },
  // Travels between the Sanctum and the dungeon (the Sanctum's way in, a dungeon's way out). Portals of
  // other colors are their own entries (same shape: designs/_portal.ts); where one leads is set by the
  // map that places it, not here.
  { id: 'necrotic-portal', name: 'Necrotic Portal', model: 'object.necrotic-portal', glow: 'var(--rift-portal-necrotic)' },
  { id: 'fire-portal', name: 'Fire Portal', model: 'object.fire-portal', glow: 'var(--rift-portal-fire)' },
  { id: 'fungal-portal', name: 'Fungal Portal', model: 'object.fungal-portal', glow: 'var(--rift-portal-fungal)' },
  // A plain wooden chest bound in iron, locked; stands on a floor tile, its lock facing the open side
  { id: 'basic-treasure-chest', name: 'Basic Treasure Chest', model: 'object.basic-treasure-chest' },
];
