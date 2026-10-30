import { keyPos, neighbors, posKey, type Pos } from './grid';
import { decorObjectSpan } from './decorObjects';

// ─── The Sanctum: fixed, hand-authored hub map (never procedurally generated) ──
// On screen north is up-left (-y) and east up-right (+x). The main room (9 x 9), a hallway 3 wide and 3 long
// leaving the middle of its east side, and a small room (5 x 5) at the hallway's end, where the Rifter stands
// against the east wall, facing west. Everything else is wall.

/** A rectangle of floor tiles: its top-left tile and its size. */
interface FloorRect { x: number; y: number; w: number; h: number }

/**
 * Wall all around the Sanctum beyond the walls of its rooms, in tiles: room for its fog to fade to black at the
 * map's edges (SANCTUM_SHOWN), hiding the grid's hard edge. The layout below is laid out from its corner.
 */
const MARGIN = 3;
const at = (x: number, y: number) => ({ x: MARGIN + x, y: MARGIN + y });

/** The Sanctum's floor: its rooms and the hallway between them. */
const AREAS: Record<'main' | 'hallway' | 'east', FloorRect> = {
  main: { ...at(1, 1), w: 9, h: 9 },
  hallway: { ...at(10, 4), w: 3, h: 3 },  // from the main room's east wall, centered on its middle row
  east: { ...at(13, 3), w: 5, h: 5 },     // centered on the hallway
};

export const SANCTUM = {
  width: 19 + 2 * MARGIN,
  height: 11 + 2 * MARGIN,
  playerStart: at(5, 5),
  followerStarts: [at(6, 5), at(7, 5)],
  /**
   * The Rifter (INTERACTIVE_OBJECTS 'rifter'): its middle tile, and the grid direction it faces (its front, where the party
   * uses it from). Centered against the east room's east wall, facing west, its three tiles along the wall.
   */
  rifter: { pos: at(17, 5), facing: [-1, 0] as const },
  /** Where the party arrives back from a dungeon (by a rift, or waking after a wipe): in front of the Rifter, in a line facing it, leader first. */
  riftArrival: [at(15, 5), at(14, 5), at(13, 5)],
  /**
   * The NPCs standing in the Sanctum (data/world/npcs.ts): each one's tile, and the grid direction it faces when no
   * one is talking to it. Denisel, the vendor: in the main room's northwest corner, a tile in from both walls,
   * facing into the room.
   */
  npcs: [{ id: 'denisel', pos: at(2, 2), facing: [1, 1] as const }],
  /**
   * The decorative objects in the Sanctum (data/world/decorObjects.ts): each one's middle tile and the grid direction
   * it faces (its front). It fills its span's tiles (spanTiles), which nobody walks onto.
   */
  decor: [
    // Denisel's cart, behind him along the west wall (its two tiles at x 1, y 1-2), facing into the room: its pole
    // toward the north wall, its open back beside him
    { id: 'merchants-cart', pos: at(1, 2), facing: [1, 0] as const },
    // Barrels and sacks a tile north of Denisel, by the cart's pole: facing east, so the barrels (at the model's back
    // left) stand in the tile's northwest corner and the sacks spill out to the southeast
    { id: 'barrels-and-sacks', pos: at(2, 1), facing: [1, 0] as const },
    // The weapon rack against the north wall beside the barrels, its weapons facing south into the room
    { id: 'weapon-rack', pos: at(3, 1), facing: [0, 1] as const },
  ] as readonly DecorPlacement[],
} as const;

/** Where a map places a decorative object (DECOR_OBJECTS id): its middle tile, and the grid direction its front faces. */
export interface DecorPlacement {
  id: string;
  pos: Pos;
  facing: readonly [number, number];
}

/** A Sanctum NPC's placement (SANCTUM.npcs). */
export type NpcPlacement = (typeof SANCTUM.npcs)[number];

/** The Sanctum NPC standing on `p`, if any. */
export const sanctumNpcAt = (p: Pos): NpcPlacement | undefined => SANCTUM.npcs.find((n) => n.pos.x === p.x && n.pos.y === p.y);

/** How many tiles the Rifter spans, side by side across the way it faces (its middle tile, and one each side). */
const RIFTER_SPAN = 3;

/**
 * The tiles an object spanning `span` tiles across the way it faces stands on: its middle tile `pos`, and the
 * tiles beside it to its left and right (turned with its facing), e.g. the Rifter's three.
 */
export function spanTiles(pos: Pos, facing: readonly [number, number], span: number): Pos[] {
  const [dx, dy] = facing, side = { x: -dy, y: dx }, half = Math.floor(span / 2);
  return Array.from({ length: span }, (_, i) => ({ x: pos.x + side.x * (i - half), y: pos.y + side.y * (i - half) }));
}

/**
 * The Rifter's key receptacle: the tile on its own left (the party's right, facing it), where the party uses it
 * (the leader beside it opens the Rifter's window).
 */
export const SANCTUM_RECEPTACLE: Pos = (() => {
  const { pos, facing: [dx, dy] } = SANCTUM.rifter;
  return { x: pos.x + dy, y: pos.y - dx };
})();

/** The Rifter's three tiles: nobody walks onto or through them. */
export const SANCTUM_RIFTER_TILES: ReadonlySet<string> = new Set(spanTiles(SANCTUM.rifter.pos, SANCTUM.rifter.facing, RIFTER_SPAN).map(posKey));

/** Every tile the Sanctum's decorative objects fill (each across its span): not walkable. */
export const SANCTUM_DECOR_TILES: ReadonlySet<string> = new Set(
  SANCTUM.decor.flatMap((d) => spanTiles(d.pos, d.facing, decorObjectSpan(d.id)).map(posKey)),
);

/** Keys of the sanctum's floor tiles (its rooms and hallway): for sight and ability areas there. */
export const SANCTUM_FLOORS: ReadonlySet<string> = new Set(
  Object.values(AREAS).flatMap(({ x, y, w, h }) =>
    Array.from({ length: w * h }, (_, i) => posKey({ x: x + (i % w), y: y + Math.floor(i / w) }))),
);

/**
 * What the Sanctum's fog shows: its floor and every wall touching it (diagonally too), always in sight. Its fog
 * isn't fog of war (nothing is hidden); it only darkens the wall mass beyond, as the dungeons' does at their edges.
 */
export const SANCTUM_SHOWN: ReadonlySet<string> = new Set([...SANCTUM_FLOORS].flatMap((key) => [key, ...neighbors(keyPos(key)).map(posKey)]));

/** Anything that isn't the Sanctum's floor is wall. */
export const isSanctumWall = (p: Pos) => !SANCTUM_FLOORS.has(posKey(p));

/** Walls block the way, and so do the Rifter's three tiles and the NPCs. */
export const isSanctumWalkable = (p: Pos) => !isSanctumWall(p) && !SANCTUM_RIFTER_TILES.has(posKey(p)) && !SANCTUM_DECOR_TILES.has(posKey(p)) && !sanctumNpcAt(p);
