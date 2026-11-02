// A zone's clutter: the small decorative objects strewn over its walls and floor (cobwebs, torches, bones, rubble).
// Purely visual, so placed here at draw time, like the terrain, never by the game: seeded by the zone, the same zone
// always looks the same. What may be placed, and how much, comes from its dungeon's config (DungeonConfig.clutter).
import { mulberry32 } from '../core/rng';
import { yawFromGridMove } from '../core/facing';
import type { ModelLink } from '../core/types';
import { isCutWall } from './build';

/** One kind of clutter: the designs to pick from, and the share (0..1) of its candidate tiles that get one. */
export interface ClutterKind {
  links: readonly ModelLink[];
  density: number;
}

export interface ClutterInput {
  cols: number;
  rows: number;
  /** Where it can lie: the zone's floor (walkable tiles; not its obstacles'). */
  floors: ReadonlySet<string>;
  /** The open ground the terrain draws (floor and obstacles): what isn't ground is wall. */
  ground: ReadonlySet<string>;
  /** Tiles nothing goes on or against: doors (a wall tile), the rift's and containers' tiles ('x,y'). */
  blocked: ReadonlySet<string>;
  /** Against the full walls: a floor tile with one directly north (it faces south) or east (it faces west). */
  onWalls?: ClutterKind;
  /** On any floor tile, turned any way. */
  onFloor?: ClutterKind;
  seed: number;
}

/** A piece of clutter on the map: its design, its tile, the way it faces (yaw, radians) and the look it shares. */
export interface PlacedClutter {
  id: string;
  link: ModelLink;
  pos: { x: number; y: number };
  facing: number;
  /**
   * Seeds its look: pieces of a design share one of CLUTTER_LOOKS looks (so a zone builds a few models per design,
   * not one per piece).
   */
  look: string;
}

/** How many looks each clutter design has in a zone. */
export const CLUTTER_LOOKS = 6;

/** Place a zone's clutter (see the file comment). */
export function placeClutter({ cols, rows, floors, ground, blocked, onWalls, onFloor, seed }: ClutterInput): PlacedClutter[] {
  const R = mulberry32(seed ^ 0x2545f491);
  const key = (x: number, y: number) => `${x},${y}`;
  const isGround = (x: number, y: number) => ground.has(key(x, y));
  const inGrid = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows;
  /** A full wall on tile (x, y): wall (not ground, not a door) and not cut down to a stub. */
  const fullWall = (x: number, y: number) => inGrid(x, y) && !isGround(x, y) && !blocked.has(key(x, y)) && !isCutWall(isGround, x, y);
  const out: PlacedClutter[] = [];
  /** About `kind.density` of `spots`, each with a random one of its designs. */
  const strew = (kind: ClutterKind | undefined, spots: { x: number; y: number; facing: number }[], tag: string) => {
    if (!kind?.links.length) return;
    for (const s of spots) {
      if (R() >= kind.density) continue;
      const link = kind.links[Math.floor(R() * kind.links.length)];
      out.push({ id: `${tag}-${s.x},${s.y}`, link, pos: { x: s.x, y: s.y }, facing: s.facing, look: `${link}#${Math.floor(R() * CLUTTER_LOOKS)}` });
    }
  };

  const open: { x: number; y: number }[] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (floors.has(key(x, y)) && !blocked.has(key(x, y))) open.push({ x, y });

  // Against a full wall north (facing south) or east (facing west); a tile with both picks one
  strew(onWalls, open.flatMap(({ x, y }) => {
    const sides = [...(fullWall(x, y - 1) ? [yawFromGridMove(0, 1)] : []), ...(fullWall(x + 1, y) ? [yawFromGridMove(-1, 0)] : [])];
    return sides.length ? [{ x, y, facing: sides[Math.floor(R() * sides.length)] }] : [];
  }), 'wall');
  strew(onFloor, open.map(({ x, y }) => ({ x, y, facing: R() * Math.PI * 2 })), 'ground');
  return out;
}
