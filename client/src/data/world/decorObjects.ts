// Decorative objects: static things that fill tiles on the map (furniture, shelves, crates, statues). Nobody walks
// onto or through them, nobody uses them, and they never move or animate. Each is drawn by its forge design
// (`model`, forge category "Decorative Objects"); a map places them by id (SANCTUM.decor), each on its tile facing its
// own way. Things the party can use (doors, chests, the Rifter) are interactive objects instead
// (data/world/interactiveObjects.ts).
import type { ModelLink } from '../../forge/core/types';

export interface DecorObjectData {
  id: string;
  name: string;
  model: ModelLink;
  /**
   * How many tiles it fills side by side across the way it faces (its placed tile in the middle; spanTiles in
   * data/world/sanctum.ts): 1 (default) for one tile, e.g. 3 for a long shelf against a wall. Its design is built that
   * many tiles wide.
   */
  span?: number;
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
];

function decorObject(id: string): DecorObjectData {
  const o = DECOR_OBJECTS.find((x) => x.id === id);
  if (!o) throw new Error(`no decorative object '${id}' (data/world/decorObjects.ts)`);
  return o;
}

/** The model of a decorative object, by id. */
export const decorObjectModel = (id: string): ModelLink => decorObject(id).model;

/** How many tiles a decorative object fills across its front (DecorObjectData.span). */
export const decorObjectSpan = (id: string): number => decorObject(id).span ?? 1;
