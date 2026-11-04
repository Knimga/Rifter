import { keyPos, neighbors, posKey, type Pos } from './grid';
import { decorBlocks, decorObjectSpan } from './decorObjects';
import type { TerrainStyle } from '../../forge/terrain/types';

// ─── The Sanctum: fixed, hand-authored hub map (never procedurally generated) ──
// On screen north is up-left (-y) and east up-right (+x). The main room (9 x 9), and off the middle of each of its
// four sides a wing: a hallway 3 wide and 3 long, and a small room (5 x 5) centered on its end. In the east one the
// Rifter stands against the east wall, facing west. Everything else is wall.

/** A rectangle of floor tiles: its top-left tile and its size. */
interface FloorRect { x: number; y: number; w: number; h: number }

/**
 * Wall all around the Sanctum beyond the walls of its rooms, in tiles: room for its fog to fade to black at the
 * map's edges (SANCTUM_SHOWN), hiding the grid's hard edge.
 */
const MARGIN = 3;
/** How far a wing reaches out past the main room's wall: its hallway (3) and its room (5). */
const WING = 8;
/**
 * The layout's own coordinates: the main room's walls at 0 and 10 each way (its floor 1-9), its wings reaching WING
 * beyond them, all within MARGIN.
 */
const at = (x: number, y: number) => ({ x: MARGIN + WING + x, y: MARGIN + WING + y });
/** A grid tile as `at` writes it (the forge's Maps view reads out the hovered tile so). */
export const sanctumAt = (p: Pos): Pos => ({ x: p.x - MARGIN - WING, y: p.y - MARGIN - WING });

/** The main room's middle tile (each way): the wings leave its sides there. */
const MIDDLE = 5;
/** The wing off the main room's side toward (dx, dy): a 3 x 3 hallway from its wall, a 5 x 5 room centered on its end. */
const wing = (dx: number, dy: number): FloorRect[] => [
  { ...at(MIDDLE + 6 * dx - 1, MIDDLE + 6 * dy - 1), w: 3, h: 3 },
  { ...at(MIDDLE + 10 * dx - 2, MIDDLE + 10 * dy - 2), w: 5, h: 5 },
];

/** The Sanctum's floor: the main room and its four wings (the east one the Rifter's). */
const AREAS: FloorRect[] = [
  { ...at(1, 1), w: 9, h: 9 },
  ...wing(1, 0), ...wing(-1, 0), ...wing(0, -1), ...wing(0, 1),
];

export const SANCTUM = {
  width: 11 + 2 * WING + 2 * MARGIN,
  height: 11 + 2 * WING + 2 * MARGIN,
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
   * Doors in the Sanctum's walls (INTERACTIVE_OBJECTS 'warded-stone-door', the Dark Tunnel's way in), each in its wall
   * tile, the wall opened around it. None can be used yet: one in the middle of the west room's west wall.
   */
  doors: [at(-8, 5)] as readonly Pos[],
  /**
   * Where the party arrives through the west door (from a passage: data/world/dungeons.ts PASSAGES), facing its greeter
   * (doorGreeter): the leader in front of him, the other two a tile back to its right and left.
   */
  doorArrival: [at(-5, 4), at(-6, 5), at(-6, 3)],
  /** Who greets the party coming through the west door: Rix, whose conversation starts at once if it has a quest for it. */
  doorGreeter: 'rix',
  /**
   * The NPCs standing in the Sanctum (data/world/npcs.ts): each one's tile, and the grid direction it faces when no
   * one is talking to it. Denisel, the vendor: in the main room's northwest corner, a tile in from both walls,
   * facing into the room. Lynn, the enchanter: in the opposite (southeast) corner, likewise. Ardas, the sage: in the
   * northeast corner, likewise. Gorn, the earth elemental: in the west room, five tiles east of its heavy door (at the
   * room's east edge, where its hallway comes in), facing the door. Rix: beside him, a tile northwest of him, turned to
   * face the door too (a facing need not be one of the 8 grid steps: his points straight at the door's tile). Ileena, the
   * arcanist: by the Rifter, a tile northwest of its northernmost tile, against the east room's north wall, facing
   * south.
   */
  npcs: [
    { id: 'denisel', pos: at(2, 2), facing: [1, 1] as const },
    { id: 'lynn', pos: at(8, 8), facing: [-1, -1] as const },
    { id: 'ardas', pos: at(8, 2), facing: [-1, 1] as const },
    { id: 'gorn', pos: at(-3, 5), facing: [-1, 0] as const },
    { id: 'rix', pos: at(-4, 4), facing: [-4, 1] as const },
    { id: 'ileena', pos: at(16, 3), facing: [0, 1] as const },
  ] as readonly NpcPlacement[],
  /**
   * The decorative objects in the Sanctum (data/world/decorObjects.ts): each one's middle tile and the grid direction
   * it faces (its front), and optionally the look picked for it in the forge (`seed`). It fills its span's tiles
   * (spanTiles), which nobody walks onto; clutter (the wall sigils, the seal: decorBlocks) fills none, so it can stand on
   * any floor tile, a wall clutter one facing away from the wall behind it.
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
    // Lynn's table against the east wall (its three tiles at x 9, y 7-9), facing west into the room: its middle, the
    // ritual circle, right beside her
    { id: 'enchanters-table', pos: at(9, 8), facing: [-1, 0] as const },
    // Her supplies a tile south of her, the chest's back against the south wall, the barrel and sacks facing north
    { id: 'enchanters-supplies', pos: at(8, 9), facing: [0, -1] as const },
    // The old seal carved into the floor in the middle of the main room (5 x 5 tiles around its middle tile). Ground
    // clutter: walked over freely
    { id: 'large-arcane-seal', pos: at(MIDDLE, MIDDLE), facing: [0, 1] as const },
    // The reading table east of Ardas, against the east wall, facing south (yaw 0): its chair pulled out toward the room
    { id: 'round-reading-table', pos: at(9, 2), facing: [0, 1] as const },
    // The sage's bookshelf just north of Ardas, its back against the north wall, facing south into the room
    { id: 'sages-bookshelf', pos: at(8, 1), facing: [0, 1] as const },
    // A stack of crates in the main room's northeast corner, behind Ardas, facing south (yaw 0; the look picked in the
    // forge: seed 10)
    { id: 'crate-stack', pos: at(9, 1), facing: [0, 1] as const, seed: 10 },
    // Rix's ore bench behind him, its back against the west room's north wall (its two tiles at x -4 and -3, y 3),
    // facing south into the room: the first thing seen past him, coming in through the door
    { id: 'ore-bench', pos: at(-4, 3), facing: [0, 1] as const },
    // A brown stone cairn beside his bench, at its west end against the north wall
    { id: 'brown-stone-cairn', pos: at(-5, 3), facing: [0, 1] as const },
    // A floor torch in the west room's southeast corner, lighting it from across Gorn
    { id: 'floor-torch', pos: at(-3, 7), facing: [0, 1] as const },
    // A stack of crates in the east room's northeast corner, beside Ileena, facing south
    { id: 'crate-stack', pos: at(17, 3), facing: [0, 1] as const },
    // Ileena's research table west of her, against the east room's north wall (its two tiles at x 14 and 15, y 3),
    // facing south into the room; her book stacks on the floor beside it, at its west end
    { id: 'arcane-research-table', pos: at(14, 3), facing: [0, 1] as const },
    { id: 'book-stacks', pos: at(13, 3), facing: [0, 1] as const },

    // Faded wall sigils: two or three in every room, on the walls seen at full height (north and east), and on the walls
    // by the NPCs. Each with its look picked by seed, so a large one never runs past a corner or across a doorway, and
    // one behind furniture rises above it. Facing away from their wall: south on a north wall, west on an east one
    // The main room: in its northwest corner behind Denisel's cart (a narrow, tall one: it would run past the corner),
    // above Ardas's bookshelf, on the east wall beside him (above the reading table), and a small one by the southeast
    // corner, above the end of Lynn's table
    { id: 'faded-wall-sigil', pos: at(1, 1), facing: [0, 1] as const, seed: 39 },
    { id: 'faded-wall-sigil', pos: at(8, 1), facing: [0, 1] as const, seed: 10 },
    { id: 'faded-wall-sigil', pos: at(9, 2), facing: [-1, 0] as const, seed: 25 },
    { id: 'faded-wall-sigil', pos: at(9, 9), facing: [-1, 0] as const, seed: 17 },
    // The east (Rifter's) room: two on its north wall, and on its east wall a small one each side of the Rifter
    { id: 'faded-wall-sigil', pos: at(14, 3), facing: [0, 1] as const, seed: 9 },
    { id: 'faded-wall-sigil', pos: at(16, 3), facing: [0, 1] as const, seed: 5 },
    { id: 'faded-wall-sigil', pos: at(17, 3), facing: [-1, 0] as const, seed: 22 },
    { id: 'faded-wall-sigil', pos: at(17, 7), facing: [-1, 0] as const, seed: 2 },
    // The north room
    { id: 'faded-wall-sigil', pos: at(4, -7), facing: [0, 1] as const, seed: 37 },
    { id: 'faded-wall-sigil', pos: at(6, -7), facing: [0, 1] as const, seed: 4 },
    { id: 'faded-wall-sigil', pos: at(7, -5), facing: [-1, 0] as const, seed: 28 },
    // The west room
    { id: 'faded-wall-sigil', pos: at(-6, 3), facing: [0, 1] as const, seed: 32 },
    { id: 'faded-wall-sigil', pos: at(-4, 3), facing: [0, 1] as const, seed: 16 },
    // The south room: a small one on the short stretch of north wall beside its doorway, two on its east wall
    { id: 'faded-wall-sigil', pos: at(3, 13), facing: [0, 1] as const, seed: 3 },
    { id: 'faded-wall-sigil', pos: at(7, 14), facing: [-1, 0] as const, seed: 21 },
    { id: 'faded-wall-sigil', pos: at(7, 16), facing: [-1, 0] as const, seed: 23 },
  ] as readonly DecorPlacement[],
} as const;

/**
 * The Sanctum's look (forge/terrain, as a dungeon's DungeonConfig.terrain): dark blue-violet stone, its walls finely
 * carved (rough, barely uneven), its floor of great fitted stones, darker than the walls.
 */
export const SANCTUM_TERRAIN: TerrainStyle = {
  floor: { color: [20, 20, 30], seam: [14, 14, 24], pattern: 'cyclopean', bumpiness: 0.4 },
  walls: { color: [40, 40, 70], finish: 'rough', height: 'high', bumpiness: 0.1 },
};

/**
 * Where a map places a decorative object (DECOR_OBJECTS id): its middle tile, and the grid direction its front faces.
 * `seed`: the look of it picked in the forge (its seed there), instead of one seeded from where it stands.
 */
export interface DecorPlacement {
  id: string;
  pos: Pos;
  facing: readonly [number, number];
  seed?: number;
}

/** Where a map places an NPC (NPCS id): its tile, and the grid direction it faces when no one is talking to it. */
export interface NpcPlacement {
  id: string;
  pos: Pos;
  facing: readonly [number, number];
}

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

/** Every tile the Sanctum's decorative objects fill (each across its span; clutter, e.g. its wall sigils, fills none): not walkable. */
export const SANCTUM_DECOR_TILES: ReadonlySet<string> = new Set(
  SANCTUM.decor.filter((d) => decorBlocks(d.id)).flatMap((d) => spanTiles(d.pos, d.facing, decorObjectSpan(d.id)).map(posKey)),
);

/** Keys of the sanctum's floor tiles (its rooms and hallways): for sight and ability areas there. */
export const SANCTUM_FLOORS: ReadonlySet<string> = new Set(
  AREAS.flatMap(({ x, y, w, h }) =>
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
