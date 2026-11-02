// Decorative objects: static things that fill tiles on the map (furniture, shelves, crates, statues), or dress them
// (clutter). Nobody uses them, and they never move or animate. Each is drawn by its forge design (`model`, forge category
// "Decorative Objects"). A map places them by hand (SANCTUM.decor), each on its tile facing its own way, or a dungeon
// places them itself (`placement`: its DungeonConfig.clutter and ZoneConfig.obstacles list which). Things the party can
// use (doors, chests, the Rifter) are interactive objects instead (data/world/interactiveObjects.ts).
import type { ModelLink } from '../../forge/core/types';

/**
 * How a dungeon places it (none: only placed by hand, as the Sanctum's):
 * - `wall`: wall clutter, against a full wall (north or east of its tile, never a cut-down near wall), on a floor tile
 *   that stays walkable. Purely visual.
 * - `ground`: ground clutter, small things lying on a floor tile; never blocks movement or sight. Purely visual.
 * - `obstacle`: fills its tiles (`span` x `depth`), standing free in a room; blocks movement, and sight if `blocksSight`.
 */
export type DecorPlacement = 'wall' | 'ground' | 'obstacle';

export interface DecorObjectData {
  id: string;
  name: string;
  /**
   * Its design. A dungeon-placed object (`placement`) may have a blank model ('') until its design is approved: it is
   * never placed until then (so a draft obstacle never blocks the way unseen), and starts appearing once it is set.
   */
  model: ModelLink;
  /**
   * How many tiles it fills side by side across the way it faces (its placed tile in the middle; spanTiles in
   * data/world/sanctum.ts): 1 (default) for one tile, e.g. 3 for a long shelf against a wall. Its design is built that
   * many tiles wide.
   */
  span?: number;
  placement?: DecorPlacement;
  /** An obstacle: how many tiles deep it is, front to back (default 1); its footprint is `span` x `depth`. */
  depth?: number;
  /** An obstacle: it blocks sight too (a tree trunk), not only movement (a sarcophagus, which can be seen over). */
  blocksSight?: boolean;
}

export const DECOR_OBJECTS: DecorObjectData[] = [
  // A four-wheeled merchant's cart, loaded with goods: its length across its two tiles, its open back on its right
  // (from its front), its pole on its left
  { id: 'merchants-cart', name: "Merchant's Cart", model: 'decor.merchants-cart', span: 2 },
  // Three barrels of the cart's dark wood with three grain sacks stacked and leaning among them, the sacks in front
  { id: 'barrels-and-sacks', name: 'Barrels & Sacks', model: 'decor.barrels-sacks' },
  // A stand-alone dark iron weapon rack hung with swords, axes and bows (the game's own weapon models), and a small
  // barrel of arrows beside it
  { id: 'weapon-rack', name: 'Weapon Rack', model: 'decor.weapon-rack' },
  // The enchanter's long table of dark carved stone, its back against a wall: a glowing ritual circle in the middle,
  // books, scrolls, scattered affix shards and an open tome on its left (from its front), arcane tools, glowing jars
  // and stacked books on its right
  { id: 'enchanters-table', name: "Enchanter's Table", model: 'decor.enchanters-table', span: 3 },
  // The enchanter's stores: a dark wood treasure chest, and in front of it a very small barrel heaped with affix shards
  // to one side and a few small tied sacks to the other
  { id: 'enchanters-supplies', name: "Enchanter's Supplies", model: 'decor.enchanters-supplies' },

  // ── Wall clutter ──
  // Grey cobwebs strung in the corner where the wall meets the floor, and a strand or two higher up
  { id: 'cobwebs', name: 'Cobwebs', model: 'decor.cobwebs', placement: 'wall' },
  // An iron sconce on the wall holding a burning torch: the one bright thing on a dungeon wall
  { id: 'wall-torch', name: 'Wall Torch', model: 'decor.wall-torch', placement: 'wall' },
  // The same torch, burning a cold blue: the Crypt's
  { id: 'blue-wall-torch', name: 'Blue Wall Torch', model: 'decor.blue-wall-torch', placement: 'wall' },
  // Shelf fungi growing out of the wall in a few overlapping tiers
  { id: 'bracket-fungus', name: 'Bracket Fungus', model: 'decor.bracket-fungus', placement: 'wall' },
  // Deep claw marks raked across the wall, rubble fallen at its foot
  { id: 'claw-scratches', name: 'Claw Scratches', model: 'decor.claw-scratches', placement: 'wall' },

  // ── Ground clutter ──
  { id: 'scattered-bones', name: 'Scattered Bones', model: 'decor.scattered-bones', placement: 'ground' },
  { id: 'skull', name: 'Skull', model: 'decor.skull', placement: 'ground' },
  // Broken stones, a couple of larger chunks among grit: gray, and brown-gray (the Firelands', blending with its floor)
  { id: 'loose-rubble', name: 'Loose Rubble', model: 'decor.loose-rubble', placement: 'ground' },
  { id: 'brown-rubble', name: 'Brown Rubble', model: 'decor.brown-rubble', placement: 'ground' },
  { id: 'mushroom-cluster', name: 'Mushroom Cluster', model: 'decor.mushroom-cluster', placement: 'ground' },
  { id: 'fallen-log', name: 'Fallen Log', model: 'decor.fallen-log', placement: 'ground' },
  { id: 'low-shrub', name: 'Low Shrub', model: 'decor.low-shrub', placement: 'ground' },
  { id: 'smoldering-embers', name: 'Smoldering Embers', model: 'decor.smoldering-embers', placement: 'ground' },

  // ── Obstacles ──
  // A stone coffin with a carved lid, lying along its two tiles: low enough to see over
  { id: 'sarcophagus', name: 'Sarcophagus', model: 'decor.sarcophagus', placement: 'obstacle', depth: 2 },
  // A giant tree trunk rising out of view, its roots spread over its tile
  { id: 'tree-trunk', name: 'Tree Trunk', model: 'decor.tree-trunk', placement: 'obstacle', blocksSight: true },
  // A spout of lava rising from a crusted vent: it can be seen past, not walked through
  { id: 'lava-plume', name: 'Lava Plume', model: 'decor.lava-plume', placement: 'obstacle' },
  // A tall cluster of stalagmites filling a 2x2 square
  { id: 'stalagmite-cluster', name: 'Stalagmite Cluster', model: 'decor.stalagmite-cluster', placement: 'obstacle', span: 2, depth: 2, blocksSight: true },
  // Goblin crates and barrels stacked higher than a head
  { id: 'crate-stack', name: 'Crate Stack', model: 'decor.crate-stack', placement: 'obstacle', blocksSight: true },
];

export function decorObject(id: string): DecorObjectData {
  const o = DECOR_OBJECTS.find((x) => x.id === id);
  if (!o) throw new Error(`no decorative object '${id}' (data/world/decorObjects.ts)`);
  return o;
}

/** The model of a decorative object, by id. */
export const decorObjectModel = (id: string): ModelLink => decorObject(id).model;

/** How many tiles a decorative object fills across its front (DecorObjectData.span). */
export const decorObjectSpan = (id: string): number => decorObject(id).span ?? 1;

/** Whether a dungeon can place a decorative object now: it has a design (a blank model is never placed). */
export const hasDecorDesign = (o: DecorObjectData): boolean => o.model !== '';
