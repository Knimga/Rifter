// Interactable things on the map that aren't units or loot: doors, treasure chests, the Rifter, and later
// craftbenches and the like. Each is drawn by its forge design (`model`, forge category "Interactive Objects").
// Rifts are their own: one model, painted in the color of where each leads (data/world/rifts.ts).
import type { ModelLink } from '../../forge/core/types';

export interface InteractiveObjectData {
  id: string;
  name: string;
  model: ModelLink;
  /** The glow on its tile while the party can use it (a palette color, index.css); none = the UI accent. */
  glow?: string;
}

function interactiveObject(id: string): InteractiveObjectData {
  const o = INTERACTIVE_OBJECTS.find((x) => x.id === id);
  if (!o) throw new Error(`no interactive object '${id}' (data/world/interactiveObjects.ts)`);
  return o;
}

/** The model of an interactive object, by id (maps name the objects they place by id: see DungeonConfig, SANCTUM). */
export const interactiveObjectModel = (id: string): ModelLink => interactiveObject(id).model;

/** An interactive object's display name, by id (e.g. a chest window's heading). */
export const interactiveObjectName = (id: string): string => interactiveObject(id).name;

/** The glow on an interactive object's tile while it can be used (see InteractiveObjectData.glow). */
export const interactiveObjectGlow = (id: string): string => interactiveObject(id).glow ?? 'var(--glow)';

export const INTERACTIVE_OBJECTS: InteractiveObjectData[] = [
  // Connects two dungeon zones; sits in a wall tile, facing the floor tile it opens onto
  { id: 'heavy-door', name: 'Heavy Door', model: 'interactive.heavy-door' },
  // The Sanctum's arcane device for opening rifts: a keystone set in it opens a rift to that keystone's place.
  // Three tiles in a line, all unwalkable: an instrument plinth (left, from the party's view), rift
  // stabilizer struts (middle: an opened rift stands there, turned like the device) and the key receptacle
  // (right). Dormant: no keystone, no rift. Active: a keystone set and its rift open, its lights awake; drawn in
  // the opened dungeon's riftColor (MapObject.tint), and swapped in for the dormant one with played ['activate']
  // (its waking animation). Same shape: designs/_rifter.ts.
  { id: 'rifter', name: 'Rifter', model: 'interactive.rifter' },
  { id: 'rifter-active', name: 'Rifter (Active)', model: 'interactive.rifter-active' },
  // A plain wooden chest bound in iron, locked; stands on a floor tile, its lock facing the open side
  { id: 'basic-treasure-chest', name: 'Basic Treasure Chest', model: 'interactive.basic-treasure-chest' },
];
